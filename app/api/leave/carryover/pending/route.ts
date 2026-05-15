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
    const status = searchParams.get('status') || 'PENDING'
    const leaveYear = searchParams.get('leave_year')
    const location = searchParams.get('location')
    const department = searchParams.get('department')
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    let query = supabase
      .from('carryover_approval_requests')
      .select(`
        *,
        staff:staff_id (
          id,
          email,
          user_metadata
        )
      `, { count: 'exact' })
      .eq('status', status)
      .order('requested_at', { ascending: false })

    if (leaveYear) {
      query = query.eq('leave_year', leaveYear)
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('[v0] Carryover pending fetch error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Filter by location and department if provided (from staff metadata)
    let filteredData = data || []
    if (location || department) {
      filteredData = filteredData.filter((request: any) => {
        const staffMeta = request.staff?.user_metadata || {}
        const matches = (!location || staffMeta.location === location) &&
                       (!department || staffMeta.department === department)
        return matches
      })
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
