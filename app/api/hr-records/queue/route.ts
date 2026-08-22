import { NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { isHrRecordsRole, normalizeWorkflowRole } from "@/lib/hr-workflow"

export async function GET() {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  const role = normalizeWorkflowRole(profile?.role)
  if (!isHrRecordsRole(role) && !["admin", "super_admin", "god"].includes(role)) {
    return NextResponse.json({ error: "HR Records access required." }, { status: 403 })
  }

  const [leaveResult, loanResult, transportResult] = await Promise.all([
    admin.from("leave_plan_requests").select("id, user_id, leave_type_key, status, workflow_stage, workflow_route, memo_reference, memo_reference_locked, memo_reference_locked_at, memo_reference_locked_by, submitted_at, updated_at, preferred_start_date, preferred_end_date, hr_approved_at, reason").in("status", ["pending_hr_records_reference", "hod_approved", "hr_office_forwarded", "pending_hr_leave_processing", "regional_manager_approved", "pending_regional_hr_office_review", "pending_regional_hr_review", "regional_hr_office_review", "regional_hr_approved", "hr_approved", "approved"]).order("updated_at", { ascending: false }),
    admin.from("loan_requests").select("id, user_id, request_number, reference_number, status, workflow_stage, memo_reference_locked, memo_reference_locked_at, submitted_at, updated_at").in("status", ["pending_hr_records_reference", "hod_approved", "approved_director", "referenced"]).order("updated_at", { ascending: false }),
    admin.from("transport_requests").select("id, requester_id, purpose, status, workflow_stage, memo_reference, memo_date, memo_subject, updated_at, created_at").in("workflow_stage", ["hr_records_review", "referenced"]).order("updated_at", { ascending: false }),
  ])

  if (leaveResult.error) return NextResponse.json({ error: leaveResult.error.message }, { status: 500 })
  if (loanResult.error) return NextResponse.json({ error: loanResult.error.message }, { status: 500 })
  if (transportResult.error) return NextResponse.json({ error: transportResult.error.message }, { status: 500 })

  const transportRows = (transportResult.data || []).map((row: any) => ({ ...row, user_id: row.requester_id, entity: "transport", request_number: row.memo_reference || `Transport ${row.id.slice(0, 8).toUpperCase()}`, reference_number: row.memo_reference, request_subject: row.memo_subject || row.purpose }))
  const allRows = [...(leaveResult.data || []), ...(loanResult.data || []), ...transportRows]
  const userIds = Array.from(new Set(allRows.map((row: any) => row.user_id).filter(Boolean)))
  const { data: profiles, error: profilesError } = userIds.length
    ? await admin.from("user_profiles").select("id, first_name, last_name, employee_id, role, department_id, assigned_location_id").in("id", userIds)
    : { data: [], error: null }
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  const locationIds = Array.from(new Set((profiles || []).map((profile: any) => profile.assigned_location_id).filter(Boolean)))
  const departmentIds = Array.from(new Set((profiles || []).map((profile: any) => profile.department_id).filter(Boolean)))
  const { data: departments, error: departmentsError } = departmentIds.length
    ? await admin.from("departments").select("id, name").in("id", departmentIds)
    : { data: [], error: null }
  if (departmentsError) return NextResponse.json({ error: departmentsError.message }, { status: 500 })

  const { data: locations, error: locationsError } = locationIds.length
    ? await admin.from("geofence_locations").select("id, name").in("id", locationIds)
    : { data: [], error: null }
  if (locationsError) return NextResponse.json({ error: locationsError.message }, { status: 500 })

  const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))
  const locationMap = new Map((locations || []).map((location: any) => [location.id, location]))
  const departmentMap = new Map((departments || []).map((department: any) => [department.id, department]))
  const decorate = (row: any) => {
    const profile = profileMap.get(row.user_id)
    const leaveYear = row.preferred_start_date
      ? new Date(`${row.preferred_start_date}T00:00:00`).getFullYear()
      : new Date(row.updated_at || row.created_at || Date.now()).getFullYear()
    const requestSubject = row.request_number || row.reference_number
      ? row.request_number || row.reference_number || "Loan request"
      : row.memo_subject || row.memo_draft_subject || (
          String(row.leave_type_key || "").toLowerCase() === "annual"
            ? `ANNUAL LEAVE ADVICE FOR ${leaveYear}`
            : row.reason || `${String(row.leave_type_key || "Leave").replaceAll("_", " ")} leave request`
        )
    const location = profile ? locationMap.get(profile.assigned_location_id) : null
    const department = profile ? departmentMap.get(profile.department_id) : null
    return {
      ...row,
      requester_name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "Unknown staff",
      staff_id: profile?.employee_id || row.user_id || "Not assigned",
      staff_category: profile?.role || "Staff",
      department: department?.name || "Department not assigned",
      location_name: location?.name || "Location not assigned",
      request_subject: requestSubject,
    }
  }
  return NextResponse.json({ leave: (leaveResult.data || []).map(decorate), loans: (loanResult.data || []).map(decorate), transport: transportRows.map(decorate) })
}
