import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClientAndGetUser } from '@/lib/supabase/server'
import { canDoHrOffice, normalizeRole } from '@/lib/loan-workflow'

export async function POST(request: NextRequest) {
  try {
    const { loan_request_id, hr_loan_office_memo } = await request.json()

    if (!loan_request_id) {
      return NextResponse.json({ error: 'loan_request_id is required' }, { status: 400 })
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

    // Fetch the loan request to verify it exists and get current status
    const { data: loanRequest, error: fetchError } = await admin
      .from('loan_requests')
      .select('*')
      .eq('id', loan_request_id)
      .single()

    if (fetchError || !loanRequest) {
      return NextResponse.json({ error: 'Loan request not found' }, { status: 404 })
    }

    // Verify loan is in pending_hr_loan_office status
    if (loanRequest.status !== 'pending_hr_loan_office') {
      return NextResponse.json(
        { error: `Loan must be in pending_hr_loan_office status. Current status: ${loanRequest.status}` },
        { status: 400 }
      )
    }

    // Recompute Salary Advance from the verified basic salary and requested
    // multiplier so the handoff and memo never persist the loan-type default.
    const loanType = String(loanRequest.loan_type_key || loanRequest.loan_type || loanRequest.loan_type_label || '').toLowerCase().replace(/[\s-]+/g, '_')
    const salaryFromFdNote = String(loanRequest.fd_note || '').match(/Consolidated Monthly Salary:\s*(?:GHc|GHS|₵)\s*([\d,]+(?:\.\d+)?)/i)?.[1]
    const basicSalary = Number(salaryFromFdNote?.replace(/,/g, '') || loanRequest.basic_salary)
    const multiplier = Number(
      loanRequest.salary_advance_multiplier ?? loanRequest.deduction_period_months ?? loanRequest.repayment_duration_months ?? loanRequest.recovery_months,
    )
    const isSalaryAdvance = loanType.includes('salary_advance') || (loanType.includes('salary') && loanType.includes('advance'))
    const calculatedSalaryAdvance = isSalaryAdvance && Number.isFinite(basicSalary) && basicSalary > 0 && Number.isFinite(multiplier) && multiplier > 0
      ? Math.round(basicSalary * Math.trunc(multiplier) * 100) / 100
      : null

    // HR Loan Office forwards first to the HR Executive stage. The HR Executive
    // then approves and advances the request to the Director HR/MD stage.
    const now = new Date().toISOString()
    const { data: updatedLoan, error: updateError } = await admin
      .from('loan_requests')
      .update({
        ...(calculatedSalaryAdvance == null ? {} : {
          salary_advance_amount: calculatedSalaryAdvance,
          requested_amount: calculatedSalaryAdvance,
          fixed_amount: calculatedSalaryAdvance,
        }),
        status: 'awaiting_hr_executives',
        director_hr_id: null,
        hr_note: memo,
        hr_officer_id: user.id,
        hr_forwarded_at: now,
        updated_at: now,
      })
      .eq('id', loan_request_id)
      .select()
      .single()

    if (updateError) {
      console.error('[v0] Error updating loan status:', updateError)
      return NextResponse.json({ error: 'Failed to update loan status', details: updateError.message }, { status: 500 })
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
