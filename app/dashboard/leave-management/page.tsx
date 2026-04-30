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

  // Fetch user's own leave requests for personal tracking (including managers)
  {
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
        .eq("status", "pending_hr")
    }
  } catch (error) {
    console.warn("leave inactivity auto-approval skipped:", error)
  }

  const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  const canReviewLeave = [
    "admin",
    "regional_manager",
    "department_head",
    "hr_officer",
    "manager_hr",
    "director_hr",
    "hr_director",
    "loan_office",
    "it_admin",
  ].includes(roleNorm)

  // Fetch pending notifications for HOD/HR/admin
  if (canReviewLeave) {
    let query = admin
      .from("leave_notifications")
      .select("id, recipient_id, sender_id, status, notification_type, created_at, leave_requests(*)")
      .order("created_at", { ascending: false })

    if (roleNorm !== "admin") {
      query = query.eq("recipient_id", user.id)
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

    const requesterMap = new Map(requesterProfiles.map((row: any) => [row.id, row]))

    managerNotifications = (notifications || [])
      .filter((notification: any) => {
        if (roleNorm === "admin") return true
        const leave = notification.leave_requests
        return Boolean(leave?.user_id)
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
