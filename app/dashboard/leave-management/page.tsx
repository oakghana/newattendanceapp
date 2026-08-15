import { createAdminClient, createClient } from "@/lib/supabase/server"
import { LeaveManagementModuleClient } from "./leave-management-module-client"
import { LeaveManagementPageWrapper } from "@/components/leave/leave-management-page-wrapper"
import { isExcludedLocation, resolveSelfLeaveRoute } from "@/lib/hr-workflow"
import { Suspense } from "react"


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
    .select("role, department_id, assigned_location_id, region_id, first_name, last_name, departments(name, code)")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-600">Unable to load your profile. Please refresh or contact support.</p>
      </div>
    )
  }

  // Fetch only essential fast queries first
  let staffRequests: any[] = []
  let managerNotifications: any[] = []
  let hasHodLinkage = false
  let userLocationName: string | null = null
  const normalizedRole = String(profile.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const isItAdmin = normalizedRole === "it_admin"
  const isRegionalHr = ["regional_hr", "regional_hr_officer", "regional_hr_office", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole) || (normalizedRole.includes("regional") && normalizedRole.includes("hr"))
  const isRegionalManager = normalizedRole === "regional_manager" || normalizedRole === "regional_manager_officer"

  try {
    // Build parallel queries — include location lookup when user has an assigned location
    const locationId = (profile as any)?.assigned_location_id
    const queries: any[] = [
      admin
        .from("leave_plan_requests")
        .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, workflow_route, workflow_stage, created_at, adjusted_start_date, adjusted_end_date, hod_decision, memo_token")
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
    userLocationName = (locationRes?.data as any)?.name || null
    const selfLeaveResolution = resolveSelfLeaveRoute({ role: profile.role, locationName: userLocationName })

    if (!isRegionalHr && !isRegionalManager && !isItAdmin) {
      // Legacy/non-regional workflow: HODs receive only requests explicitly
      // linked to them. Regional requests never enter this queue.
        const { data: hodLinks } = await admin
          .from("loan_hod_linkages")
          .select("staff_user_id")
          .eq("hod_user_id", user.id)
        const staffIds = Array.from(new Set((hodLinks || []).map((row: any) => row.staff_user_id).filter(Boolean)))
      // Query direct request assignment even when legacy linkage tables are empty.
      if (staffIds.length >= 0) {
        const requestSelect = "id, user_id, hod_user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, workflow_route, workflow_stage, created_at, hod_decision, memo_token, user_profiles:user_id(first_name, last_name, employee_id, assigned_location_id)"
        const baseHodQuery = (query: any) => query
          .or("workflow_route.is.null,workflow_route.eq.legacy")
          .in("status", ["pending_hod_review", "pending_hod", "pending", "submitted", "pending_review"])
          .or("hod_decision.is.null,hod_decision.eq.pending")
          .order("created_at", { ascending: true })
          .limit(100)
        const [{ data: linkedRequests }, { data: directlyAssignedRequests }] = await Promise.all([
          baseHodQuery(
            admin.from("leave_plan_requests").select(requestSelect).in("user_id", staffIds),
          ),
          baseHodQuery(
            admin.from("leave_plan_requests").select(requestSelect).eq("hod_user_id", user.id),
          ),
        ])
        const hodRequests = Array.from(new Map(
          [...(linkedRequests || []), ...(directlyAssignedRequests || [])].map((request: any) => [request.id, request]),
        ).values())
        const hodLocationIds = Array.from(new Set((hodRequests || []).map((request: any) => request.user_profiles?.assigned_location_id).filter(Boolean)))
        const { data: hodLocations } = hodLocationIds.length
          ? await admin.from("geofence_locations").select("id, name, code").in("id", hodLocationIds)
          : { data: [] }
        const hodLocationMap = new Map((hodLocations || []).map((location: any) => [location.id, location]))
        managerNotifications = (hodRequests || []).map((request: any) => {
          const staff = request.user_profiles || {}
          const location = hodLocationMap.get(staff.assigned_location_id)
          return {
            id: request.id,
            status: request.status || "pending_hod_review",
            review_decision: request.hod_decision || "pending",
            requester_name: `${staff.first_name || ""} ${staff.last_name || ""}`.trim(),
            requester_role: "staff",
            staff_location_name: location?.name || null,
            staff_location_code: location?.code || null,
            leave_requests: {
              id: request.id,
              user_id: request.user_id,
              start_date: request.preferred_start_date,
              end_date: request.preferred_end_date,
              reason: request.reason || "",
              leave_type: request.leave_type_key || "",
              status: request.status || "pending_hod_review",
              created_at: request.created_at,
              memo_token: request.memo_token || null,
              user_name: `${staff.first_name || ""} ${staff.last_name || ""}`.trim(),
            },
          }
        })
      }
    }

    if ((isRegionalHr || isRegionalManager || isItAdmin) && (locationId || (profile as any)?.region_id)) {
      const staffQuery = admin
        .from("user_profiles")
        .select("id")
        .neq("id", user.id)
      const { data: locationStaff } = locationId
        ? await staffQuery.eq("assigned_location_id", locationId)
        : { data: [] }
      const { data: regionStaff } = (profile as any)?.region_id
        ? await admin
            .from("user_profiles")
            .select("id")
            .eq("region_id", (profile as any).region_id)
            .neq("id", user.id)
        : { data: [] }
      const regionalStaffIds = Array.from(new Set([...(locationStaff || []), ...(regionStaff || [])].map((row: any) => row.id).filter(Boolean)))
      if (regionalStaffIds.length > 0) {
        const { data: regionalRequests } = await admin
          .from("leave_plan_requests")
          .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, workflow_route, workflow_stage, created_at, memo_token, memo_reference, user_profiles:user_id(first_name, last_name, employee_id, assigned_location_id, region_id)")
          .in("user_id", regionalStaffIds)
          .eq("workflow_route", "regional")
          .in("status", isRegionalManager ? ["pending_regional_manager_approval", "approved", "regional_manager_approved"] : ["pending_regional_hr_office_review", "pending_regional_hr_review", "regional_hr_office_review", "pending_regional_manager_approval"])
          .order("created_at", { ascending: false })
          .limit(100)
        const regionalLocationIds = Array.from(new Set((regionalRequests || []).map((request: any) => request.user_profiles?.assigned_location_id).filter(Boolean)))
        const { data: regionalLocations } = regionalLocationIds.length
          ? await admin.from("geofence_locations").select("id, name").in("id", regionalLocationIds)
          : { data: [] }
        const regionalLocationMap = new Map((regionalLocations || []).map((location: any) => [location.id, location]))
        const reviewerStaffIds = (regionalRequests || []).map((request: any) => request.user_id).filter(Boolean)
        const { data: regionalLinkages } = regionalStaffIds.length
          ? await admin.from("loan_hod_linkages").select("staff_user_id, hod_user_id").in("staff_user_id", reviewerStaffIds)
          : { data: [] }
        const regionalHodIds = Array.from(new Set((regionalLinkages || []).map((link: any) => link.hod_user_id).filter(Boolean)))
        const { data: regionalHods } = regionalHodIds.length
          ? await admin.from("user_profiles").select("id, first_name, last_name, employee_id, position").in("id", regionalHodIds)
          : { data: [] }
        const regionalHodMap = new Map((regionalHods || []).map((hod: any) => [hod.id, hod]))
        const regionalLinkageMap = new Map((regionalLinkages || []).map((link: any) => [link.staff_user_id, regionalHodMap.get(link.hod_user_id)]))
        managerNotifications = (regionalRequests || []).map((request: any) => ({
          id: request.id,
          status: request.status,
          workflow_route: request.workflow_route,
          workflow_stage: request.workflow_stage,
          requester_name: `${request.user_profiles?.first_name || ""} ${request.user_profiles?.last_name || ""}`.trim(),
          requester_role: "staff",
          staff_location_name: regionalLocationMap.get(request.user_profiles?.assigned_location_id)?.name || null,
          staff_location_code: regionalLocationMap.get(request.user_profiles?.assigned_location_id)?.code || null,
          hod_name: (() => { const hod = regionalLinkageMap.get(request.user_id); return hod ? `${hod.first_name || ""} ${hod.last_name || ""}`.trim() : null })(),
          hod_employee_id: regionalLinkageMap.get(request.user_id)?.employee_id || null,
          hod_position: regionalLinkageMap.get(request.user_id)?.position || null,
          leave_requests: {
            id: request.id,
            user_id: request.user_id,
            start_date: request.preferred_start_date,
            end_date: request.preferred_end_date,
            reason: request.reason || "",
            leave_type: request.leave_type_key || "",
            status: request.status,
            created_at: request.created_at,
            memo_token: request.memo_token || null,
            memo_reference: request.memo_reference || null,
            user_name: `${request.user_profiles?.first_name || ""} ${request.user_profiles?.last_name || ""}`.trim(),
          },
        }))
      }
    }

    if (selfLeaveResolution.isSelfLeave) {
      const misplacedRequests = (requestsRes.data || []).filter((request: any) => request.workflow_route !== "self_leave" || request.status === "pending_regional_hr_review" || request.status === "pending_regional_hr_office_review" || request.status === "regional_hr_office_review" || request.status === "pending_hod_review")
      if (misplacedRequests.length > 0) {
        await Promise.all(misplacedRequests.map((request: any) => admin.from("leave_plan_requests").update({ status: "pending_hr_leave_processing", workflow_route: "self_leave", workflow_stage: "hr_leave_office" }).eq("id", request.id)))
        for (const request of requestsRes.data || []) {
          if (misplacedRequests.some((item: any) => item.id === request.id)) {
            request.status = "pending_hr_leave_processing"
            request.workflow_route = "self_leave"
            request.workflow_stage = "hr_leave_office"
          }
        }
      }
    }

    staffRequests = (requestsRes.data || []).map((request: any) => ({
      id: String(request.id),
      user_id: String(request.user_id),
      start_date: request.preferred_start_date,
      end_date: request.preferred_end_date,
      reason: request.reason || "",
      leave_type: request.leave_type_key || "annual",
      status: request.status,
      workflow_route: request.workflow_route,
      workflow_stage: request.workflow_stage,
      created_at: request.created_at,
      adjusted_start_date: request.adjusted_start_date,
      adjusted_end_date: request.adjusted_end_date,
      hod_decision: request.hod_decision,
      memo_token: request.memo_token || null,
    }))

    hasHodLinkage = Boolean((linkageRes?.data as any)?.id)
  } catch (err) {
    console.error("[v0] Error fetching essential data:", err)
    hasHodLinkage = false
  }

  // Heavy reviewer queries are lazy-loaded client-side to keep page fast
  const approvedStaffRequests: any[] = []
  const profileRole = String(profile.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const effectiveRole = isRegionalHr || (String(userLocationName || "").toLowerCase().includes("regional") && profileRole.includes("hr"))
    ? "regional_hr_leave_office"
    : profile.role

  try {
    return (
      <LeaveManagementPageWrapper>
      <div className="leave-theme">
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading leave management...</div>}>
          <LeaveManagementModuleClient
            userId={user.id}
            userRole={effectiveRole}
            userDepartment={(profile as any)?.department_id || null}
            userLocationId={(profile as any)?.assigned_location_id || null}
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
        </Suspense>
      </div>
      </LeaveManagementPageWrapper>
    )
  } catch (renderErr: any) {
    console.error("[v0] Leave management render error:", renderErr?.message, renderErr?.stack)
    return (
      <div className="leave-theme p-8 text-center">
        <p className="text-red-600 font-semibold">Failed to load leave management page.</p>
        <p className="text-slate-500 text-sm mt-1">{renderErr?.message || "Unknown error"}</p>
      </div>
    )
  }
}
