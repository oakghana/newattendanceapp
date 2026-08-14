import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  try {
    // Initialize Supabase server client
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = await createAdminClient()
    // Query leave_plan_requests where HOD decision is pending (null or 'pending')
    const { data: requests, error } = await admin
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
        hod_id,
        workflow_route,
        staff_category,
        created_at,
        submitted_at
      `)
      .or('hod_decision.is.null,hod_decision.eq.pending')
      .in('status', ['pending_hod_review', 'pending_hod', 'pending', 'submitted', 'pending_review'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[v0] HOD pending requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const planRequests = (requests || []).filter((request: any) => request.workflow_route !== "regional")

    // Enrich with user details, staff location, and HOD linkage details.
    const userIds = [...new Set(planRequests.map((r: any) => r.user_id).filter(Boolean))]
    const userMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('unified_user_management')
        .select('user_id, full_name, department_name, position, employee_id')
        .in('user_id', userIds)
      if (users) {
        users.forEach((u: any) => { userMap[u.user_id] = u })
      }
    }

    const profileIds = [...new Set(userIds)]
    const { data: profiles } = profileIds.length
      ? await admin.from('user_profiles').select('id, assigned_location_id, region_id').in('id', profileIds)
      : { data: [] as any[] }
    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))
    const locationIds = [...new Set((profiles || []).map((profile: any) => profile.assigned_location_id).filter(Boolean))]
    const { data: locations } = locationIds.length
      ? await admin.from('locations').select('id, name, code, region_id').in('id', locationIds)
      : { data: [] as any[] }
    const locationMap = new Map((locations || []).map((location: any) => [location.id, location]))
    const [{ data: linkages }, { data: profileHodLinks }] = await Promise.all([
      profileIds.length
        ? admin.from('loan_hod_linkages').select('staff_user_id, hod_user_id').in('staff_user_id', profileIds)
        : Promise.resolve({ data: [] as any[] }),
      profileIds.length
        ? admin.from('user_profiles').select('id, hod_id').in('id', profileIds).not('hod_id', 'is', null)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const allLinkages = [
      ...(linkages || []),
      ...(profileHodLinks || []).map((profile: any) => ({ staff_user_id: profile.id, hod_user_id: profile.hod_id })),
    ]
    const hodIds = [...new Set(allLinkages.map((link: any) => link.hod_user_id).filter(Boolean))]
    const { data: hodProfiles } = hodIds.length
      ? await admin.from('user_profiles').select('id, first_name, last_name, employee_id, position, role, email').in('id', hodIds)
      : { data: [] as any[] }
    const hodMap = new Map((hodProfiles || []).map((hod: any) => [hod.id, hod]))
    const linkageMap = new Map<string, any[]>()
    for (const link of allLinkages) {
      const hod = hodMap.get(link.hod_user_id)
      if (!hod) continue
      const current = linkageMap.get(link.staff_user_id) || []
      current.push({ id: hod.id, name: `${hod.first_name || ''} ${hod.last_name || ''}`.trim(), employee_id: hod.employee_id, position: hod.position, role: hod.role, email: hod.email })
      linkageMap.set(link.staff_user_id, current)
    }

    // Calculate days pending and enrich with user details
    const now = new Date()
    const currentHodStaffIds = new Set(
      allLinkages.filter((link: any) => String(link.hod_user_id) === String(user.id)).map((link: any) => String(link.staff_user_id)),
    )
    const enrichedRequests = planRequests.filter((req: any) =>
      String(req.hod_id || "") === String(user.id) || currentHodStaffIds.has(String(req.user_id)),
    ).map((req: any) => {
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
        staff_location: locationMap.get(profileMap.get(req.user_id)?.assigned_location_id) || null,
        hod_linkages: linkageMap.get(req.user_id) || [],
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
