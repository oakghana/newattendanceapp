import type { SupabaseClient } from "@supabase/supabase-js"

export const NON_REGIONAL_LOCATIONS = [
  "Awutu Stores",
  "Nsawam Archive Center",
  "QCC Head Office",
  "HEAD OFFICE SWANZY ARCADE",
] as const

export const REGIONAL_LEAVE_STAGES = {
  regionalHrReview: "pending_regional_hr_review",
  regionalManagerApproval: "pending_regional_manager_approval",
  completed: "completed",
} as const

export function normalizeWorkflowRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
}

export function isHrRecordsRole(role: string | null | undefined) {
  return ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizeWorkflowRole(role))
}

export function isRegionalHrLeaveOfficeRole(role: string | null | undefined) {
  return ["regional_hr_leave_office", "regional_hr", "regional_leave_office"].includes(normalizeWorkflowRole(role))
}

export function canManageWorkflowMappings(role: string | null | undefined) {
  return ["admin", "super_admin", "god", "it_administrator", "it_admin", "system_administrator", "system_admin"].includes(normalizeWorkflowRole(role))
}

export function isAnnualLeave(leaveType: string | null | undefined) {
  return /^(annual|annual_leave)$/i.test(String(leaveType || "").trim())
}

export function normalizeReference(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ")
}

export function referenceKey(value: unknown) {
  return normalizeReference(value).toLowerCase()
}

export type LeaveRoute = "regional" | "legacy"

export type LeaveWorkflowStep = {
  key: string
  label: string
}

export type LeaveWorkflowView = {
  route: LeaveRoute
  currentStage: string | null
  statusLabel: string
  steps: LeaveWorkflowStep[]
}

const LEGACY_WORKFLOW_STEPS: LeaveWorkflowStep[] = [
  { key: "submitted", label: "Submitted" },
  { key: "hod_review", label: "HOD Review" },
  { key: "hr_leave_office", label: "HR Leave Office" },
  { key: "hr_approval", label: "HR Approval" },
]

const REGIONAL_WORKFLOW_STEPS: LeaveWorkflowStep[] = [
  { key: "submitted", label: "Submitted" },
  { key: "regional_hr_review", label: "Regional HR Office Review" },
  { key: "regional_manager_approval", label: "Regional Manager Approval" },
]

export function getLeaveWorkflowView(input: {
  route?: LeaveRoute | string | null
  workflowRoute?: LeaveRoute | string | null
  status?: string | null
  workflowStage?: string | null
  leaveType?: string | null
  locationName?: string | null
}): LeaveWorkflowView {
  const route = String(input.workflowRoute || input.route || "").toLowerCase() === "regional" ? "regional" : "legacy"
  const status = String(input.status || input.workflowStage || "pending_hod_review")
  const currentStage = input.workflowStage || status
  const statusLabel: Record<string, string> = {
    pending: "Pending HOD Review",
    pending_hod: "Pending HOD Review",
    pending_hod_review: "Pending HOD Review",
    pending_regional_hr_review: "Pending Regional HR Office Review",
    pending_regional_manager_approval: "Pending Regional Manager Approval",
    pending_hr_leave_processing: "Awaiting HR Leave Office Adjustment",
    hr_office_forwarded: "Pending HR Approval",
    hr_approved: "Approved",
    approved: "Approved",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  }
  return {
    route,
    currentStage,
    statusLabel: statusLabel[status] || status.replace(/_/g, " "),
    steps: route === "regional" ? REGIONAL_WORKFLOW_STEPS : LEGACY_WORKFLOW_STEPS,
  }
}

export function isRegionalWorkflowRequest(input: { workflowRoute?: string | null; route?: string | null; locationName?: string | null; leaveType?: string | null }) {
  if (String(input.workflowRoute || input.route || "").toLowerCase() === "regional") return true
  // Route is determined solely by the staff member's assigned location — leave
  // type and manager grade no longer carve out exceptions from this rule.
  return !isExcludedLocation(input.locationName)
}

export function normalizeLocationName(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[–—]/g, "-").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

export function isExcludedLocation(locationName: string | null | undefined) {
  const normalized = normalizeLocationName(locationName)
  if (!normalized) return false
  return NON_REGIONAL_LOCATIONS.some((location) => {
    const candidate = normalizeLocationName(location)
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized)
  }) || /(^| )qcc head office( |$)|(^| )head office( |$)|swanzy arcade|awutu stores|nsawam archive/.test(normalized)
}

