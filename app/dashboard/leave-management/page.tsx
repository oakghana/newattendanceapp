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

  let staffRequests = []
  let managerNotifications = []
  let approvedStaffRequests = [] // NEW: For HOD/RM deferment/recall operations
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
      .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, created_at, adjusted_start_date, adjusted_end_date, hod_decision, memo_token")
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
      adjusted_start_date: request.adjusted_start_date,
      adjusted_end_date: request.adjusted_end_date,
      hod_decision: request.hod_decision,
      memo_token: request.memo_token || null,
    }))
  }

  const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  const isAdminRole = roleNorm === "admin"

  const canReviewLeave = isAdminRole ||
    [
      "regional_manager",
      "department_head",
      "hr_officer",
      "hr_leave_office",
      "hr_office",
      "hr",
      "manager_hr",
      "director_hr",
      "hr_director",
      "it_admin",
    ].includes(roleNorm)

  // Fetch leave planning review assignments for HOD/HR/admin metrics and queue summaries.
  if (canReviewLeave) {
    // ADMIN: See ALL reviews without restriction
    // Non-admin HR roles: Only see their own reviews
    const reviewerFilter = isAdminRole || ["hr_leave_office", "hr_office", "hr"].includes(roleNorm)
      ? undefined
      : user.id
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

  // Fetch approved leaves from staff for HOD/RM to perform deferment/recall
  // For ALL users who are HOD/RM/HR, fetch approved annual leaves from ALL staff
  if (canReviewLeave) {
    try {
      // Simply fetch ALL approved annual leave requests regardless of department/location
      // Users with search/filter capability can then find what they need
      const { data: allApprovedLeaves, error: queryError } = await admin
        .from("leave_plan_requests")
        .select(`
          id,
          user_id,
          preferred_start_date,
          preferred_end_date,
          leave_type_key,
          reason,
          status,
          created_at,
          hr_signature_image_url,
          hr_approved_at,
          memo_token
        `)
        // No user_id filter - get ALL approved leaves
        .order("preferred_start_date", { ascending: true })

      if (queryError) {
        console.error("[v0] Error fetching all approved leaves:", queryError)
        approvedStaffRequests = []
      } else {
        // Get all unique statuses to understand what we have
        const uniqueStatuses = new Set((allApprovedLeaves || []).map((l: any) => l.status))

        // Filter for approved-like statuses (be flexible with status names)
        const approvedLeaves = (allApprovedLeaves || []).filter((leave: any) => {
          const status = String(leave.status || "").toLowerCase().trim()
          // Include any status that suggests approval/signing
          return ["approved", "hr_approved", "signed", "active", "confirmed", "accepted", "processing"].includes(status)
        })

        // Get user IDs for profile lookup
        const userIds = new Set((approvedLeaves || []).map((l: any) => l.user_id).filter(Boolean))

        // Fetch user profiles
        const { data: staffProfiles } = await admin
          .from("user_profiles")
          .select("id, first_name, last_name, position, assigned_location_id, employee_id, department_id")
          .in("id", Array.from(userIds))

        const profileMap = new Map((staffProfiles || []).map((p: any) => [p.id, p]))

        // Fetch locations
        const locationIds = new Set((staffProfiles || []).map((p: any) => p.assigned_location_id).filter(Boolean))
        let locations: any[] = []
        if (locationIds.size > 0) {
          try {
            const { data: locData } = await admin
              .from("geofence_locations")
              .select("id, name")
              .in("id", Array.from(locationIds))
            locations = locData || []
          } catch (err) {
            console.error("[v0] Error fetching locations:", err)
          }
        }
        const locationMap = new Map((locations || []).map((l: any) => [l.id, l.name]))

        // Fetch departments
        const deptIds = new Set((staffProfiles || []).map((p: any) => p.department_id).filter(Boolean))
        let departments: any[] = []
        if (deptIds.size > 0) {
          try {
            const { data: deptData } = await admin
              .from("departments")
              .select("id, name")
              .in("id", Array.from(deptIds))
            departments = deptData || []
          } catch (err) {
            console.error("[v0] Error fetching departments:", err)
          }
        }
        const departmentMap = new Map((departments || []).map((d: any) => [d.id, d.name]))

        // Filter for annual leaves and map to display format
        // ADMINS: See ALL approved leaves regardless of type (for full visibility)
        // Non-admins: Only annual leaves (for deferment/recall operations)
        approvedStaffRequests = (approvedLeaves || [])
          .filter((req: any) => isAdminRole || req.leave_type_key === "annual")  // Admins see ALL, non-admins see only annual
          .map((req: any) => {
            const staffProfile = profileMap.get(req.user_id) || {}
            const locationName = staffProfile.assigned_location_id 
              ? locationMap.get(staffProfile.assigned_location_id) 
              : null
            const departmentName = staffProfile.department_id
              ? departmentMap.get(staffProfile.department_id)
              : null
            const firstName = String(staffProfile.first_name || "").trim()
            const lastName = String(staffProfile.last_name || "").trim()
            const fullName = [firstName, lastName].filter(Boolean).join(" ")
            const empId = staffProfile.employee_id ? ` (#${staffProfile.employee_id})` : ""

            return {
              id: String(req.id),
              user_id: String(req.user_id),
              start_date: req.preferred_start_date,
              end_date: req.preferred_end_date,
              reason: req.reason || "",
              leave_type: req.leave_type_key || "annual",
              status: req.status,
              created_at: req.created_at,
              user_name: fullName ? `${fullName}${empId}` : `User${empId || " (Unknown)"}`,
              rank: staffProfile.position || undefined,
              location: locationName || undefined,
              location_id: staffProfile.assigned_location_id || undefined,
              department: departmentName || undefined,
              department_id: staffProfile.department_id || undefined,
              memo_token: req.memo_token || null,
            }
          })
      }
    } catch (error) {
      console.error("[v0] Error fetching approved staff requests:", error)
      approvedStaffRequests = []
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
        initialApprovedStaffRequests={approvedStaffRequests}
      />
    </div>
  )
}
