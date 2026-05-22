import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const leaveYear = searchParams.get('leave_year') || '2025/2026'
    const transactionType = searchParams.get('transaction_type')
    const format = searchParams.get('format') || 'json'

    // Fetch leave balance transactions - this is the primary audit trail
    const { data: balanceTransactions, error: balanceError } = await admin
      .from('leave_balance_transactions')
      .select('*')
      .eq('leave_year', leaveYear)
      .order('created_at', { ascending: false })
      .limit(500)

    if (balanceError) {
      console.error('[v0] Balance transactions fetch error:', balanceError)
    }

    // Fetch leave plan requests for approved leave records
    const { data: leaveRequests, error: leaveError } = await admin
      .from('leave_plan_requests')
      .select(`
        id,
        user_id,
        leave_type_key,
        leave_year_period,
        requested_days,
        adjusted_days,
        preferred_start_date,
        preferred_end_date,
        status,
        is_carry_over_leave,
        reason,
        created_at,
        hr_approved_at
      `)
      .eq('leave_year_period', leaveYear)
      .in('status', ['hr_approved', 'approved'])
      .order('created_at', { ascending: false })
      .limit(500)

    if (leaveError) {
      console.error('[v0] Leave requests fetch error:', leaveError)
    }

    // Get all unique user IDs
    const userIds = [
      ...new Set([
        ...(balanceTransactions || []).map((t: any) => t.staff_id),
        ...(leaveRequests || []).map((r: any) => r.user_id),
      ].filter(Boolean))
    ]

    // Fetch user profiles
    let profilesMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('user_profiles')
        .select('id, first_name, last_name, employee_id, departments(name)')
        .in('id', userIds)

      if (profiles) {
        profiles.forEach((p: any) => {
          profilesMap[p.id] = p
        })
      }
    }

    // Transform balance transactions
    const balanceTx = (balanceTransactions || []).map((t: any) => {
      const profile = profilesMap[t.staff_id] || {}
      return {
        id: t.id,
        created_at: t.created_at,
        staff_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
        employee_id: profile.employee_id || '',
        department: profile.departments?.name || '',
        leave_year: t.leave_year,
        leave_type: t.leave_type_key || 'annual',
        transaction_type: t.transaction_type || 'ADJUSTMENT',
        days_change: t.days_change || 0,
        running_balance: t.running_balance || 0,
        reason_code: t.reason_code || '',
        notes: t.notes || '',
        status: 'APPROVED',
      }
    })

    // Transform leave requests to transactions
    const leaveTx = (leaveRequests || []).map((r: any) => {
      const profile = profilesMap[r.user_id] || {}
      const days = r.adjusted_days || r.requested_days || 0
      return {
        id: r.id,
        created_at: r.hr_approved_at || r.created_at,
        staff_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
        employee_id: profile.employee_id || '',
        department: profile.departments?.name || '',
        leave_year: r.leave_year_period,
        leave_type: r.leave_type_key || 'annual',
        transaction_type: r.is_carry_over_leave ? 'CARRYOVER' : 'LEAVE_TAKEN',
        days_change: -Math.abs(days),
        running_balance: 0,
        reason_code: 'APPROVED',
        notes: r.reason || '',
        status: 'APPROVED',
      }
    })

    // Combine and sort
    let transactions = [...balanceTx, ...leaveTx]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Filter by transaction type
    if (transactionType && transactionType !== 'ALL') {
      transactions = transactions.filter(t => t.transaction_type === transactionType)
    }

    // Calculate summary
    const totalDaysTaken = transactions
      .filter(t => t.transaction_type === 'LEAVE_TAKEN')
      .reduce((sum, t) => sum + Math.abs(t.days_change), 0)

    const carryovers = transactions.filter(t => t.transaction_type === 'CARRYOVER')
    const adjustments = transactions.filter(t => t.transaction_type === 'ADJUSTMENT')

    if (format === 'csv') {
      const headers = ['Date', 'Staff Name', 'Employee ID', 'Department', 'Leave Year', 'Leave Type', 'Transaction Type', 'Days', 'Balance', 'Reason', 'Notes']
      const rows = transactions.map(t => [
        new Date(t.created_at).toLocaleDateString(),
        t.staff_name,
        t.employee_id,
        t.department,
        t.leave_year,
        t.leave_type,
        t.transaction_type,
        t.days_change,
        t.running_balance,
        t.reason_code,
        t.notes,
      ])

      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="leave-audit-report.csv"',
        },
      })
    }

    return NextResponse.json({
      transactions,
      total: transactions.length,
      summary: {
        total_days_taken: totalDaysTaken,
        days_forfeited: 0,
        carryovers_approved: carryovers.length,
        adjustments_made: adjustments.length,
      },
    })
  } catch (error: any) {
    console.error('[v0] Audit report error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate audit report' },
      { status: 500 }
    )
  }
}
