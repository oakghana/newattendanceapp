import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClientAndGetUser } from '@/lib/supabase/server'
import { canDoHrOffice, normalizeRole } from '@/lib/loan-workflow'
import { calculateSalaryAdvance } from '@/lib/salary-advance'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const loanRequestIds = Array.isArray(body.loan_request_ids)
      ? body.loan_request_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : body.loan_request_id ? [String(body.loan_request_id).trim()] : []
    const { hr_loan_office_memo, reference_number, action, recovery_months } = body

    if (loanRequestIds.length === 0) {
      return NextResponse.json({ error: 'At least one loan request is required' }, { status: 400 })
    }
    if (loanRequestIds.length > 100) {
      return NextResponse.json({ error: 'You can forward a maximum of 100 loans at once' }, { status: 400 })
    }

    const memo = String(hr_loan_office_memo || '').trim()
    if (!memo) {
      return NextResponse.json({ error: 'HR Loan Office processing memo is required' }, { status: 400 })
    }

    const { user, authError } = await createClientAndGetUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = await createAdminClient()
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role, departments(name, code)')
      .eq('id', user.id)
      .single()

    const role = normalizeRole(profile?.role)
    const department = (profile as unknown as {
      departments?: { name?: string | null; code?: string | null } | null
    } | null)?.departments
    if (!canDoHrOffice(role, department?.name, department?.code)) {
      return NextResponse.json({ error: 'Only HR Loan Office users can push loans to HR Executive' }, { status: 403 })
    }

    // Bulk forwarding uses the same status guard as the single-record flow.
    if (loanRequestIds.length > 1) {
      if (action !== 'push_to_hr_executive') {
        return NextResponse.json({ error: 'Bulk forwarding only supports sending loans to HR Executive' }, { status: 400 })
      }
      const { data: loans, error: bulkFetchError } = await admin
        .from('loan_requests')
        .select('id, status')
        .in('id', loanRequestIds)
      if (bulkFetchError || !loans || loans.length !== loanRequestIds.length) {
        return NextResponse.json({ error: 'One or more selected loans could not be found' }, { status: 404 })
      }
      const invalidLoans = loans.filter((loan) => loan.status !== 'pending_hr_loan_office')
      if (invalidLoans.length > 0) {
        return NextResponse.json({ error: `${invalidLoans.length} selected loan(s) are no longer awaiting HR Loan Office review. Refresh and try again.` }, { status: 409 })
      }
      const now = new Date().toISOString()
      const { data: updatedLoans, error: bulkUpdateError } = await admin
        .from('loan_requests')
        .update({ status: 'awaiting_hr_executives', director_hr_id: null, hr_note: memo, hr_officer_id: user.id, hr_forwarded_at: now, updated_at: now })
        .in('id', loanRequestIds)
        .eq('status', 'pending_hr_loan_office')
        .select('id')
      if (bulkUpdateError || !updatedLoans || updatedLoans.length !== loanRequestIds.length) {
        return NextResponse.json({ error: 'Some selected loans were already processed. Refresh and try again.' }, { status: 409 })
      }
      await admin.from('loan_request_timeline').insert(loanRequestIds.map((loan_request_id: string) => ({
        loan_request_id, actor_id: user.id, actor_role: role || 'hr_loan_office', action_key: 'pushed_to_hr_executive',
        from_status: 'pending_hr_loan_office', to_status: 'awaiting_hr_executives', note: `HR Loan Office bulk-forwarded this approved FD loan to HR Executive. Memo: ${memo}`,
      })))
      return NextResponse.json({ success: true, count: loanRequestIds.length, message: `${loanRequestIds.length} loans pushed to HR Executive` })
    }

    const loan_request_id = loanRequestIds[0]
    // Fetch the loan request to verify it exists and get current status
    const { data: loanRequest, error: fetchError } = await admin
      .from('loan_requests')
      .select('*')
      .eq('id', loan_request_id)
      .single()

    if (fetchError || !loanRequest) {
      return NextResponse.json({ error: 'Loan request not found' }, { status: 404 })
    }

    if (action === 'return_to_accounts') {
      if (!memo) return NextResponse.json({ error: 'Correction details are required' }, { status: 400 })
      if (loanRequest.status !== 'pending_hr_loan_office') {
        return NextResponse.json({ error: `Loan must be awaiting HR Loan Office review. Current status: ${loanRequest.status}` }, { status: 400 })
      }
      const now = new Date().toISOString()
      const { data: updatedLoan, error: updateError } = await admin
        .from('loan_requests')
        .update({
          // Return to the Accounts Office calculation queue, not the Accounts Executive review queue.
          status: 'sent_to_accounts',
          fd_score: null,
          fd_good: null,
          fd_checked_at: null,
          fd_note: null,
          // Keep ordinary HR loan terms separate from an explicit FD correction reason.
          hr_note: `FD_CORRECTION_REQUIRED: ${memo}`,
          updated_at: now,
        })
        .eq('id', loan_request_id)
        .eq('status', 'pending_hr_loan_office')
        .select()
        .single()
      if (updateError || !updatedLoan) return NextResponse.json({ error: 'This FD record was already processed or could not be returned.' }, { status: 409 })
      await admin.from('loan_request_timeline').insert({
        loan_request_id,
        actor_id: user.id,
        actor_role: role || 'hr_loan_office',
        action_key: 'fd_returned_to_accounts',
        from_status: 'pending_hr_loan_office',
        to_status: 'sent_to_accounts',
        note: `HR Loan Office returned the FD calculation to the Accounts Office to restart the calculation: ${memo}`,
      })
      return NextResponse.json({ success: true, loan: updatedLoan, message: 'FD calculation returned to Accounts for correction.' })
    }

    // Verify loan is in pending_hr_loan_office status
    if (loanRequest.status !== 'pending_hr_loan_office') {
      return NextResponse.json(
        { error: `Loan must be in pending_hr_loan_office status. Current status: ${loanRequest.status}` },
        { status: 400 }
      )
    }

    // Recompute Salary Advance from verified annual salary and requested months.
    const loanType = String(loanRequest.loan_type_key || loanRequest.loan_type || loanRequest.loan_type_label || '').toLowerCase()
    const enteredRecoveryMonths = Number(recovery_months)
    const multiplier = Number.isInteger(enteredRecoveryMonths) && enteredRecoveryMonths > 0
      ? enteredRecoveryMonths
      : Number(
          loanRequest.salary_advance_multiplier ?? loanRequest.deduction_period_months ?? loanRequest.repayment_duration_months ?? loanRequest.recovery_months,
        )
    const isSalaryAdvance = loanType.includes('salary') && loanType.includes('advance')
    const noteText = String(loanRequest.fd_note || '')
    const salaryFromNote = noteText.match(/salary(?: per annum| per year| annually)?[^0-9]*([0-9][0-9,]*(?:\\.[0-9]+)?)/i)?.[1]
    const monthlySalary = Number(loanRequest.basic_salary)
    const annualSalary = Number(loanRequest.annual_salary) > 0
      ? Number(loanRequest.annual_salary)
      : monthlySalary > 0
        ? monthlySalary * 12
        : salaryFromNote
          ? Number(salaryFromNote.replace(/,/g, ''))
          : null
    const calculatedSalaryAdvance = isSalaryAdvance
      ? calculateSalaryAdvance(annualSalary, multiplier)
      : null
    if (isSalaryAdvance && !calculatedSalaryAdvance) {
      return NextResponse.json({ error: 'Accounts must provide a valid annual salary before this salary advance can be forwarded.' }, { status: 400 })
    }

    // HR Loan Office forwards first to the HR Executive stage. The HR Executive
    // then approves and advances the request to the Director HR/MD stage.
    const now = new Date().toISOString()
    const { data: updatedLoan, error: updateError } = await admin
      .from('loan_requests')
      .update({
        ...(String(reference_number || '').trim() ? { reference_number: String(reference_number).trim() } : {}),
        ...(calculatedSalaryAdvance == null ? {} : {
          basic_salary: calculatedSalaryAdvance.monthlySalary,
          salary_advance_multiplier: calculatedSalaryAdvance.requestedMonths,
          deduction_period_months: calculatedSalaryAdvance.requestedMonths,
          repayment_duration_months: calculatedSalaryAdvance.requestedMonths,
          recovery_months: calculatedSalaryAdvance.requestedMonths,
          salary_advance_amount: calculatedSalaryAdvance.amount,
          requested_amount: calculatedSalaryAdvance.amount,
          fixed_amount: calculatedSalaryAdvance.amount,
        }),
        status: 'awaiting_hr_executives',
        director_hr_id: null,
        hr_note: memo,
        hr_officer_id: user.id,
        hr_forwarded_at: now,
        updated_at: now,
      })
      .eq('id', loan_request_id)
      .eq('status', 'pending_hr_loan_office')
      .select()
      .single()

    if (updateError) {
      console.error('[v0] Error updating loan status:', updateError)
      return NextResponse.json({ error: 'Failed to update loan status', details: updateError.message }, { status: 500 })
    }
    if (!updatedLoan) {
      return NextResponse.json({ error: 'This loan was already forwarded. Refresh and try again.' }, { status: 409 })
    }

    // Log to loan_request_timeline for audit trail
    const { error: timelineError } = await admin
      .from('loan_request_timeline')
      .insert({
        loan_request_id: loan_request_id,
        actor_id: user.id,
        actor_role: role || 'hr_loan_office',
        action_key: 'pushed_to_hr_executive',
        from_status: 'pending_hr_loan_office',
        to_status: 'awaiting_hr_executives',
        note: `HR Loan Office pushed approved FD loan to HR Executive for signing and approval. Memo: ${memo}`,
      })

    if (timelineError) {
      console.warn('[v0] Timeline log error (non-critical):', timelineError)
    }

    return NextResponse.json({
      success: true,
      loan: updatedLoan,
      message: 'Loan pushed to HR Executive for signing. Will be forwarded to MD dashboard after HR Executive approval.',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    console.error('[v0] Push to HR Executive error:', errorMessage)
    return NextResponse.json(
      {
        error: 'Failed to push loan to HR Executive',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}
