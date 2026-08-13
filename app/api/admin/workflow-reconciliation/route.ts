import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canManageWorkflowMappings, resolveStaffAssignments } from "@/lib/hr-workflow"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createAdminClient()
  const { data: actor } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (!canManageWorkflowMappings(actor?.role)) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id, first_name, last_name, email, role, assigned_location_id, region_id, department_id, hod_id, regional_hr_id, regional_manager_id, is_active")
    .eq("is_active", true)
    .order("first_name")
  if (error) return NextResponse.json({ error: "Failed to load staff assignments" }, { status: 500 })

  const assignments = []
  for (const profile of profiles || []) {
    const resolved = await resolveStaffAssignments(admin, profile.id)
    const missing = ["assignedLocationId", "regionId", "departmentId", "hodId"].filter((key) => !(resolved as any)[key])
    assignments.push({ ...profile, resolved, missing })
  }

  const { data: invalidLeave } = await admin
    .from("leave_plan_requests")
    .select("id, user_id, status, workflow_route, workflow_stage")
    .or("workflow_route.is.null,workflow_stage.is.null")
    .limit(500)
  const { data: invalidLoans } = await admin
    .from("loan_requests")
    .select("id, user_id, status, assigned_location_id, hod_id")
    .or("assigned_location_id.is.null,hod_id.is.null")
    .limit(500)

  return NextResponse.json({ assignments, invalidLeave: invalidLeave || [], invalidLoans: invalidLoans || [] })
}
