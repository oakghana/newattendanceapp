import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Resolve the reviewer's scope. HODs review their department; regional
    // managers review staff assigned to their location.
    const { data: userProfile, error: profileErr } = await admin
      .from('user_profiles')
      .select('role, department_id, assigned_location_id')
      .eq('id', user.id)
      .single()

    if (profileErr || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const normalizedRole = String(userProfile.role || '').toLowerCase().replace(/[\s-]+/g, '_')
    const isRegionalManager = normalizedRole === 'regional_manager'
    const isDepartmentHead = ['department_head', 'hod'].includes(normalizedRole)

    if (!isRegionalManager && !isDepartmentHead) {
      return NextResponse.json({ error: 'Only HODs and Regional Managers can review resumptions' }, { status: 403 })
    }

    if (isRegionalManager && !userProfile.assigned_location_id) {
      return NextResponse.json({ error: 'Regional Manager location not found' }, { status: 404 })
    }
    if (isDepartmentHead && !userProfile.department_id) {
      return NextResponse.json({ error: 'HOD department not found' }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // Step 1: Get all user IDs in this HOD's department
    const staffQuery = admin
      .from('user_profiles')
      .select('id, first_name, last_name, employee_id')

    const { data: deptUsers, error: deptErr } = isRegionalManager
      ? await staffQuery.eq('assigned_location_id', userProfile.assigned_location_id)
      : await staffQuery.eq('department_id', userProfile.department_id)

    if (deptErr) {
      console.error('[hod-resumption] deptUsers error:', deptErr)
      return NextResponse.json({ error: 'Failed to fetch department users' }, { status: 500 })
    }

    const deptUserIds = (deptUsers || []).map((u: any) => u.id)
    if (deptUserIds.length === 0) {
      return NextResponse.json({ success: true, requests: [] })
    }

    // Build a map of userId -> profile for name lookup
    const profileMap: Record<string, { first_name: string; last_name: string; employee_id: string }> = {}
    for (const u of deptUsers || []) {
      profileMap[u.id] = { first_name: u.first_name || '', last_name: u.last_name || '', employee_id: u.employee_id || '' }
    }

    // Step 2: Fetch HR-approved leaves past end date for dept users only
    const { data: requests, error: fetchErr } = await admin
      .from('leave_plan_requests')
      .select('id, user_id, leave_type_key, preferred_start_date, preferred_end_date, status')
      .eq('status', 'hr_approved')
      .lte('preferred_end_date', todayStr)
      .in('user_id', deptUserIds)
      .order('preferred_end_date', { ascending: false })

    if (fetchErr) {
      console.error('[hod-resumption] fetch requests error:', fetchErr)
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
    }

    // Step 3: Fetch HOD confirmation status from leave_resumption_notifications
    // Match by user_id + leave_end_date (same pattern as all-requests API)
    const hodConfirmationMap: Record<string, { confirmed: boolean; confirmedAt: string | null }> = {}
    if (deptUserIds.length > 0) {
      const { data: resumptions } = await admin
        .from('leave_resumption_notifications')
        .select('user_id, leave_end_date, first_hod_rm_check_in_date')
        .in('user_id', deptUserIds)

      if (resumptions) {
        for (const notif of resumptions) {
          const key = `${notif.user_id}::${notif.leave_end_date}`
          hodConfirmationMap[key] = {
            confirmed: !!notif.first_hod_rm_check_in_date,
            confirmedAt: notif.first_hod_rm_check_in_date,
          }
        }
      }
    }

    // Step 4: Map results — only show unconfirmed, calculate days overdue
    const formattedRequests = (requests || [])
      .map((req: any) => {
        const profile = profileMap[req.user_id] || { first_name: '', last_name: '', employee_id: '' }
        const key = `${req.user_id}::${req.preferred_end_date}`
        const confirmation = hodConfirmationMap[key] || { confirmed: false, confirmedAt: null }

        const [y, m, d] = (req.preferred_end_date || '').split('-').map(Number)
        const endDate = new Date(y, m - 1, d, 0, 0, 0, 0)
        const daysOverdue = Math.max(0, Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)))

        return {
          id: req.id,
          user_id: req.user_id,
          user_profiles: {
            first_name: profile.first_name,
            last_name: profile.last_name,
            employee_id: profile.employee_id,
          },
          leave_type_key: req.leave_type_key,
          preferred_start_date: req.preferred_start_date,
          preferred_end_date: req.preferred_end_date,
          status: req.status,
          hod_confirmed: confirmation.confirmed,
          hod_confirmed_at: confirmation.confirmedAt,
          daysOverdue,
        }
      })
      .filter((req: any) => !req.hod_confirmed)

    return NextResponse.json({
      success: true,
      requests: formattedRequests,
    })
  } catch (err) {
    console.error('[v0] HOD resumption confirmations error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
