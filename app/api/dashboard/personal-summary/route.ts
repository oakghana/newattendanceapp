import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// All statuses that mean a loan is in-flight (post-HOD-approval through completion)
const ACTIVE_LOAN_STATUSES = [
  'hod_approved',
  'sent_for_fd_approval',
  'fd_approved',
  'pending_hr_loan_office',
  'awaiting_hr_terms',
  'awaiting_director_hr',
  'approved_director',
  'md_final_approved',
  'disbursed',
  'active',
  'repaying',
]

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Correct column names: monthly_deduction, repayment_duration_months
    const { data: loans, error: loansError } = await supabase
      .from('loan_requests')
      .select('id, loan_type_label, loan_type_key, requested_amount, monthly_deduction, repayment_duration_months, expected_completion_date, status')
      .eq('user_id', userId)
      .in('status', ACTIVE_LOAN_STATUSES)
      .order('created_at', { ascending: false })

    if (loansError) {
      console.error('[personal-summary] loans error:', loansError.message)
    }

    // confirmation_status='unconfirmed' + no first_check_in_date = outstanding resumptions
    const { data: resumptions, error: resumptionsError } = await supabase
      .from('leave_resumption_notifications')
      .select('id, leave_end_date, first_check_in_date, first_hod_rm_check_in_date, confirmation_status, days_overdue')
      .eq('user_id', userId)
      .eq('confirmation_status', 'unconfirmed')
      .is('first_check_in_date', null)
      .order('leave_end_date', { ascending: false })

    if (resumptionsError) {
      console.error('[personal-summary] resumptions error:', resumptionsError.message)
    }

    const activeLoans = loans || []
    const totalLoanAmount = activeLoans.reduce((s, l) => s + Number(l.requested_amount || 0), 0)
    const totalMonthlyDeduction = activeLoans.reduce((s, l) => s + Number(l.monthly_deduction || 0), 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const leaveWarnings = (resumptions || []).map(r => {
      const daysOverdue = r.days_overdue != null
        ? Number(r.days_overdue)
        : Math.max(0, Math.floor((today.getTime() - new Date(r.leave_end_date).setHours(0,0,0,0)) / 86400000))
      return {
        leaveEndDate: r.leave_end_date,
        daysOverdue,
        severity: daysOverdue >= 5 ? 'critical' : daysOverdue >= 2 ? 'warning' : 'info',
        hodCheckedIn: !!r.first_hod_rm_check_in_date,
      }
    })

    return NextResponse.json({
      loans: {
        count: activeLoans.length,
        items: activeLoans.map(l => ({
          id: l.id,
          label: l.loan_type_label || l.loan_type_key,
          amount: Number(l.requested_amount || 0),
          monthlyDeduction: Number(l.monthly_deduction || 0),
          durationMonths: l.repayment_duration_months,
          expectedCompletion: l.expected_completion_date,
          status: l.status,
        })),
        totalAmount: totalLoanAmount,
        totalMonthlyDeduction,
      },
      leaves: {
        warnings: leaveWarnings,
      },
    })
  } catch (e: any) {
    console.error('[personal-summary] unexpected error:', e)
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
