import { createAdminClient, createClientAndGetUser } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Initialize Supabase server client
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to check if they're HOD/department head
    const { data: profile } = await admin
      .from('user_profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get staff linked to this HOD
    let linkedStaffIds: string[] = []
    if (['department_head', 'regional_manager'].includes(profile.role)) {
      const { data: linkageRows } = await admin
        .from('loan_hod_linkages')
        .select('staff_user_id')
        .eq('hod_user_id', user.id)
        .limit(5000)
      linkedStaffIds = (linkageRows || []).map((row: any) => row.staff_user_id).filter(Boolean)
    }

    // Get all HODs linked to this user (if staff)
    let linkedHodIds: string[] = []
    if (!['admin', 'department_head', 'regional_manager'].includes(profile.role)) {
      const { data: hodLinkageRows } = await admin
        .from('loan_hod_linkages')
        .select('hod_user_id')
        .eq('staff_user_id', user.id)
        .limit(5000)
      linkedHodIds = (hodLinkageRows || []).map((row: any) => row.hod_user_id).filter(Boolean)
    }

    // Query leave_plan_requests where HOD decision is pending (null or 'pending')
    // For HODs: show requests from linked staff
    // For staff: requests from ALL linked HODs (multi-HOD broadcast)
    let query = admin
      .from('leave_plan_requests')
      .select(`
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        adjusted_days,
        status,
        hod_decision,
        hod_reviewer_id,
        staff_category,
        created_at,
        submitted_at
      `)
      .or('hod_decision.is.null,hod_decision.eq.pending')
      .neq('status', 'rejected')

    // If HOD/department head: filter to linked staff
    if (linkedStaffIds.length > 0 && ['department_head', 'regional_manager'].includes(profile.role)) {
      query = query.in('user_id', linkedStaffIds)
    }
    // If staff with multiple HODs: show requests from those HODs
    else if (linkedHodIds.length > 0 && !['admin', 'department_head', 'regional_manager'].includes(profile.role)) {
      query = query.in('hod_reviewer_id', [...linkedHodIds, user.id].filter(Boolean))
    }

    const { data: requests, error } = await query
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[v0] HOD pending requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const planRequests = requests || []

    // Enrich with user details from unified_user_management
    const userIds = [...new Set(planRequests.map((r: any) => r.user_id).filter(Boolean))]
    let userMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('unified_user_management')
        .select('user_id, full_name, department_name, position, employee_id')
        .in('user_id', userIds)
      if (users) {
        users.forEach((u: any) => { userMap[u.user_id] = u })
      }
    }

    // Calculate days pending and enrich with user details
    const now = new Date()
    const enrichedRequests = planRequests.map((req: any) => {
      const createdDate = new Date(req.submitted_at || req.created_at)
      const daysPending = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

      let ageColor = 'green'
      if (daysPending > 7) ageColor = 'red'
      else if (daysPending > 3) ageColor = 'amber'

      const user = userMap[req.user_id] || {}

      return {
        ...req,
        leave_type: req.leave_type_key || 'Annual',
        start_date: req.preferred_start_date,
        end_date: req.preferred_end_date,
        hod_review_status: req.hod_decision || 'pending',
        daysPending,
        ageColor,
        staff_name: user.full_name || 'Unknown',
        department_name: user.department_name || 'N/A',
        position: user.position || 'N/A',
        employee_id: user.employee_id || 'N/A',
        user_profiles: {
          first_name: (user.full_name || '').split(' ')[0] || '',
          last_name: (user.full_name || '').split(' ').slice(1).join(' ') || '',
          employee_id: user.employee_id || '',
          department_name: user.department_name || '',
          position: user.position || '',
        },
      }
    })

    return NextResponse.json({
      requests: enrichedRequests,
      total: enrichedRequests.length,
    })
  } catch (err) {
    console.error('[v0] HOD pending requests error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
