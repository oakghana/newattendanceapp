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

    // Query outstanding_leave_balances which contains the actual carryover data
    let query = supabase
      .from('outstanding_leave_balances')
      .select(`
        *,
        user_profiles!outstanding_leave_balances_user_id_fkey (
          first_name,
          last_name,
          employee_id,
          departments (name),
          locations (name)
        )
      `, { count: 'exact' })
      .gt('carryover_days', 0) // Only records with carryover
      .order('created_at', { ascending: false })

    if (leaveYear) {
      query = query.eq('leave_year_period', leaveYear)
    }

    // Filter by approval status if not ALL
    if (status !== 'ALL') {
      if (status === 'PENDING') {
        query = query.eq('hr_approved', false)
      } else if (status === 'APPROVED') {
        query = query.eq('hr_approved', true)
      }
      // REJECTED not applicable for outstanding_leave_balances
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
    const carryoverRequests = (data || []).map((record: any) => ({
      id: record.id,
      staff_id: record.user_id,
      leave_year: record.leave_year_period,
      leave_type_key: 'annual',
      balance_available: record.outstanding_days || 0,
      max_carryover_allowed: 30, // Default policy max
      requested_carryover_days: record.carryover_days || 0,
      status: record.hr_approved ? 'APPROVED' : 'PENDING',
      requested_at: record.created_at,
      approval_note: record.notes || '',
      staff: {
        email: '',
        first_name: record.user_profiles?.first_name || '',
        last_name: record.user_profiles?.last_name || '',
        employee_id: record.user_profiles?.employee_id || '',
        department: record.user_profiles?.departments?.name || '',
        location: record.user_profiles?.locations?.name || '',
      },
    }))

    // Apply location/department filters
    let filteredData = carryoverRequests
    if (location) {
      filteredData = filteredData.filter((r: any) => r.staff.location === location)
    }
    if (department) {
      filteredData = filteredData.filter((r: any) => r.staff.department === department)
    }

    return NextResponse.json({
      carryover_requests: filteredData,
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
