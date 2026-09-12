import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isAdminRole, isDepartmentHeadRole, isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"
import { isNonRegionalLocation } from "@/lib/location-mappings"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get user's role, department, and assigned location
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    const normalizedRole = normalizeAppRole(userProfile?.role)
    const userDepartment = userProfile?.department_id
    const userLocationId = userProfile?.assigned_location_id

    // HR-level roles that can see all departments. Regional Manager / Regional HR
    // Office are scoped to their own regional office below, not treated as global.
    const HR_GLOBAL_ROLES = ["hr_leave_office", "hr_office", "director_hr", "manager_hr", "hr_executive", "hr"]
    const isGlobalRole = isAdminRole(normalizedRole) || HR_GLOBAL_ROLES.includes(normalizedRole)
    const isRegionalScoped = isRegionalManagerRole(normalizedRole) || isRegionalHrRole(normalizedRole)
    const isDeptHead = isDepartmentHeadRole(normalizedRole)

    // Optional: filter by month query param  ?month=2026-04
    const url = new URL(request.url)
    const monthParam = url.searchParams.get("month")
    let rangeStart: string
    let rangeEnd: string

    if (monthParam) {
      const [y, m] = monthParam.split("-").map(Number)
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0) // last day of month
      rangeStart = start.toISOString().split("T")[0]
      rangeEnd = end.toISOString().split("T")[0]
    } else {
      // Default: current month
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      rangeStart = start.toISOString().split("T")[0]
      rangeEnd = end.toISOString().split("T")[0]
    }

    // Current workflow source: leave_plan_requests with final HR approval.
    let requestsQuery = admin
      .from("leave_plan_requests")
      .select("id, user_id, leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, status, is_archived")
      .eq("status", "hr_approved")
      .eq("is_archived", false)
      .order("preferred_start_date", { ascending: true })

    // For non-HR roles: scope to staff they are actually linked to, either by
    // regional office location (Regional Manager / Regional HR Office) or by
    // department (Department Head at a non-regional / head-office location).
    // Every other role only ever sees its own department's peers.
    let scopeLabel = "All departments"
    let totalStaffInScope = 0
    if (!isGlobalRole && isRegionalScoped) {
      const ownedLocationIds = await resolveOwnedLocationIdsForRegionalOffice(admin, userLocationId)
      const staffIds = ownedLocationIds.length
        ? ((await admin.from("user_profiles").select("id").in("assigned_location_id", ownedLocationIds)).data || []).map((s: any) => s.id)
        : []
      if (staffIds.length === 0) {
        return NextResponse.json({ entries: [], rangeStart, rangeEnd, isGlobalRole: false, scopeLabel: "Your regional office", totalStaffInScope: 0 })
      }
      requestsQuery = requestsQuery.in("user_id", staffIds)
      scopeLabel = "Your regional office & district staff"
      totalStaffInScope = staffIds.length
    } else if (!isGlobalRole && isDeptHead) {
      // Only a department head at a non-regional (e.g. head-office) location gets
      // department-wide visibility. Regional/district staff are scoped via location above.
      let isNonRegionalDeptHead = true
      if (userLocationId) {
        const { data: location } = await admin.from("geofence_locations").select("name").eq("id", userLocationId).maybeSingle()
        isNonRegionalDeptHead = isNonRegionalLocation(location?.name)
      }
      const staffIds = isNonRegionalDeptHead && userDepartment
        ? ((await admin.from("user_profiles").select("id").eq("department_id", userDepartment)).data || []).map((s: any) => s.id)
        : []
      if (staffIds.length === 0) {
        return NextResponse.json({ entries: [], rangeStart, rangeEnd, isGlobalRole: false, scopeLabel: "Your department", totalStaffInScope: 0 })
      }
      requestsQuery = requestsQuery.in("user_id", staffIds)
      scopeLabel = "Your department"
      totalStaffInScope = staffIds.length
    } else if (!isGlobalRole) {
      const staffIds = userDepartment
        ? ((await admin.from("user_profiles").select("id").eq("department_id", userDepartment)).data || []).map((s: any) => s.id)
        : []
      if (staffIds.length === 0) {
        return NextResponse.json({ entries: [], rangeStart, rangeEnd, isGlobalRole: false, scopeLabel: "Your department", totalStaffInScope: 0 })
      }
      requestsQuery = requestsQuery.in("user_id", staffIds)
      scopeLabel = "Your department"
      totalStaffInScope = staffIds.length
    }

    if (isGlobalRole) {
      const { count } = await admin.from("user_profiles").select("id", { count: "exact", head: true }).eq("is_active", true)
      totalStaffInScope = count ?? 0
    }

    const { data: requests, error } = await requestsQuery

    if (error) return NextResponse.json({ entries: [], rangeStart, rangeEnd })

    const normalized = (requests || []).flatMap((r: any) => {
      const startDate = String(r?.adjusted_start_date || r?.preferred_start_date || "")
      const endDate = String(r?.adjusted_end_date || r?.preferred_end_date || "")
      if (!startDate || !endDate) return []
      if (startDate > rangeEnd || endDate < rangeStart) return []
      return [{
        id: String(r.id),
        userId: String(r.user_id || ""),
        leaveType: String(r.leave_type_key || "annual"),
        startDate,
        endDate,
      }]
    })

    const userIds = Array.from(new Set(normalized.map((r: any) => r.userId).filter(Boolean)))
    let usersById = new Map<string, any>()
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, department_id, position")
        .in("id", userIds)

      const departmentIds = Array.from(new Set((profiles || []).map((p: any) => String(p?.department_id || "")).filter(Boolean)))
      let departmentsById = new Map<string, string>()
      if (departmentIds.length > 0) {
        const { data: departments } = await admin
          .from("departments")
          .select("id, name")
          .in("id", departmentIds)
        departmentsById = new Map((departments || []).map((d: any) => [String(d.id), String(d.name || "")]))
      }

      usersById = new Map((profiles || []).map((p: any) => [String(p.id), {
        name: `${String(p?.first_name || "")} ${String(p?.last_name || "")}`.trim(),
        employeeId: p?.employee_id ?? null,
        position: p?.position ?? null,
        department: departmentsById.get(String(p?.department_id || "")) || null,
        departmentId: String(p?.department_id || ""),
      }]))
    }

    const entries = normalized.map((r: any) => {
      const profile = usersById.get(r.userId)
      // Calculate number of days
      let days = 0
      try {
        const ms = new Date(r.endDate).getTime() - new Date(r.startDate).getTime()
        days = Math.max(1, Math.round(ms / 86400000) + 1)
      } catch {}
      return {
        id: r.id,
        userId: r.userId,
        name: profile?.name || "Staff Member",
        employeeId: profile?.employeeId || null,
        position: profile?.position || null,
        department: profile?.department || null,
        departmentId: profile?.departmentId || null,
        leaveType: r.leaveType,
        startDate: r.startDate,
        endDate: r.endDate,
        days,
      }
    })

    return NextResponse.json({ entries, rangeStart, rangeEnd, isGlobalRole, scopeLabel, totalStaffInScope })
  } catch (err) {
    console.error("[leave/team-calendar]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
