import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'ALL'  // Default to ALL (no filter) unless explicitly set
    const leaveYear = searchParams.get('leave_year')
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    // Build query for carryover requests
    let query = admin
      .from('carryover_approval_requests')
      .select('*', { count: 'exact' })
      .order('requested_at', { ascending: false })

    // Filter by status ONLY if explicitly set to PENDING/APPROVED/REJECTED
    // If not set or set to ALL, fetch all statuses (no status filter)
    if (status && status !== 'ALL' && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      query = query.eq('status', status)
    }

    if (leaveYear) {
      query = query.eq('leave_year', leaveYear)
    }

    const { data: carryoverRequests, count, error } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('[v0] Carryover pending fetch error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Fetch user profiles for the staff_ids to get names
    const staffIds = [...new Set((carryoverRequests || []).map((r: any) => r.staff_id).filter(Boolean))]
    let profilesMap: Record<string, any> = {}

    if (staffIds.length > 0) {
      const { data: profiles } = await admin
        .from('user_profiles')
        .select('id, first_name, last_name, employee_id, position, department_id, departments(name)')
        .in('id', staffIds)

      if (profiles) {
        profiles.forEach((p: any) => {
          profilesMap[p.id] = p
        })
      }
    }

    // Enrich carryover requests with staff info
    const enrichedRequests = (carryoverRequests || []).map((req: any) => {
      const profile = profilesMap[req.staff_id] || {}
      return {
        ...req,
        staff_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
        staff_employee_id: profile.employee_id || '',
        staff_position: profile.position || '',
        staff_department: profile.departments?.name || '',
      }
    })

    return NextResponse.json({
      carryover_requests: enrichedRequests,
      total: count || 0,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('[v0] Carryover pending error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch carryover requests' },
      { status: 500 }
    )
  }
}
