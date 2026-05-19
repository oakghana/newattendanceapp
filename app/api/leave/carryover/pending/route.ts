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
    const status = searchParams.get('status') || 'ALL'
    const leaveYear = searchParams.get('leave_year')
    const location = searchParams.get('location')
    const department = searchParams.get('department')
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    // Auto-approve all pending carryover records from HR Leave Office
    // Get all pending records and auto-approve them
    const { data: pendingRecords, error: pendingError } = await supabase
      .from('outstanding_leave_balances')
      .select('id, user_id, carryover_to_next_year')
      .gt('carryover_to_next_year', 0)
      .is('status', null) // Status is null (pending)
      .eq('leave_year_period', leaveYear || new Date().getFullYear().toString() + '-' + (new Date().getFullYear() + 1).toString())

    if (!pendingError && pendingRecords && pendingRecords.length > 0) {
      console.log(`[v0] Auto-approving ${pendingRecords.length} pending carryover records`)
      for (const record of pendingRecords) {
        try {
          await supabase
            .from('outstanding_leave_balances')
            .update({
              status: 'APPROVED',
              approved_by: 'system-auto-approve',
              approved_at: new Date().toISOString(),
              notes: `Auto-approved: ${record.carryover_to_next_year} days carryover. Reason: System auto-approval for HR Leave Office submission.`,
            })
            .eq('id', record.id)
        } catch (approveErr) {
          console.error('[v0] Error auto-approving record:', record.id, approveErr)
        }
      }
    }

    // Query outstanding_leave_balances which contains the actual carryover data
    // The column is 'carryover_to_next_year', not 'carryover_days'
    let query = supabase
      .from('outstanding_leave_balances')
      .select(`
        id,
        user_id,
        leave_year_period,
        opening_balance,
        entitlement_days,
        carryover_to_next_year,
        max_carryover_allowed,
        notes,
        created_at
      `, { count: 'exact' })
      .gt('carryover_to_next_year', 0) // Only records with carryover - correct column name
      .order('created_at', { ascending: false })

    if (leaveYear) {
      query = query.eq('leave_year_period', leaveYear)
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('[v0] Carryover pending fetch error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Transform data to match expected carryover request format
    // We'll fetch user info separately for each record
    const carryoverRequests = await Promise.all(
      (data || []).map(async (record: any) => {
        try {
          // Fetch user profile for this record
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('first_name, last_name, employee_id, departments(name), locations:assigned_location_id(name)')
            .eq('id', record.user_id)
            .single()

          return {
            id: record.id,
            staff_id: record.user_id,
            leave_year: record.leave_year_period,
            leave_type_key: 'annual',
            balance_available: record.opening_balance || 0,
            max_carryover_allowed: record.max_carryover_allowed || 30,
            requested_carryover_days: record.carryover_to_next_year || 0,
            status: 'PENDING',
            requested_at: record.created_at,
            approval_note: record.notes || '',
            staff: {
              email: '',
              first_name: userProfile?.first_name || '',
              last_name: userProfile?.last_name || '',
              employee_id: userProfile?.employee_id || '',
              department: userProfile?.departments?.name || '',
              location: userProfile?.locations?.name || '',
            },
          }
        } catch (err) {
          console.error('[v0] Error fetching user profile for:', record.user_id, err)
          return {
            id: record.id,
            staff_id: record.user_id,
            leave_year: record.leave_year_period,
            leave_type_key: 'annual',
            balance_available: record.opening_balance || 0,
            max_carryover_allowed: record.max_carryover_allowed || 30,
            requested_carryover_days: record.carryover_to_next_year || 0,
            status: 'PENDING',
            requested_at: record.created_at,
            approval_note: record.notes || '',
            staff: {
              email: '',
              first_name: '',
              last_name: '',
              employee_id: '',
              department: '',
              location: '',
            },
          }
        }
      })
    )

    // Apply location/department filters
    let filteredData = carryoverRequests
    if (location) {
      filteredData = filteredData.filter((r: any) => r.staff.location === location)
    }
    if (department) {
      filteredData = filteredData.filter((r: any) => r.staff.department === department)
    }

    // Filter by status
    if (status !== 'ALL') {
      filteredData = filteredData.filter((r: any) => r.status === status)
    }

    // Calculate stats
    const stats = {
      pending: filteredData.filter((r: any) => r.status === 'PENDING').length,
      approved: filteredData.filter((r: any) => r.status === 'APPROVED').length,
      rejected: filteredData.filter((r: any) => r.status === 'REJECTED').length,
      totalDays: filteredData.reduce((sum: number, r: any) => sum + r.requested_carryover_days, 0),
    }

    return NextResponse.json({
      carryover_requests: filteredData,
      stats,
      total: count || 0,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('[v0] Carryover pending error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending carryover requests' },
      { status: 500 }
    )
  }
}
