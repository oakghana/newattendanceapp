import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Fetch active loans
    const { data: loans } = await supabase
      .from('loan_requests')
      .select('id, loan_type_key, requested_amount, repayment_months, monthly_installment, status')
      .eq('user_id', userId)
      .in('status', ['approved', 'pending_hr_loan_office', 'fd_approved', 'awaiting_hr_terms', 'awaiting_director_hr', 'approved_director', 'md_final_approved'])
      .order('created_at', { ascending: false })

    // Fetch active/approved leave records with resumption status
    const { data: leaves } = await supabase
      .from('leave_plan_requests')
      .select(`
        id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        status,
        leave_resumption_notifications (
          first_hod_rm_check_in_date,
          status as resumption_status
        )
      `)
      .eq('user_id', userId)
      .in('status', ['hr_approved', 'director_approved', 'leave_confirmed'])
      .order('preferred_end_date', { ascending: true })

    // Calculate loan metrics
    let totalLoanAmount = 0
    let totalMonthlyDeduction = 0
    const activeLoans = loans || []

    for (const loan of activeLoans) {
      totalLoanAmount += Number(loan.requested_amount || 0)
      totalMonthlyDeduction += Number(loan.monthly_installment || 0)
    }

    // Check for leave resumption warnings
    const leaveWarnings: any[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const leave of leaves || []) {
      const endDate = new Date(leave.preferred_end_date)
      endDate.setHours(0, 0, 0, 0)

      // Check if leave has ended
      if (endDate < today) {
        const notif = Array.isArray(leave.leave_resumption_notifications)
          ? leave.leave_resumption_notifications[0]
          : leave.leave_resumption_notifications

        // If not confirmed/checked in
        if (!notif?.first_hod_rm_check_in_date) {
          const daysOverdue = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))
          leaveWarnings.push({
            leaveType: leave.leave_type_key,
            endDate: leave.preferred_end_date,
            daysOverdue,
            severity: daysOverdue > 5 ? 'critical' : daysOverdue > 2 ? 'warning' : 'info',
          })
        }
      }
    }

    return NextResponse.json({
      loans: {
        active: activeLoans.length,
        total: activeLoans,
        totalAmount: totalLoanAmount,
        monthlyDeduction: totalMonthlyDeduction,
      },
      leaves: {
        active: (leaves || []).length,
        warnings: leaveWarnings,
      },
    })
  } catch (e: any) {
    console.error('[api/dashboard/personal-summary] Error:', e)
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 })
  }
}
