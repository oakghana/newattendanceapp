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
    const leaveYear = searchParams.get('leave_year') || '2025/2026'
    const format = searchParams.get('format') || 'json'

    // Query leave_plan_requests for leave taken data
    // This is where the actual leave records are stored
    let leaveQuery = supabase
      .from('leave_plan_requests')
      .select(`
        id,
        user_id,
        leave_type_key,
        leave_year_period,
        requested_days,
        adjusted_days,
        travelling_days_added,
        holiday_days_deducted,
        status,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        reason,
        created_at,
        submitted_at,
        hr_approved_at,
        is_carry_over_leave,
        user_profiles (
          first_name,
          last_name,
          employee_id,
          departments (name)
        )
      `)
      .in('status', ['hr_approved', 'hod_approved', 'hr_office_reviewed', 'pending'])
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

    // Query outstanding_leave_balances for carryover data
    let outstandingQuery = supabase
      .from('outstanding_leave_balances')
      .select(`
        id,
        user_id,
        leave_year_period,
        opening_balance,
        entitlement_days,
        used_this_period,
        carryover_to_next_year,
        max_carryover_allowed,
        notes,
        created_at,
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

    const { data: outstandingData, error: outstandingError } = await outstandingQuery.limit(1000)

    if (outstandingError) {
      console.error('[v0] Outstanding fetch error:', outstandingError)
    }

    // Transform leave requests to transactions
    const leaveTransactions = (leaveData || []).map((record: any) => {
      const days = record.adjusted_days || record.requested_days || 0
      const startDate = record.adjusted_start_date || record.preferred_start_date
      const endDate = record.adjusted_end_date || record.preferred_end_date
      
      return {
        id: record.id,
        created_at: record.hr_approved_at || record.submitted_at || record.created_at,
        staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
        employee_id: record.user_profiles?.employee_id || '',
        department: record.user_profiles?.departments?.name || '',
        leave_year: record.leave_year_period,
        leave_type: record.leave_type_key || 'annual',
        transaction_type: record.is_carry_over_leave ? 'CARRYOVER' : 'LEAVE_TAKEN',
        days_change: -Math.abs(days),
        running_balance: 0,
        reason_code: record.status === 'hr_approved' ? 'APPROVED' : record.status?.toUpperCase() || 'PENDING',
        notes: record.reason || '',
        status: record.status === 'hr_approved' ? 'APPROVED' : record.status?.toUpperCase() || 'PENDING',
        start_date: startDate,
        end_date: endDate,
      }
    })

    // Transform outstanding balances to carryover transactions
    const carryoverTransactions = (outstandingData || [])
      .filter((record: any) => record.carryover_to_next_year > 0)
      .map((record: any) => ({
        id: record.id,
        created_at: record.created_at,
        staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
        employee_id: record.user_profiles?.employee_id || '',
        department: record.user_profiles?.departments?.name || '',
        leave_year: record.leave_year_period,
        leave_type: 'annual',
        transaction_type: 'CARRYOVER',
        days_change: record.carryover_to_next_year || 0,
        running_balance: record.opening_balance || 0,
        reason_code: 'CARRYOVER_BALANCE',
        notes: record.notes || `Carryover from ${record.leave_year_period}`,
        status: 'APPROVED',
      }))

    // Transform outstanding balances to outstanding transactions
    const outstandingTransactions = (outstandingData || [])
      .filter((record: any) => (record.opening_balance - record.used_this_period) > 0)
      .map((record: any) => ({
        id: `outstanding-${record.id}`,
        created_at: record.created_at,
        staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
        employee_id: record.user_profiles?.employee_id || '',
        department: record.user_profiles?.departments?.name || '',
        leave_year: record.leave_year_period,
        leave_type: 'annual',
        transaction_type: 'OUTSTANDING',
        days_change: (record.opening_balance || 0) - (record.used_this_period || 0),
        running_balance: record.opening_balance || 0,
        reason_code: 'OUTSTANDING_BALANCE',
        notes: record.notes || `Outstanding balance for ${record.leave_year_period}`,
        status: 'ACTIVE',
      }))

    // Combine all transactions
    let allTransactions = [
      ...leaveTransactions,
      ...carryoverTransactions,
      ...outstandingTransactions,
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Filter by transaction type if specified
    if (transactionType && transactionType !== 'ALL') {
      allTransactions = allTransactions.filter(t => t.transaction_type === transactionType)
    }

    // Calculate summary stats
    const approvedLeave = leaveTransactions.filter(t => t.status === 'APPROVED')
    const totalDaysTaken = approvedLeave.reduce((sum, t) => sum + Math.abs(t.days_change), 0)
    const totalCarryovers = carryoverTransactions.length
    const totalCarryoverDays = carryoverTransactions.reduce((sum, t) => sum + t.days_change, 0)
    const totalOutstandingDays = outstandingTransactions.reduce((sum, t) => sum + t.days_change, 0)

    if (format === 'csv') {
      const headers = [
        'Date',
        'Staff Name',
        'Employee ID',
        'Department',
        'Leave Year',
        'Leave Type',
        'Transaction Type',
        'Days',
        'Status',
        'Notes',
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
        t.status,
        t.notes,
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

    return NextResponse.json({
      transactions: allTransactions,
      total: allTransactions.length,
      summary: {
        total_days_taken: totalDaysTaken,
        days_forfeited: 0,
        carryovers_approved: totalCarryovers,
        total_carryover_days: totalCarryoverDays,
        total_outstanding_days: totalOutstandingDays,
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
