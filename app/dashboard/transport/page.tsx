import { redirect } from "next/navigation"
import { TransportWorkspace } from "@/components/transport/transport-workspace"
import { createClient } from "@/lib/supabase/server"
import { canCreateTransportRequest, canManageTransport, isChiefDriverRole, isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"

const TRANSPORT_ROLES = new Set([
  "admin", "administrator", "it-admin", "it_admin", "driver", "chief_driver", "transport_manager", "regional_hr", "regional hr", "regional_hr_office", "regional hr office", "regional_hr_officer", "regional hr officer", "regional_manager", "regional manager",
  "hr_records", "hr_records_officer", "hr_records_manager", "hr", "department_head", "managing_director", "director_hr", "manager_hr", "hr_executive", "hr_executive_officer",
])

const APPROVED_STAGES = new Set(["approved", "referenced", "completed", "hr_records_review", "transport_manager_assignment", "assigned"])
const PENDING_STAGES = new Set(["submitted", "regional_manager_endorsement", "chief_driver_assignment", "managing_director_approval", "hr_executive_signing", "regional_hr_correction", "pending_md_approval", "pending_hr_executive", "awaiting_transport_manager"])

export default async function TransportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select(
      "role, first_name, last_name, region_id, assigned_location_id, regions(name), departments(name), geofence_locations!user_profiles_assigned_location_id_fkey(name, district_id, districts(region_id))",
    )
    .eq("id", user.id)
    .maybeSingle()
  const normalizedRole = normalizeAppRole(profile?.role)
  const departmentName = (profile as { departments?: { name?: string | null } | null } | null)?.departments?.name ?? ""
  const locationName = (profile as { geofence_locations?: { name?: string | null } | null } | null)?.geofence_locations?.name ?? ""
  const hasTransportAccess = TRANSPORT_ROLES.has(normalizedRole) || canManageTransport(profile?.role) || canCreateTransportRequest(profile?.role) || ["managing_director", "hr_executive", "hr_executive_officer", "department_head", "transport_manager"].includes(normalizedRole)
  if (!profile || !hasTransportAccess) redirect("/dashboard")

  const isManagingDirector = ["managing_director", "director"].includes(normalizedRole)
  const isHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const isDepartmentHead = normalizedRole === "department_head"
  const isTransportManager = normalizedRole === "transport_manager"
  const isChiefDriver = isChiefDriverRole(profile.role)
  const isRegionalHr = isRegionalHrRole(profile.role)
  const isRegionalManager = isRegionalManagerRole(profile.role)
  const isRegionalScoped = isChiefDriver || isRegionalHr || isRegionalManager

  const assignedLocation = profile.geofence_locations as { name?: string | null; district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  const locationId = profile.assigned_location_id ?? null
  const districtId = assignedLocation?.district_id ?? null
  const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  const profileRegion = (profile as { regions?: { name?: string | null } | null }).regions
  const assignedLocationName = assignedLocation?.name?.trim() ?? ""
  const locationRegionAliases: Record<string, string> = { kumasi: "Ashanti", "kumasi regional office": "Ashanti", accra: "Greater Accra", "accra regional office": "Greater Accra", takoradi: "Western", cape: "Central", sunyani: "Bono", tamale: "Northern", bolgatanga: "Upper East", wa: "Upper West", koforidua: "Eastern", ho: "Volta" }
  const locationKey = assignedLocationName.toLowerCase().replace(/\s+/g, " ").trim()
  const locationRegionName = Object.entries(locationRegionAliases).find(([key]) => locationKey.includes(key))?.[1] ?? ""
  const rawRegionalName = locationRegionName || (assignedLocationName && !/accra|head office/i.test(assignedLocationName) ? assignedLocationName : "") || profileRegion?.name?.trim() || ""
  const scopeLabel = isRegionalScoped
    ? (rawRegionalName ? `${rawRegionalName.replace(/\s+Regional\s+Office$/i, "").replace(/\s+Region$/i, "").trim()} Region` : assignedLocationName || "Assigned region")
    : isDepartmentHead
      ? "Your non-regional trips"
      : isTransportManager
        ? "Nationwide"
        : ""

  let pendingCount = 0
  let totalCount = 0
  let approvedCount = 0
  let assignedCount = 0
  let regionalPendingCount = 0
  let nonRegionalPendingCount = 0
  let queueRows: { id: string; purpose: string; origin: string; destination: string; event_date: string | null; reference_number: string | null; request_type: "regional" | "nonregional" }[] = []

  if (isDepartmentHead) {
    try {
      const { data: myRows } = await supabase
        .from("nonregional_transport_requisitions")
        .select("id, status, md_decision, recommended_driver_id")
        .eq("requester_id", user.id)
      const rows = myRows ?? []
      totalCount = rows.length
      pendingCount = rows.filter((row) => row.md_decision === "pending").length
      approvedCount = rows.filter((row) => row.md_decision === "approved").length
      assignedCount = rows.filter((row) => row.status === "assigned" || Boolean(row.recommended_driver_id)).length
    } catch (error) {
      console.error("[v0] Transport landing: HOD non-regional metrics unavailable", error)
    }
  } else if (isRegionalScoped) {
    try {
      let query = supabase
        .from("transport_requests")
        .select("id, status, workflow_stage, assigned_region_id, linked_district_id, origin_location_id")
        .in("request_type", ["regional_transport", "regional_local"])
        .order("created_at", { ascending: false })
        .limit(500)
      if (locationId) query = query.or(`origin_location_id.eq.${locationId},and(origin_location_id.is.null,assigned_region_id.eq.${regionId || "00000000-0000-0000-0000-000000000000"})`)
      else if (districtId) query = query.eq("linked_district_id", districtId)
      else if (regionId) query = query.eq("assigned_region_id", regionId)
      const { data: rows } = await query
      const scoped = (rows ?? []).filter((row) => {
        if (locationId && row.origin_location_id === locationId) return true
        if (!row.origin_location_id && districtId && row.linked_district_id === districtId) return true
        if (!row.origin_location_id && !districtId && regionId && row.assigned_region_id === regionId) return true
        if (!locationId && !districtId && !regionId) return false
        // Prefer explicit location match; also allow region match when location was null on older rows
        if (regionId && row.assigned_region_id === regionId) return true
        return false
      })
      totalCount = scoped.length
      pendingCount = scoped.filter((row) => PENDING_STAGES.has(String(row.workflow_stage || "")) || !APPROVED_STAGES.has(String(row.workflow_stage || "")) && !["rejected", "closed"].includes(String(row.status || ""))).length
      approvedCount = scoped.filter((row) => ["approved", "referenced", "completed"].includes(String(row.status || "")) || ["referenced", "completed", "approved", "hr_records_review"].includes(String(row.workflow_stage || ""))).length
      if (isRegionalManager) {
        pendingCount = scoped.filter((row) => row.workflow_stage === "regional_manager_endorsement").length
      } else if (isChiefDriver) {
        pendingCount = scoped.filter((row) => row.workflow_stage === "chief_driver_assignment").length
        assignedCount = scoped.filter((row) => row.workflow_stage === "assigned" || row.status === "assigned").length
      }
    } catch (error) {
      console.error("[v0] Transport landing: regional metrics unavailable", error)
    }
  } else if (isTransportManager || ["admin", "administrator", "it_admin"].includes(normalizedRole)) {
    try {
      const [{ data: regionalRows }, { data: nonRegionalRows }] = await Promise.all([
        supabase.from("transport_requests").select("id, status, workflow_stage").order("created_at", { ascending: false }).limit(500),
        supabase.from("nonregional_transport_requisitions").select("id, status, md_decision, recommended_driver_id").order("created_at", { ascending: false }).limit(500),
      ])
      const regional = regionalRows ?? []
      const nonRegional = nonRegionalRows ?? []
      totalCount = regional.length + nonRegional.length
      pendingCount =
        regional.filter((row) => ["transport_manager_assignment", "hr_records_review", "regional_manager_endorsement", "managing_director_approval", "hr_executive_signing"].includes(String(row.workflow_stage || ""))).length +
        nonRegional.filter((row) => row.md_decision === "pending" || row.status === "awaiting_transport_manager").length
      approvedCount =
        regional.filter((row) => ["approved", "referenced", "completed"].includes(String(row.status || "")) || ["referenced", "completed", "transport_manager_assignment"].includes(String(row.workflow_stage || ""))).length +
        nonRegional.filter((row) => row.md_decision === "approved").length
      assignedCount = nonRegional.filter((row) => row.status === "assigned" || Boolean(row.recommended_driver_id)).length
    } catch (error) {
      console.error("[v0] Transport landing: manager metrics unavailable", error)
    }
  } else {
    try {
      const { count: allTransportCount } = await supabase.from("transport_requests").select("id", { count: "exact", head: true })
      totalCount = allTransportCount ?? 0
    } catch (error) {
      console.error("[v0] Transport landing: request count unavailable", error)
    }
  }

  if (isManagingDirector || isHrExecutive) {
    try {
      const stage = isManagingDirector ? "managing_director_approval" : "hr_executive_signing"
      const { count: total } = await supabase.from("transport_requests").select("id", { count: "exact", head: true })
      const { data: pendingRows, count: pending } = await supabase.from("transport_requests").select("id, purpose, origin, destination, event_date, reference_number", { count: "exact" }).eq("workflow_stage", stage).order("created_at", { ascending: false }).limit(4)
      totalCount = total ?? totalCount
      regionalPendingCount = pending ?? 0
      queueRows = (pendingRows ?? []).map((row) => ({ ...row, request_type: "regional" as const }))
    } catch (error) {
      console.error("[v0] Transport landing: approval queue unavailable", error)
    }

    if (isManagingDirector) {
      try {
        const { count: nonRegionalTotal } = await supabase.from("nonregional_transport_requisitions").select("id", { count: "exact", head: true })
        const { count: nonRegionalPending } = await supabase
          .from("nonregional_transport_requisitions")
          .select("id", { count: "exact", head: true })
          .eq("md_decision", "pending")
          .neq("status", "awaiting_hod_approval")
          .neq("hod_decision", "pending")
        const { data: nonRegionalRows } = await supabase.from("nonregional_transport_requisitions").select("id, purpose, origin, destination, required_at, department, location, status, hod_decision, md_decision").eq("md_decision", "pending").neq("status", "awaiting_hod_approval").neq("hod_decision", "pending").order("created_at", { ascending: false }).limit(4)
        totalCount += nonRegionalTotal ?? 0
        nonRegionalPendingCount = nonRegionalPending ?? 0
        queueRows = [...queueRows, ...(nonRegionalRows ?? []).map((row) => ({ id: row.id, purpose: row.purpose, origin: row.origin, destination: row.destination, event_date: row.required_at, reference_number: `${row.department} · ${row.location}`, request_type: "nonregional" as const }))]
      } catch (error) {
        console.error("[v0] Transport landing: non-regional queue unavailable", error)
      }
    }
    pendingCount = regionalPendingCount + nonRegionalPendingCount
  }

  return (
    <TransportWorkspace
      role={normalizedRole}
      requesterName={[profile.first_name, profile.last_name].filter(Boolean).join(" ")}
      requesterDepartment={departmentName}
      requesterLocation={locationName}
      pendingCount={pendingCount}
      totalCount={totalCount}
      approvedCount={approvedCount}
      assignedCount={assignedCount}
      queueRows={queueRows}
      regionalPendingCount={regionalPendingCount}
      nonRegionalPendingCount={nonRegionalPendingCount}
      scopeLabel={scopeLabel}
    />
  )
}
