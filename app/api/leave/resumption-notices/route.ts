import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HR_ROLES = new Set(['admin', 'hr', 'hr_office', 'hr_officer', 'hr_leave_office', 'manager_hr', 'director_hr', 'hr_executive'])
const HOD_ROLES = new Set(['hod', 'department_head'])

function dateOnly(value: string | null | undefined) {
  if (!value) return null
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] || null
}

function dayDiff(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((end - start) / 86400000)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: reviewer, error: reviewerError } = await admin
      .from('user_profiles')
      .select('id, role, department_id, assigned_location_id')
      .eq('id', user.id)
      .single()
    if (reviewerError || !reviewer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const role = String(reviewer.role || '').toLowerCase().replace(/[\s-]+/g, '_')
    const isHr = HR_ROLES.has(role)
    const isHod = HOD_ROLES.has(role)
    const isRm = role === 'regional_manager'
    if (!isHr && !isHod && !isRm) return NextResponse.json({ notices: [], role, authorized: false })

    let staffQuery = admin.from('user_profiles').select('id, first_name, last_name, employee_id, department_id, assigned_location_id')
    if (isHod) staffQuery = staffQuery.eq('department_id', reviewer.department_id)
    if (isRm) staffQuery = staffQuery.eq('assigned_location_id', reviewer.assigned_location_id)
    const { data: staff, error: staffError } = await staffQuery
    if (staffError) throw staffError
    const staffIds = (staff || []).map((item) => item.id)
    if (!staffIds.length) return NextResponse.json({ notices: [], role, authorized: true })

    const { data: leaves, error: leavesError } = await admin
      .from('leave_plan_requests')
      .select('id, user_id, leave_type_key, preferred_end_date, adjusted_end_date, status')
      .in('status', ['hr_approved', 'approved', 'completed', 'hod_approved'])
      .or('is_archived.is.null,is_archived.eq.false')
      .in('user_id', staffIds)
    if (leavesError) throw leavesError

    const { data: confirmations, error: confirmationsError } = await admin
      .from('leave_resumption_notifications')
      .select('id, leave_request_id, user_id, leave_end_date, first_check_in_date, first_hod_rm_check_in_date, confirmation_status, status')
      .in('user_id', staffIds)
    if (confirmationsError) throw confirmationsError

    const byRequest = new Map((confirmations || []).filter((item) => item.leave_request_id).map((item) => [item.leave_request_id, item]))
    const byDate = new Map((confirmations || []).map((item) => [`${item.user_id}::${dateOnly(item.leave_end_date)}`, item]))
    const today = new Date().toISOString().slice(0, 10)
    const maxDate = new Date(`${today}T00:00:00Z`)
    maxDate.setUTCDate(maxDate.getUTCDate() + 5)
    const maxDateString = maxDate.toISOString().slice(0, 10)

    const notices = (leaves || []).flatMap((leave) => {
      const endDate = dateOnly(leave.adjusted_end_date || leave.preferred_end_date)
      if (!endDate) return []
      const resumeDate = new Date(`${endDate}T00:00:00Z`)
      resumeDate.setUTCDate(resumeDate.getUTCDate() + 1)
      const resume = resumeDate.toISOString().slice(0, 10)
      const confirmation = byRequest.get(leave.id) || byDate.get(`${leave.user_id}::${endDate}`)
      // Staff check-in and HOD/RM confirmation are separate events. A staff
      // check-in must never clear the management confirmation notice.
      if (confirmation?.confirmation_status === 'confirmed') return []
      const upcoming = resume >= today && resume <= maxDateString
      const overdue = resume < today
      if (!upcoming && !overdue) return []
      const profile = staff.find((item) => item.id === leave.user_id)
      const days = dayDiff(today, resume)
      return [{
        id: confirmation?.id || leave.id,
        leave_request_id: leave.id,
        user_id: leave.user_id,
        staff_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Staff member',
        employee_id: profile?.employee_id || null,
        leave_type: leave.leave_type_key || 'Leave',
        resumption_date: resume,
        days_until_resumption: days,
        state: overdue ? 'overdue' : days === 0 ? 'due_today' : 'upcoming',
        staff_checked_in: Boolean(confirmation?.first_check_in_date),
        hod_rm_confirmed: false,
        escalation_status: confirmation?.status || 'pending',
        requires_confirmation: true,
      }]
    }).sort((a, b) => a.days_until_resumption - b.days_until_resumption)

    return NextResponse.json({ notices, role, authorized: true, generated_at: new Date().toISOString() })
  } catch (error) {
    console.error('[v0] resumption notices error:', error)
    return NextResponse.json({ error: 'Unable to load resumption notices' }, { status: 500 })
  }
}
