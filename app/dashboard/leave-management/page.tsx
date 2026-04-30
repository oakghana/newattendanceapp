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
    .select("role, department_id, assigned_location_id, departments(name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  let staffRequests = []
  let managerNotifications = []
  let hasHodLinkage = false

  try {
    const { data: linkage } = await admin
      .from("loan_hod_linkages")
      .select("id")
      .eq("staff_user_id", user.id)
      .limit(1)
      .maybeSingle()
    hasHodLinkage = Boolean((linkage as any)?.id)
  } catch {
    hasHodLinkage = false
  }

  // Fetch staff's own leave requests
  if (["staff", "nsp", "intern", "it-admin"].includes(profile.role)) {
    const { data: requests } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    staffRequests = requests || []
  }

  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - Math.max(1, inactivityDays))

    const { data: stalePending } = await admin
      .from("leave_requests")
      .select("id, user_id, start_date, end_date, status, created_at")
      .eq("status", "pending")
      .lte("created_at", cutoff.toISOString())
      .limit(500)

    for (const request of stalePending || []) {
      const approvedAt = new Date().toISOString()
      await admin
        .from("leave_requests")
        .update({ status: "approved", approved_at: approvedAt, updated_at: approvedAt })
        .eq("id", (request as any).id)
        .eq("status", "pending")

      await admin
        .from("leave_notifications")
        .update({ status: "approved", approved_at: approvedAt })
        .eq("leave_request_id", (request as any).id)
        .eq("status", "pending")
    }
  } catch (error) {
    console.warn("leave inactivity auto-approval skipped:", error)
  }

  // Fetch pending notifications for managers
  if (["admin", "regional_manager", "department_head", "it-admin"].includes(profile.role)) {
    let query = admin
      .from("leave_notifications")
      .select("*, leave_requests(*)")
      .order("created_at", { ascending: false })

    if (profile.role !== "admin") {
      query = query.eq("status", "pending")
    }

    const { data: notifications } = await query

    const leaveRows = (notifications || [])
      .map((notification: any) => notification.leave_requests)
      .filter((leave: any) => Boolean(leave))

    const requesterIds = Array.from(new Set(leaveRows.map((leave: any) => String(leave.user_id || "")).filter(Boolean)))

    let requesterProfiles: any[] = []
    if (requesterIds.length > 0) {
      const { data } = await admin
        .from("user_profiles")
        .select("id, role, department_id, assigned_location_id, first_name, last_name")
        .in("id", requesterIds)
      requesterProfiles = data || []
    }

    // Fetch loan_hod_linkages for this manager so we know which staff are explicitly linked to them
    let linkedStaffIds: Set<string> = new Set()
    if (["department_head", "regional_manager"].includes(profile.role)) {
      try {
        const { data: linkages } = await admin
          .from("loan_hod_linkages")
          .select("staff_user_id")
          .eq("hod_user_id", user.id)
        linkedStaffIds = new Set((linkages || []).map((l: any) => String(l.staff_user_id)))
      } catch {
        linkedStaffIds = new Set()
      }
    }

    const requesterMap = new Map(requesterProfiles.map((row: any) => [row.id, row]))
    const managerDepartmentId = (profile as any).department_id || null
    const managerLocationId = (profile as any).assigned_location_id || null

    managerNotifications = (notifications || [])
      .filter((notification: any) => {
        if (profile.role === "admin") return true
        const leave = notification.leave_requests
        if (!leave?.user_id) return false
        const staffId = String(leave.user_id)

        // If staff is explicitly linked to this HOD via loan_hod_linkages, always show
        if (linkedStaffIds.has(staffId)) return true

        const requester = requesterMap.get(staffId)
        if (!requester) return false

        if (profile.role === "regional_manager") {
          return Boolean(managerLocationId) && requester.assigned_location_id === managerLocationId
        }

        if (profile.role === "department_head") {
          const sameDepartment = Boolean(requester.department_id) && requester.department_id === managerDepartmentId
          const sameLocation = !managerLocationId || requester.assigned_location_id === managerLocationId
          return sameDepartment && sameLocation
        }

        return requester.department_id && requester.department_id === managerDepartmentId
      })
      .map((notification: any) => {
        const leave = notification.leave_requests
        const requester = requesterMap.get(String(leave?.user_id || ""))
        const sourceDate = leave?.created_at || notification.created_at
        const waitingDays = sourceDate
          ? Math.max(0, Math.floor((Date.now() - new Date(sourceDate).getTime()) / (1000 * 60 * 60 * 24)))
          : 0
        return {
          ...notification,
          requester_role: String(requester?.role || "staff"),
          requester_name: requester ? `${requester.first_name || ""} ${requester.last_name || ""}`.trim() : "Staff",
          waiting_days: waitingDays,
        }
      })

  }

  return (
    <div className="leave-theme">
      <LeaveManagementModuleClient
        userRole={profile.role}
        userDepartment={profile.department_id}
        inactivityDays={Math.max(1, inactivityDays)}
        userDepartmentName={(profile as any)?.departments?.name || null}
        userDepartmentCode={(profile as any)?.departments?.code || null}
        hasHodLinkage={hasHodLinkage}
        initialStaffRequests={staffRequests}
        initialManagerNotifications={managerNotifications}
      />
    </div>
  )
}
