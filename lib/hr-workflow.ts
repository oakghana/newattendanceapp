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

export const SELF_LEAVE_STAGES = {
  hrLeaveOffice: "pending_hr_leave_processing",
  hrExecutive: "hr_office_forwarded",
  hrRecords: "pending_hr_records_reference",
} as const

export function normalizeWorkflowRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
}

export function isRegionalManagerRole(role: string | null | undefined) {
  return normalizeWorkflowRole(role) === "regional_manager"
}

export function isDepartmentHeadRole(role: string | null | undefined) {
  return ["department_head", "hod"].includes(normalizeWorkflowRole(role))
}

export function isSelfLeaveRole(role: string | null | undefined, locationName?: string | null) {
  const normalizedRole = normalizeWorkflowRole(role)
  if (normalizedRole === "regional_manager") return true
  return normalizedRole === "department_head" || normalizedRole === "hod" ? isExcludedLocation(locationName) : false
}

export type SelfLeaveResolution = {
  isSelfLeave: boolean
  route: "self_leave" | null
  firstStage: string | null
  reason?: string
}

export function resolveSelfLeaveRoute(input: { role?: string | null; locationName?: string | null }): SelfLeaveResolution {
  if (isRegionalManagerRole(input.role)) {
    return { isSelfLeave: true, route: "self_leave", firstStage: SELF_LEAVE_STAGES.hrLeaveOffice, reason: "Regional Manager self-leave bypasses endorsement and Regional HR." }
  }
  if (isDepartmentHeadRole(input.role) && isExcludedLocation(input.locationName)) {
    return { isSelfLeave: true, route: "self_leave", firstStage: SELF_LEAVE_STAGES.hrLeaveOffice, reason: "HOD self-leave bypasses endorsement." }
  }
  return { isSelfLeave: false, route: null, firstStage: null }
}