export function isRegionalLeaveException(leaveType: string | null | undefined) {
  const normalized = normalizeLocationName(leaveType).replace(/ leave$/i, "")
  return ["manager annual", "manager grade annual", "maternity", "paternity", "part", "part time", "part time leave", "part leave"].includes(normalized)
}

/**
 * Route by the staff member's assigned location only. Non-regional/head-office
 * locations (Awutu Stores, Nsawam Archive Center, QCC Head Office, Head Office
 * Swanzy Arcade) always use the HOD -> HR Leave Office -> HR Executive -> HR
 * Records pipeline. Every other location uses the Regional HR Office ->
 * Regional Manager pipeline. Leave type and manager grade no longer affect
 * routing.
 */
export function routeLeave(input: { locationName?: string | null; hasRegionalOffice: boolean }): { route: LeaveRoute; firstStage: string | null; reason?: string } {
  if (isExcludedLocation(input.locationName)) {
    return { route: "legacy", firstStage: null, reason: "This location uses the non-regional/head-office workflow." }
  }
  if (!input.hasRegionalOffice) {
    return { route: "regional", firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview, reason: "Regional HR assignment is required before submission." }
  }
  return { route: "regional", firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview }
}

export type StaffAssignmentResolution = {
  staffId: string
  assignedLocationId: string | null
  regionId: string | null
  departmentId: string | null
  hodId: string | null
  regionalHrId: string | null
  regionalManagerId: string | null
  locationName: string | null
  source: "profile" | "location" | "unresolved"
}

