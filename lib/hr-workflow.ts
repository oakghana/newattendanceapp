import type { SupabaseClient } from "@supabase/supabase-js"

export const EXCLUDED_LOCATION_TERMS = [
  "head office",
  "swanzy",
  "qcc head office",
  "accra",
  "district office",
  "seven excluded",
]

export const REGIONAL_NON_ANNUAL_STAGES = {
  regionalHrReview: "pending_regional_hr_review",
  regionalManagerApproval: "pending_regional_manager_approval",
  hrRecordsReference: "pending_hr_records_reference",
  referenced: "referenced",
  hrLeaveProcessing: "pending_hr_leave_processing",
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

export function isExcludedLocation(locationName: string | null | undefined) {
  const value = String(locationName || "").toLowerCase().trim()
  return EXCLUDED_LOCATION_TERMS.some((term) => value.includes(term))
}

export function normalizeReference(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ")
}

export function referenceKey(value: unknown) {
  return normalizeReference(value).toLowerCase()
}

export type LeaveRoute = "legacy" | "regional_non_annual"

export function routeLeave(input: { leaveType?: string | null; locationName?: string | null; hasRegionalOffice: boolean }): { route: LeaveRoute; firstStage: string | null; reason?: string } {
  if (isAnnualLeave(input.leaveType) || isExcludedLocation(input.locationName)) {
    return { route: "legacy", firstStage: null }
  }
  if (!input.hasRegionalOffice) {
    return { route: "regional_non_annual", firstStage: REGIONAL_NON_ANNUAL_STAGES.hrRecordsReference, reason: "No active Regional HR Leave Office is assigned for this region; HR Records must reference the memo first." }
  }
  return { route: "regional_non_annual", firstStage: REGIONAL_NON_ANNUAL_STAGES.regionalHrReview }
}

export async function resolveRegionalHrOffice(admin: SupabaseClient, regionId: string | null | undefined) {
  if (!regionId) return null
  const { data, error } = await admin
    .from("regional_hr_leave_office_assignments")
    .select("user_id, region_id, is_override")
    .eq("region_id", regionId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function hrRecordsCanReference(status: string | null | undefined) {
  return [
    "pending_hr_records_reference",
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
    admin.from("user_profiles").select("assigned_location_id").eq("id", actorId).maybeSingle(),
  ])
  if (assignmentError) throw assignmentError
  if (actorError) throw actorError

  const regionIds = [...new Set((assignments || []).map((row: any) => row.region_id).filter(Boolean))]
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