export function isSelfLeaveWorkflowRoute(workflowRoute: string | null | undefined) {
  return String(workflowRoute || "").toLowerCase() === "self_leave"
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

export type LeaveRoute = "regional" | "legacy" | "self_leave"

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

const SELF_LEAVE_WORKFLOW_STEPS: LeaveWorkflowStep[] = [
  { key: "submitted", label: "Submitted" },
  { key: "hr_leave_office", label: "HR Leave Office" },
  { key: "hr_executive", label: "HR Executive" },
  { key: "hr_records", label: "HR Records Memo Reference" },
]

export function getLeaveWorkflowView(input: {
  route?: LeaveRoute | string | null
  workflowRoute?: LeaveRoute | string | null
  status?: string | null
  workflowStage?: string | null
  leaveType?: string | null
  locationName?: string | null
}): LeaveWorkflowView {
  const rawRoute = String(input.workflowRoute || input.route || "").toLowerCase()
  const route: LeaveRoute = rawRoute === "regional" ? "regional" : rawRoute === "self_leave" ? "self_leave" : "legacy"
  const status = String(input.status || input.workflowStage || "pending_hod_review")
  const currentStage = input.workflowStage || status
  const statusLabel: Record<string, string> = {
    pending: "Pending HOD Review",
    pending_hod: "Pending HOD Review",
    pending_hod_review: "Pending HOD Review",
    pending_regional_hr_review: "Pending Regional HR Office Review",
    pending_regional_manager_approval: "Pending Regional Manager Approval",
    pending_hr_leave_processing: "Awaiting HR Leave Office Adjustment",
    hr_office_forwarded: "Pending HR Executive Signing",
    pending_hr_records_reference: "Awaiting HR Records Memo Reference",
    hr_approved: "Approved",
    approved: "Approved",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  }
  return {
    route,
    currentStage,
    statusLabel: statusLabel[status] || status.replace(/_/g, " "),
    steps: route === "regional" ? REGIONAL_WORKFLOW_STEPS : route === "self_leave" ? SELF_LEAVE_WORKFLOW_STEPS : LEGACY_WORKFLOW_STEPS,
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
export function routeLeave(input: { locationName?: string | null; hasRegionalOffice: boolean; leaveType?: string | null }): { route: LeaveRoute; firstStage: string | null; reason?: string } {
  if (isExcludedLocation(input.locationName)) {
    return { route: "legacy", firstStage: null, reason: "This location uses the non-regional/head-office workflow." }
  }
  if (!input.hasRegionalOffice) {
    return { route: "regional", firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview, reason: "Regional HR assignment is required before submission." }
  }
  return { route: "regional", firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview }
}

/**
 * Cross-route pipeline guards. The two pipelines never share a stage:
 * non-regional runs HOD Review -> HR Leave Office -> HR Executive -> HR
 * Records; regional runs Regional HR Office -> Regional Manager. Each
 * guard below is what the corresponding API route checks before acting,
 * kept here as pure functions so the boundary is unit-testable.
 */
export function isRegionalWorkflowRoute(workflowRoute: string | null | undefined) {
  return String(workflowRoute || "").toLowerCase() === "regional"
}

/** HOD Review, HR Leave Office, and HR Executive act only on non-regional requests. */
export function canNonRegionalPipelineAct(workflowRoute: string | null | undefined) {
  return !isRegionalWorkflowRoute(workflowRoute)
}

export function canSelfLeavePipelineAct(workflowRoute: string | null | undefined) {
  return isSelfLeaveWorkflowRoute(workflowRoute)
}

export function canManagerReviewAct(workflowRoute: string | null | undefined) {
  return !isSelfLeaveWorkflowRoute(workflowRoute)
}

/** Regional HR Office forwarding and Regional Manager approval act only on regional requests. */
export function canRegionalPipelineAct(workflowRoute: string | null | undefined) {
  return isRegionalWorkflowRoute(workflowRoute)
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
  const { data: linkages } = await admin
    .from("loan_hod_linkages")
    .select("hod_user_id")
    .eq("staff_user_id", staffId)
    .limit(20)
  if (linkages?.length) {
    const linkedIds = linkages.map((row: any) => row.hod_user_id).filter(Boolean)
    const { data: linkedProfiles } = await admin
      .from("user_profiles")
      .select("id, role, department_id, assigned_location_id")
      .in("id", linkedIds)
      .eq("is_active", true)
    const eligible = (linkedProfiles || []).find((candidate: any) => {
      const candidateRole = normalizeWorkflowRole(candidate.role)
      if (isExcludedLocation(assignedLocation?.name)) {
        return isDepartmentHeadRole(candidateRole) && isExcludedLocation(assignedLocation?.name)
      }
      return Boolean(profile.assigned_location_id) && isRegionalManagerRole(candidateRole) && candidate.assigned_location_id === profile.assigned_location_id
    })
    hodId = eligible?.id || null
  }
  if (!hodId && profile.department_id && isExcludedLocation(assignedLocation?.name)) {
    const { data: departmentHod } = await admin
      .from("user_profiles")
      .select("id")
      .eq("department_id", profile.department_id)
      .eq("role", "department_head")
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
  const isRegionalStaff = Boolean(profile.assigned_location_id) && !isExcludedLocation(assignedLocation?.name)
  if (!isRegionalStaff) {
    regionalHrId = null
    regionalManagerId = null
  } else {
    if (!regionalHrId) regionalHrId = (await resolveRegionalHrOffice(admin, regionId, profile.assigned_location_id))?.user_id || null
    if (!regionalManagerId) regionalManagerId = await resolveRegionalManager(admin, regionId, profile.assigned_location_id)
  }

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

/**
 * Resolve the single accountable Regional Manager for a location/region.
 * The admin-managed regional_hr_office_locations.regional_manager_user_id
 * mapping is authoritative and is checked first by the caller. This fallback
 * exists because that mapping table is frequently unpopulated in practice —
 * without it, Regional HR could forward a request to no one and it would
 * silently disappear from every queue.
 */
export async function resolveRegionalManager(
  admin: SupabaseClient,
  regionId: string | null | undefined,
  locationId?: string | null,
): Promise<string | null> {
  if (locationId) {
    const { data: locationProfiles, error: locationError } = await admin
      .from("user_profiles")
      .select("id, role, created_at")
      .eq("assigned_location_id", locationId)
      .eq("role", "regional_manager")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
    if (locationError) throw locationError
    if (locationProfiles && locationProfiles.length > 0) return locationProfiles[0].id
  }
  if (!regionId) return null
  const { data: regionalProfiles, error: regionError } = await admin
    .from("user_profiles")
    .select("id, role, created_at")
    .eq("region_id", regionId)
    .eq("role", "regional_manager")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
  if (regionError) throw regionError
  return regionalProfiles && regionalProfiles.length > 0 ? regionalProfiles[0].id : null
}

/**
 * HR Records is the last stop on both pipelines it serves:
 *  - Leave: HOD Review -> HR Leave Office memo step -> HR Executive approval
 *    -> HR Records reference. A fresh (non-correction) reference is only
 *    accepted once HR Executive has approved the request ("hr_approved"), or
 *    the request has landed directly on the dedicated HR Records stage
 *    ("pending_hr_records_reference").
 *  - Loan: Loan Office -> HR Executive signs -> Director HR / Managing
 *    Director approves ("approved_director") -> HR Records reference. That
 *    Director/MD approval is the loan's final decision stage, so it is the
 *    only status HR Records may reference against for loans.
 * Corrections to an already-locked reference bypass this check entirely (see
 * save-reference/route.ts), so this only gates the first-time assignment.
 */
export function hrRecordsCanReference(status: string | null | undefined, entity: "leave" | "loan" = "leave") {
  const value = String(status || "")
  if (entity === "loan") return ["approved_director", "pending_hr_records_reference"].includes(value)
  return ["hr_approved", "pending_hr_records_reference"].includes(value)
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

/**
 * When a staff member has no resolvable reviewer yet (no HOD for
 * non-regional/head-office staff, no Regional HR/Manager assignment for
 * regional staff), leave and loan requests cannot be routed for approval.
 * This produces the copy shown to the requester so they know exactly who to
 * see to complete their assignment before trying again.
 */
export type AssignmentGuidance = {
  contactRole: "Regional IT Head" | "IT Manager"
  title: string
  description: string
}

export function getAssignmentGuidance(locationName: string | null | undefined, kind: "leave" | "loan"): AssignmentGuidance {
  const isNonRegional = isExcludedLocation(locationName)
  const contactRole: AssignmentGuidance["contactRole"] = isNonRegional ? "IT Manager" : "Regional IT Head"
  const noun = kind === "leave" ? "leave" : "loan"
  const assignmentKind = isNonRegional ? "Head of Department" : "Regional HR/Manager"
  return {
    contactRole,
    title: "Assignment Setup Required",
    description: `Your account isn't linked to a ${assignmentKind} yet, so this ${noun} request can't be routed for approval. Please see your ${contactRole} to complete your assignment, then try again.`,
  }
}
