import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const transactionType = searchParams.get('transaction_type')
    const leaveYear = searchParams.get('leave_year')
    const format = searchParams.get('format') || 'json' // json or csv

    // Query outstanding_leave_balances for carryover data
    let outstandingQuery = supabase
      .from('outstanding_leave_balances')
      .select(`
        *,
        user_profiles!outstanding_leave_balances_user_id_fkey (
          first_name,
          last_name,
          employee_id,
          departments (name)
        )
      `)
      .order('created_at', { ascending: false })

    if (leaveYear) {
      outstandingQuery = outstandingQuery.eq('leave_year_period', leaveYear)
    }

    if (startDate) {
      outstandingQuery = outstandingQuery.gte('created_at', new Date(startDate).toISOString())
    }

    if (endDate) {
      outstandingQuery = outstandingQuery.lte('created_at', new Date(endDate).toISOString())
    }

    const { data: outstandingData, error: outstandingError } = await outstandingQuery.limit(1000)

    if (outstandingError) {
      console.error('[v0] Outstanding fetch error:', outstandingError)
    }

    // Query approved leave requests to calculate leave taken
    let leaveQuery = supabase
      .from('leave_plan_requests')
      .select(`
        *,
        user_profiles (
          first_name,
          last_name,
          employee_id,
          departments (name)
        )
      `)
      .eq('final_status', 'approved')
      .order('created_at', { ascending: false })

    if (leaveYear) {
      leaveQuery = leaveQuery.eq('leave_year_period', leaveYear)
    }

    if (startDate) {
      leaveQuery = leaveQuery.gte('created_at', new Date(startDate).toISOString())
    }

    if (endDate) {
      leaveQuery = leaveQuery.lte('created_at', new Date(endDate).toISOString())
    }

    const { data: leaveData, error: leaveError } = await leaveQuery.limit(1000)

    if (leaveError) {
      console.error('[v0] Leave requests fetch error:', leaveError)
    }

    // Transform outstanding balances to transactions
    const carryoverTransactions = (outstandingData || []).map((record: any) => ({
      id: record.id,
      created_at: record.created_at,
      staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
      employee_id: record.user_profiles?.employee_id || '',
      department: record.user_profiles?.departments?.name || '',
      leave_year: record.leave_year_period,
      leave_type: 'annual',
      transaction_type: record.carryover_days > 0 ? 'CARRYOVER' : 'OUTSTANDING',
      days_change: record.carryover_days || record.outstanding_days || 0,
      running_balance: record.outstanding_days || 0,
      reason_code: record.hr_approved ? 'HR_APPROVED' : 'PENDING_APPROVAL',
      notes: record.notes || '',
      status: record.hr_approved ? 'APPROVED' : 'PENDING',
    }))

    // Transform approved leaves to transactions
    const leaveTransactions = (leaveData || []).map((record: any) => ({
      id: record.id,
      created_at: record.created_at,
      staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
      employee_id: record.user_profiles?.employee_id || '',
      department: record.user_profiles?.departments?.name || '',
      leave_year: record.leave_year_period,
      leave_type: record.leave_type_key || 'annual',
      transaction_type: 'LEAVE_TAKEN',
      days_change: -(record.final_approved_days || record.requested_days || 0),
      running_balance: 0,
      reason_code: 'LEAVE_APPROVED',
      notes: record.reason_for_leave || '',
      status: 'APPROVED',
    }))

    // Combine and sort by date
    let allTransactions = [...carryoverTransactions, ...leaveTransactions]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Filter by transaction type if specified
    if (transactionType && transactionType !== 'ALL') {
      allTransactions = allTransactions.filter(t => t.transaction_type === transactionType)
    }

    if (format === 'csv') {
      // Convert to CSV
      const headers = [
        'Date',
        'Staff Name',
        'Employee ID',
        'Department',
        'Leave Year',
        'Leave Type',
        'Transaction Type',
        'Days Change',
        'Balance',
        'Reason',
        'Notes',
        'Status',
      ]

      const rows = allTransactions.map((t: any) => [
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
        t.status,
      ])

      const csv = [
        headers.join(','),
        ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="leave-audit-report.csv"',
        },
      })
    }

    // Calculate summary stats
    const totalDaysTaken = leaveTransactions.reduce((sum, t) => sum + Math.abs(t.days_change), 0)
    const totalCarryovers = carryoverTransactions.filter(t => t.transaction_type === 'CARRYOVER').length
    const totalCarryoverDays = carryoverTransactions
      .filter(t => t.transaction_type === 'CARRYOVER')
      .reduce((sum, t) => sum + t.days_change, 0)

    return NextResponse.json({
      transactions: allTransactions,
      total: allTransactions.length,
      summary: {
        total_days_taken: totalDaysTaken,
        days_forfeited: 0, // Not tracking forfeitures yet
        carryovers_approved: totalCarryovers,
        total_carryover_days: totalCarryoverDays,
        adjustments_made: 0,
      }
    })
  } catch (error: any) {
    console.error('[v0] Audit report error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate audit report' },
      { status: 500 }
    )
  }
}
