import { createAdminClient, createClient } from "@/lib/supabase/server"
import { LeaveManagementModuleClient } from "./leave-management-module-client"


export default async function LeaveManagementPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const inactivityDays = Number(process.env.LEAVE_SUPERVISOR_INACTIVITY_DAYS || 5)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, department_id, assigned_location_id, first_name, last_name, departments(name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  // Fetch only essential fast queries first
  let staffRequests: any[] = []
  let hasHodLinkage = false
  let userLocationName: string | null = null

  try {
    // Build parallel queries — include location lookup when user has an assigned location
    const locationId = (profile as any)?.assigned_location_id
    const queries: Promise<any>[] = [
      admin
        .from("leave_plan_requests")
        .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, created_at, adjusted_start_date, adjusted_end_date, hod_decision, memo_token")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("loan_hod_linkages")
        .select("id")
        .eq("staff_user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]

    if (locationId) {
      queries.push(
        admin
          .from("geofence_locations")
          .select("name")
          .eq("id", locationId)
          .maybeSingle()
      )
    }

    const results = await Promise.all(queries)
    const [requestsRes, linkageRes, locationRes] = results

    staffRequests = (requestsRes.data || []).map((request: any) => ({
      id: String(request.id),
      user_id: String(request.user_id),
      start_date: request.preferred_start_date,
      end_date: request.preferred_end_date,
      reason: request.reason || "",
      leave_type: request.leave_type_key || "annual",
      status: request.status,
      created_at: request.created_at,
      adjusted_start_date: request.adjusted_start_date,
      adjusted_end_date: request.adjusted_end_date,
      hod_decision: request.hod_decision,
      memo_token: request.memo_token || null,
    }))

    hasHodLinkage = Boolean((linkageRes?.data as any)?.id)
    userLocationName = (locationRes?.data as any)?.name || null
  } catch (err) {
    console.error("[v0] Error fetching essential data:", err)
    hasHodLinkage = false
  }

  // Heavy reviewer queries are lazy-loaded client-side to keep page fast
  const managerNotifications: any[] = []
  const approvedStaffRequests: any[] = []

  return (
    <div className="leave-theme">
      <LeaveManagementModuleClient
        userId={user.id}
        userRole={profile.role}
        userDepartment={(profile as any)?.department_id || null}
        userFirstName={(profile as any)?.first_name || null}
        userLastName={(profile as any)?.last_name || null}
        inactivityDays={Math.max(1, inactivityDays)}
        userDepartmentName={(profile as any)?.departments?.name || null}
        userDepartmentCode={(profile as any)?.departments?.code || null}
        userLocationName={userLocationName}
        hasHodLinkage={hasHodLinkage}
        initialStaffRequests={staffRequests}
        initialManagerNotifications={managerNotifications}
        initialApprovedStaffRequests={approvedStaffRequests}
      />
    </div>
  )
}
