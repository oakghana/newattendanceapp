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
  return !isRegionalLeaveException(input.leaveType) && !isExcludedLocation(input.locationName)
}

export function normalizeLocationName(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[–—]/g, "-").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

export function isExcludedLocation(locationName: string | null | undefined) {
  const normalized = normalizeLocationName(locationName)
  return NON_REGIONAL_LOCATIONS.some((location) => normalizeLocationName(location) === normalized)
}

export function isRegionalLeaveException(leaveType: string | null | undefined) {
  const normalized = normalizeLocationName(leaveType).replace(/ leave$/i, "")
  return normalized === "manager annual" || normalized === "maternity" || normalized === "paternity"
}

export function routeLeave(input: { leaveType?: string | null; locationName?: string | null; hasRegionalOffice: boolean }): { route: LeaveRoute; firstStage: string | null; reason?: string } {
  if (isRegionalLeaveException(input.leaveType) || isExcludedLocation(input.locationName)) {
    return { route: "legacy", firstStage: null, reason: "This leave type or location uses its separate non-regional workflow." }
  }
  if (!input.hasRegionalOffice) {
    return { route: "regional", firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview, reason: "Regional HR assignment is required before submission." }
  }
  return { route: "regional", firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview }
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
