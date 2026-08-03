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

    // Fetch leave resumption notifications (leaves that have ended and need resumption confirmation)
    const { data: resumptionNotifications } = await supabase
      .from('leave_resumption_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('leave_end_date', { ascending: true })

    // Calculate loan metrics
    let totalLoanAmount = 0
    let totalMonthlyDeduction = 0
    const activeLoans = loans || []

    for (const loan of activeLoans) {
      totalLoanAmount += Number(loan.requested_amount || 0)
      totalMonthlyDeduction += Number(loan.monthly_installment || 0)
    }

    // Check for leave resumption warnings from notifications
    const leaveWarnings: any[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const notif of resumptionNotifications || []) {
      // If not confirmed/checked in
      if (!notif.first_hod_rm_check_in_date && notif.leave_end_date) {
        const endDate = new Date(notif.leave_end_date)
        endDate.setHours(0, 0, 0, 0)

        if (endDate < today) {
          const daysOverdue = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))
          leaveWarnings.push({
            leaveType: 'Leave',
            endDate: notif.leave_end_date,
            daysOverdue,
            severity: daysOverdue >= 5 ? 'critical' : daysOverdue >= 2 ? 'warning' : 'info',
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
        active: (resumptionNotifications || []).length,
        warnings: leaveWarnings,
      },
    })
  } catch (e: any) {
    console.error('[api/dashboard/personal-summary] Error:', e)
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 })
  }
}
