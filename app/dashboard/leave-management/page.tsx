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

  // Fetch user's own leave planning requests for personal tracking.
  {
    const { data: requests } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    staffRequests = (requests || []).map((request: any) => ({
      id: String(request.id),
      user_id: String(request.user_id),
      start_date: request.preferred_start_date,
      end_date: request.preferred_end_date,
      reason: request.reason || "",
      leave_type: request.leave_type_key || "annual",
      status: request.status,
      created_at: request.created_at,
    }))
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

  // Fetch leave planning review assignments for HOD/HR/admin metrics and queue summaries.
  if (canReviewLeave) {
    const reviewerFilter = roleNorm === "admin" ? undefined : user.id
    const { data: planningReviews } = reviewerFilter
      ? await admin
          .from("leave_plan_reviews")
          .select(`
            id,
            reviewer_id,
            reviewer_role,
            decision,
            reviewed_at,
            leave_plan_request:leave_plan_requests!leave_plan_reviews_leave_plan_request_id_fkey (
              id,
              user_id,
              preferred_start_date,
              preferred_end_date,
              leave_type_key,
              reason,
              status,
              created_at
            )
          `)
          .eq("reviewer_id", reviewerFilter)
          .order("created_at", { ascending: false })
      : await admin
          .from("leave_plan_reviews")
          .select(`
            id,
            reviewer_id,
            reviewer_role,
            decision,
            reviewed_at,
            leave_plan_request:leave_plan_requests!leave_plan_reviews_leave_plan_request_id_fkey (
              id,
              user_id,
              preferred_start_date,
              preferred_end_date,
              leave_type_key,
              reason,
              status,
              created_at
            )
          `)
          .order("created_at", { ascending: false })

    const notifications = (planningReviews || []).filter((review: any) => Boolean(review?.leave_plan_request))

    const requesterIds = Array.from(new Set(notifications.map((review: any) => String(review.leave_plan_request?.user_id || "")).filter(Boolean)))

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
      .filter((review: any) => {
        if (roleNorm === "admin") return true
        return Boolean(review?.leave_plan_request?.user_id)
      })
      .map((review: any) => {
        const leave = review.leave_plan_request
        const requester = requesterMap.get(String(leave?.user_id || ""))
        const sourceDate = leave?.created_at || review.reviewed_at
        const waitingDays = sourceDate
          ? Math.max(0, Math.floor((Date.now() - new Date(sourceDate).getTime()) / (1000 * 60 * 60 * 24)))
          : 0
        return {
          id: String(review.id),
          leave_plan_request_id: String(leave?.id || ""),
          status: String(leave?.status || review.decision || "pending_hod_review"),
          review_decision: String(review.decision || "pending"),
          requester_role: String(requester?.role || "staff"),
          requester_name: requester ? `${requester.first_name || ""} ${requester.last_name || ""}`.trim() : "Staff",
          waiting_days: waitingDays,
          leave_requests: {
            id: String(leave?.id || ""),
            user_id: String(leave?.user_id || ""),
            start_date: leave?.preferred_start_date,
            end_date: leave?.preferred_end_date,
            reason: leave?.reason || "",
            leave_type: leave?.leave_type_key || "annual",
            status: String(leave?.status || "pending_hod_review"),
            created_at: leave?.created_at,
          },
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
