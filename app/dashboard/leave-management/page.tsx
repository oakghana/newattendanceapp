import { createAdminClient, createClient } from "@/lib/supabase/server"
import { LeaveManagementModuleClient } from "./leave-management-module-client"
import { LeaveManagementPageWrapper } from "@/components/leave/leave-management-page-wrapper"
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
  const isRegionalHr = ["regional_hr", "regional_hr_officer", "regional_hr_office", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole) || (normalizedRole.includes("regional") && normalizedRole.includes("hr"))
  const isRegionalManager = normalizedRole === "regional_manager" || normalizedRole === "regional_manager_officer"

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

    if ((isRegionalHr || isRegionalManager) && (locationId || (profile as any)?.region_id)) {
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
          .select("id, user_id, preferred_start_date, preferred_end_date, reason, leave_type_key, status, created_at, user_profiles:user_id(first_name, last_name, employee_id, assigned_location_id, region_id)")
          .in("user_id", regionalStaffIds)
          .neq("leave_type_key", "annual")
          .in("status", isRegionalManager ? ["pending_regional_manager_approval"] : ["pending_hod_review", "pending_regional_hr_review", "pending_hr_review", "pending_regional_manager_approval"])
          .order("created_at", { ascending: false })
          .limit(100)
        managerNotifications = (regionalRequests || []).map((request: any) => ({
          id: request.id,
          status: request.status,
          leave_requests: {
            id: request.id,
            user_id: request.user_id,
            start_date: request.preferred_start_date,
            end_date: request.preferred_end_date,
            reason: request.reason || "",
            leave_type: request.leave_type_key || "",
            status: request.status,
            created_at: request.created_at,
            user_name: `${request.user_profiles?.first_name || ""} ${request.user_profiles?.last_name || ""}`.trim(),
          },
        }))
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
  const approvedStaffRequests: any[] = []
  const profileRole = String(profile.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const effectiveRole = isRegionalHr || (String(userLocationName || "").toLowerCase().includes("regional") && profileRole.includes("hr"))
    ? "regional_hr_leave_office"
    : profile.role

  try {
    return (
      <LeaveManagementPageWrapper>
      <div className="leave-theme">
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
