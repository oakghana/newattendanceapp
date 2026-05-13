import { createAdminClient, createClient } from "@/lib/supabase/server"
import { LeaveManagementModuleClient } from "./leave-management-module-client"

export default async function LeaveManagementPage() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const inactivityDays = Number(process.env.LEAVE_SUPERVISOR_INACTIVITY_DAYS || 5)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return <div className="p-6 text-red-600">Authentication required. Please log in.</div>
    }

    // Get user profile with error handling
    let profile: any = null
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("role, department_id, assigned_location_id, first_name, last_name, departments(name, code)")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error("[v0] Leave Management - Profile fetch error:", profileError)
        profile = { role: "staff", first_name: "User" }
      } else {
        profile = profileData
      }
    } catch (err) {
      console.error("[v0] Leave Management - Profile exception:", err)
      profile = { role: "staff", first_name: "User" }
    }

    if (!profile) {
      return <div className="p-6 text-red-600">Unable to load user profile. Please try again.</div>
    }

    let staffRequests: any[] = []
    let managerNotifications: any[] = []
    let hasHodLinkage = false

    // Check HOD linkage
    try {
      const { data: linkage, error: linkageError } = await admin
        .from("loan_hod_linkages")
        .select("id")
        .eq("staff_user_id", user.id)
        .limit(1)
        .maybeSingle()
      if (linkageError) console.error("[v0] HOD linkage error:", linkageError)
      hasHodLinkage = Boolean((linkage as any)?.id)
    } catch (err) {
      console.error("[v0] HOD linkage exception:", err)
      hasHodLinkage = false
    }

    // Fetch staff leave requests
    try {
      const { data: requests, error: requestError } = await admin
        .from("leave_plan_requests")
        .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (requestError) {
        console.error("[v0] Staff requests error:", requestError)
      }

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
    } catch (err) {
      console.error("[v0] Staff requests exception:", err)
      staffRequests = []
    }

    const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const canReviewLeave = [
      "admin",
      "regional_manager",
      "department_head",
      "hr_officer",
      "hr_leave_office",
      "hr_office",
      "hr",
      "manager_hr",
      "director_hr",
      "hr_director",
      "loan_office",
      "it_admin",
    ].includes(roleNorm)

    // Fetch manager notifications for reviewers
    if (canReviewLeave) {
      try {
        const reviewerFilter = ["admin", "hr_leave_office", "hr_office", "hr"].includes(roleNorm)
          ? undefined
          : user.id
        
        const query = admin
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

        const result = reviewerFilter ? query.eq("reviewer_id", reviewerFilter) : query

        const { data: planningReviews, error: reviewError } = await result

        if (reviewError) {
          console.error("[v0] Leave reviews error:", reviewError)
        }

        const notifications = (planningReviews || []).filter((review: any) => Boolean(review?.leave_plan_request))

        const requesterIds = Array.from(
          new Set(notifications.map((review: any) => String(review.leave_plan_request?.user_id || "")).filter(Boolean))
        )

        let requesterProfiles: any[] = []
        if (requesterIds.length > 0) {
          try {
            const { data, error: profilesError } = await admin
              .from("user_profiles")
              .select("id, role, department_id, assigned_location_id, first_name, last_name")
              .in("id", requesterIds)
            if (profilesError) console.error("[v0] Requester profiles error:", profilesError)
            requesterProfiles = data || []
          } catch (err) {
            console.error("[v0] Requester profiles exception:", err)
          }
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
      } catch (err) {
        console.error("[v0] Manager notifications exception:", err)
        managerNotifications = []
      }
    }

    return (
      <div className="leave-theme">
        <LeaveManagementModuleClient
          userId={user.id}
          userRole={profile.role}
          userDepartment={profile.department_id}
          userFirstName={(profile as any)?.first_name || null}
          userLastName={(profile as any)?.last_name || null}
          inactivityDays={Math.max(1, inactivityDays)}
          userDepartmentName={(profile as any)?.departments?.name || null}
          userDepartmentCode={(profile as any)?.departments?.code || null}
          hasHodLinkage={hasHodLinkage}
          initialStaffRequests={staffRequests}
          initialManagerNotifications={managerNotifications}
        />
      </div>
    )
  } catch (error) {
    console.error("[v0] Leave Management Page - Fatal error:", error)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Leave Management</h2>
          <p className="text-red-700 text-sm mb-4">
            We encountered an error while loading the leave management page. Please try refreshing the page or contact support.
          </p>
          <p className="text-xs text-red-600">{String(error)}</p>
        </div>
      </div>
    )
  }
}
