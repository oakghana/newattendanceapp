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

  const [leaveResult, loanResult] = await Promise.all([
    admin.from("leave_plan_requests").select("id, user_id, leave_type_key, status, workflow_stage, workflow_route, memo_reference, memo_reference_locked, memo_reference_locked_at, memo_reference_locked_by, submitted_at, updated_at, preferred_start_date, preferred_end_date, hr_approved_at").in("status", ["pending_hr_records_reference", "hod_approved", "hr_office_forwarded", "pending_hr_leave_processing", "regional_manager_approved", "hr_approved", "approved"]).order("updated_at", { ascending: false }),
    admin.from("loan_requests").select("id, user_id, request_number, reference_number, status, workflow_stage, memo_reference_locked, memo_reference_locked_at, submitted_at, updated_at").in("status", ["pending_hr_records_reference", "hod_approved", "approved_director"]).order("updated_at", { ascending: false }),
  ])

  if (leaveResult.error) return NextResponse.json({ error: leaveResult.error.message }, { status: 500 })
  if (loanResult.error) return NextResponse.json({ error: loanResult.error.message }, { status: 500 })
  return NextResponse.json({ leave: leaveResult.data || [], loans: loanResult.data || [] })
}