/** Resolve reviewer IDs from stable foreign keys, never display names. */
export async function resolveStaffAssignments(admin: SupabaseClient, staffId: string): Promise<StaffAssignmentResolution> {
  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("id, assigned_location_id, region_id, department_id, geofence_locations:assigned_location_id (id, name, district_id)")
    .eq("id", staffId)
    .maybeSingle()
  if (error) throw error
  if (!profile) return { staffId, assignedLocationId: null, regionId: null, departmentId: null, hodId: null, regionalHrId: null, regionalManagerId: null, locationName: null, source: "unresolved" }

  const assignedLocation = Array.isArray(profile.geofence_locations) ? profile.geofence_locations[0] : profile.geofence_locations
  let regionId = profile.region_id || null
  if (!regionId && assignedLocation?.district_id) {
    const { data: district, error: districtError } = await admin.from("districts").select("region_id").eq("id", assignedLocation.district_id).maybeSingle()
    if (districtError) throw districtError
    regionId = district?.region_id || null
  }

  let hodId: string | null = null
  const { data: linkage } = await admin
    .from("loan_hod_linkages")
    .select("hod_user_id")
    .eq("staff_user_id", staffId)
    .limit(1)
    .maybeSingle()
  hodId = linkage?.hod_user_id || null
  if (!hodId && profile.department_id) {
    const { data: departmentHod } = await admin
      .from("user_profiles")
      .select("id")
      .eq("department_id", profile.department_id)
      .in("role", ["department_head", "manager_hr", "director_hr"])
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    hodId = departmentHod?.id || null
  }

  let regionalHrId: string | null = null
  let regionalManagerId: string | null = null
  if (profile.assigned_location_id) {
    const { data: canonicalAlignment, error: alignmentError } = await admin
      .from("regional_hr_office_locations")
      .select("regional_hr_user_id, regional_manager_user_id")
      .eq("location_id", profile.assigned_location_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (alignmentError) throw alignmentError
    if (canonicalAlignment?.regional_hr_user_id) {
      regionalHrId = canonicalAlignment.regional_hr_user_id
      regionalManagerId = canonicalAlignment.regional_manager_user_id || regionalManagerId
    }
  }
  if (!regionalHrId) regionalHrId = (await resolveRegionalHrOffice(admin, regionId, profile.assigned_location_id))?.user_id || null

  return {
    staffId,
    assignedLocationId: profile.assigned_location_id || null,
    regionId,
    departmentId: profile.department_id || null,
    hodId,
    regionalHrId,
    regionalManagerId,
    locationName: assignedLocation?.name || null,
    source: profile.assigned_location_id || regionId ? "profile" : "unresolved",
  }
}

export async function resolveRegionalHrOffice(
  admin: SupabaseClient,
  regionId: string | null | undefined,
  locationId?: string | null,
) {
  // The admin-managed mapping is authoritative for a location.
  if (locationId) {
    const { data: mapped, error: mappingError } = await admin
      .from("regional_hr_office_locations")
      .select("regional_hr_user_id, region_id")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (mappingError) throw mappingError
    if (mapped?.regional_hr_user_id) return { user_id: mapped.regional_hr_user_id, region_id: mapped.region_id || regionId || null, is_override: true }
  }

  // Backwards-compatible profile-based location lookup.
  if (locationId) {
    const { data: locationProfiles, error: locationError } = await admin
      .from("user_profiles")
      .select("id, role, region_id, assigned_location_id")
      .eq("assigned_location_id", locationId)
      .eq("is_active", true)
    if (locationError) throw locationError
    const byLocation = (locationProfiles || []).find((profile: any) => isRegionalHrLeaveOfficeRole(profile.role) || ["hr", "hr_office"].includes(normalizeWorkflowRole(profile.role)))
    if (byLocation) return { user_id: byLocation.id, region_id: byLocation.region_id || regionId || null, is_override: false }
  }
  if (!regionId) return null
  const { data, error } = await admin
    .from("regional_hr_leave_office_assignments")
    .select("user_id, region_id, is_override")
    .eq("region_id", regionId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (data) return data

  const { data: regionalProfiles, error: fallbackError } = await admin
    .from("user_profiles")
    .select("id, role, region_id")
    .eq("region_id", regionId)
    .eq("is_active", true)
  if (fallbackError) throw fallbackError
  const fallback = (regionalProfiles || []).find((profile: any) => isRegionalHrLeaveOfficeRole(profile.role) || ["hr", "hr_office"].includes(normalizeWorkflowRole(profile.role)))
  return fallback ? { user_id: fallback.id, region_id: fallback.region_id, is_override: false } : null
}

export function hrRecordsCanReference(status: string | null | undefined) {
  return [
    "pending_hr_records_reference",
    "hr_approved",
    "hod_approved",
    "hr_office_forwarded",
    "regional_manager_approved",
    "approved",
  ].includes(String(status || ""))
}

export function lockedReferenceMutationError(locked: boolean) {
  return locked ? "This official memo reference is locked and cannot be edited or removed." : null
}

export type MemoVisibilityScope = {
  isRegional: boolean
  staffIds: string[] | null
  regionIds: string[]
  locationIds: string[]
}

/** Resolve the server-side union of explicit regional links and location-derived staff. */
export async function resolveMemoVisibilityScope(
  admin: SupabaseClient,
  actorId: string,
  role: string | null | undefined,
): Promise<MemoVisibilityScope> {
  const normalizedRole = normalizeWorkflowRole(role)
  const isRegional = isRegionalHrLeaveOfficeRole(normalizedRole)
  if (!isRegional) return { isRegional: false, staffIds: null, regionIds: [], locationIds: [] }

  const [{ data: assignments, error: assignmentError }, { data: actor, error: actorError }] = await Promise.all([
    admin.from("regional_hr_leave_office_assignments").select("region_id").eq("user_id", actorId).eq("is_active", true),
    admin.from("user_profiles").select("assigned_location_id, region_id").eq("id", actorId).maybeSingle(),
  ])
  if (assignmentError) throw assignmentError
  if (actorError) throw actorError

  const regionIds = [...new Set([...(assignments || []).map((row: any) => row.region_id), actor?.region_id].filter(Boolean))]
  const locationIds = new Set<string>()
  if (actor?.assigned_location_id) locationIds.add(actor.assigned_location_id)

  if (regionIds.length) {
    const { data: districts, error: districtError } = await admin
      .from("districts")
      .select("id")
      .in("region_id", regionIds)
    if (districtError) throw districtError
    const districtIds = (districts || []).map((row: any) => row.id).filter(Boolean)
    if (districtIds.length) {
      const { data: regionalLocations, error: locationError } = await admin
        .from("geofence_locations")
        .select("id")
        .in("district_id", districtIds)
        .eq("is_active", true)
      if (locationError) throw locationError
      for (const location of regionalLocations || []) locationIds.add(location.id)
    }
  }

  const locationList = [...locationIds]
  const { data: staff, error: staffError } = locationList.length
    ? await admin.from("user_profiles").select("id").in("assigned_location_id", locationList)
    : { data: [], error: null }
  if (staffError) throw staffError

  return {
    isRegional: true,
    staffIds: [...new Set((staff || []).map((row: any) => row.id).filter(Boolean))],
    regionIds,
    locationIds: locationList,
  }
}

export function regionalSecretaryRoles(role: string | null | undefined) {
  const normalized = normalizeWorkflowRole(role)
  return ["secretary", "admin", "administrator", "hr_records", "hr_records_officer", "hr_records_manager", "regional_hr_leave_office", "regional_hr", "regional_leave_office"].includes(normalized)
}
