import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canManageLeave, normalizeAppRole } from "@/lib/role-capabilities"

async function actor() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { admin, user: null, profile: null }
  const { data: profile } = await admin.from("user_profiles").select("role, is_active, department_id").eq("id", user.id).maybeSingle()
  return { admin, user, profile }
}

function managesSchedule(role: string | null | undefined) {
  return canManageLeave(role) || ["department_head", "regional_manager", "hr_executive", "hr"].includes(normalizeAppRole(role))
}

export async function GET(request: NextRequest) {
  const { admin, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const canManage = profile?.is_active !== false && managesSchedule(profile?.role)
  const month = request.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Invalid calendar month." }, { status: 400 })
  const start = `${month}-01`
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10)

  let staffQuery = admin.from("user_profiles").select("id, first_name, last_name, employee_id, department_id").eq("is_active", true).order("first_name")
  if (!canManage) staffQuery = staffQuery.eq("id", user.id)
  else if (profile?.department_id && !["admin", "it_admin", "hr_leave_office", "hr_office", "director_hr", "manager_hr"].includes(normalizeAppRole(profile.role))) staffQuery = staffQuery.eq("department_id", profile.department_id)
  const { data: staff, error: staffError } = await staffQuery
  if (staffError) return NextResponse.json({ error: "Unable to load schedule staff." }, { status: 500 })
  const staffIds = (staff ?? []).map((member) => member.id)
  const [patternsResult, assignmentsResult, leaveResult, swapsResult] = await Promise.all([
    admin.from("shift_patterns").select("*").eq("is_active", true).order("name"),
    staffIds.length ? admin.from("shift_assignments").select("*").in("employee_id", staffIds).gte("shift_date", start).lte("shift_date", end) : Promise.resolve({ data: [] }),
    staffIds.length ? admin.from("leave_plan_requests").select("user_id, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date").in("user_id", staffIds).eq("status", "hr_approved").eq("is_archived", false).lte("preferred_start_date", end).gte("preferred_end_date", start) : Promise.resolve({ data: [] }),
    admin.from("shift_swap_requests").select("*").or(`requested_by.eq.${user.id},target_employee_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(50),
  ])
  return NextResponse.json({ canManage, staff: staff ?? [], patterns: patternsResult.data ?? [], assignments: assignmentsResult.data ?? [], leaves: leaveResult.data ?? [], swaps: swapsResult.data ?? [] })
}

export async function POST(request: Request) {
  const { admin, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const action = String(body.action ?? "assign")
  const canManage = profile?.is_active !== false && managesSchedule(profile?.role)

  if (action === "pattern") {
    if (!canManage) return NextResponse.json({ error: "Schedule management access denied." }, { status: 403 })
    const name = String(body.name ?? "").trim(); const code = String(body.code ?? "").trim().toUpperCase()
    if (!name || !code || !/^\d{2}:\d{2}$/.test(String(body.start_time)) || !/^\d{2}:\d{2}$/.test(String(body.end_time))) return NextResponse.json({ error: "Name, code, start time, and end time are required." }, { status: 400 })
    const { data, error } = await admin.from("shift_patterns").insert({ name, code, start_time: body.start_time, end_time: body.end_time, color: String(body.color ?? "#0f766e"), department_id: profile?.department_id ?? null, created_by: user.id }).select("*").single()
    if (error) return NextResponse.json({ error: error.code === "23505" ? "That shift code already exists." : "Unable to create shift pattern." }, { status: 500 })
    return NextResponse.json({ pattern: data }, { status: 201 })
  }

  if (action === "swap") {
    const assignmentId = String(body.assignment_id ?? ""); const targetEmployeeId = String(body.target_employee_id ?? "")
    const { data: assignment } = await admin.from("shift_assignments").select("id, employee_id").eq("id", assignmentId).maybeSingle()
    if (!assignment || assignment.employee_id !== user.id || !targetEmployeeId || targetEmployeeId === user.id) return NextResponse.json({ error: "Invalid shift swap request." }, { status: 400 })
    const { data, error } = await admin.from("shift_swap_requests").insert({ shift_assignment_id: assignmentId, requested_by: user.id, target_employee_id: targetEmployeeId, requester_note: String(body.note ?? "").trim() || null }).select("*").single()
    if (error) return NextResponse.json({ error: "Unable to request shift swap." }, { status: 500 })
    return NextResponse.json({ swap: data }, { status: 201 })
  }

  if (!canManage) return NextResponse.json({ error: "Schedule management access denied." }, { status: 403 })
  const employeeId = String(body.employee_id ?? ""); const patternId = String(body.shift_pattern_id ?? ""); const shiftDate = String(body.shift_date ?? "")
  if (!employeeId || !patternId || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) return NextResponse.json({ error: "Employee, shift pattern, and shift date are required." }, { status: 400 })
  const { data: leaveConflict } = await admin.from("leave_plan_requests").select("id").eq("user_id", employeeId).eq("status", "hr_approved").eq("is_archived", false).lte("preferred_start_date", shiftDate).gte("preferred_end_date", shiftDate).maybeSingle()
  if (leaveConflict) return NextResponse.json({ error: "This employee is on approved leave for the selected date." }, { status: 409 })
  const { data, error } = await admin.from("shift_assignments").insert({ employee_id: employeeId, shift_pattern_id: patternId, shift_date: shiftDate, assigned_by: user.id, notes: String(body.notes ?? "").trim() || null }).select("*").single()
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This employee already has a shift on that date." : "Unable to assign shift." }, { status: error.code === "23505" ? 409 : 500 })
  return NextResponse.json({ assignment: data }, { status: 201 })
}