import { isRegionalHrOfficerRole } from "@/lib/leave-planning"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

export type YetToApplyScope = "regional" | "hod"

export const ANNUAL_LEAVE_KEYS = ["annual", "annual_leave", "annual leave"]

// A staff member with a request in any of these statuses has already applied.
// Rejected requests are intentionally absent: the staff member can (and must)
// re-apply, so they stay on the "yet to apply" list.
export const APPLIED_STATUSES = new Set([
  "pending",
  "pending_hod",
  "pending_hr",
  "pending_manager_review",
  "pending_hod_review",
  "manager_changes_requested",
  "hod_changes_requested",
  "manager_confirmed",
  "hod_approved",
  "hr_office_forwarded",
  "pending_hr_records_reference",
  "pending_hr_leave_processing",
  "pending_regional_hr_review",
  "pending_regional_hr_office_review",
  "pending_regional_manager_approval",
  "approved",
  "hr_approved",
])

const PROFILE_COLUMNS =
  "id, first_name, last_name, employee_id, position, role, email, assigned_location_id, department_id, departments(name)"
const CHUNK_SIZE = 150
const PAGE_SIZE = 1000

export function defaultPlanningYear() {
  return String(new Date().getFullYear() + 1)
}

export function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

export function normalizeYear(value: unknown, fallback: string) {
  const match = String(value || "").trim().match(/^(\d{4})/)
  return match ? match[1] : fallback
}

export function chunk<T>(items: T[], size: number = CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function fetchProfilesByIds(admin: any, ids: string[]) {
  const rows: any[] = []
  for (const part of chunk(ids)) {
    const { data, error } = await admin
      .from("user_profiles")
      .select(PROFILE_COLUMNS)
      .in("id", part)
      .or("is_active.is.null,is_active.eq.true")
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

async function fetchProfilesByLocations(admin: any, locationIds: string[], selfId: string) {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("user_profiles")
      .select(PROFILE_COLUMNS)
      .in("assigned_location_id", locationIds)
      .neq("id", selfId)
      .or("is_active.is.null,is_active.eq.true")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

async function fetchProfilesByRegion(admin: any, regionId: string, selfId: string) {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("user_profiles")
      .select(PROFILE_COLUMNS)
      .eq("region_id", regionId)
      .neq("id", selfId)
      .or("is_active.is.null,is_active.eq.true")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export type YetToApplyResolution =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      year: string
      senderProfile: any
      staffRows: any[]
      pending: any[]
      lastRejectedStatus: Map<string, string>
    }

/**
 * Resolves the staff a Regional HR Office (by assigned location family, falling
 * back to region) or a HOD / Regional Manager (by linkage) is responsible for,
 * and splits them into those who have and have not applied for annual leave.
 */
export async function resolveYetToApply(
  admin: any,
  userId: string,
  scope: YetToApplyScope,
  yearInput?: unknown,
): Promise<YetToApplyResolution> {
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, role, first_name, last_name, assigned_location_id, region_id")
    .eq("id", userId)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile) return { ok: false, status: 404, error: "Profile not found" }

  const year = normalizeYear(yearInput, defaultPlanningYear())
  let staffRows: any[] = []

  if (scope === "regional") {
    if (!isRegionalHrOfficerRole(profile.role)) {
      return { ok: false, status: 403, error: "Forbidden — requires Regional HR Office role" }
    }
    const ownedLocationIds = await resolveOwnedLocationIdsForRegionalOffice(
      admin,
      profile.assigned_location_id,
      profile.region_id,
    )
    if (ownedLocationIds.length > 0) {
      staffRows = await fetchProfilesByLocations(admin, ownedLocationIds, userId)
    } else if (profile.region_id) {
      staffRows = await fetchProfilesByRegion(admin, String(profile.region_id), userId)
    }
  } else {
    const [{ data: linkRows, error: linkError }, { data: hodIdRows, error: hodIdError }] = await Promise.all([
      admin.from("loan_hod_linkages").select("staff_user_id").eq("hod_user_id", userId),
      admin.from("user_profiles").select("id").eq("hod_id", userId),
    ])
    if (linkError) throw linkError
    if (hodIdError) throw hodIdError
    const staffIds = Array.from(
      new Set(
        [...(linkRows || []).map((row: any) => row.staff_user_id), ...(hodIdRows || []).map((row: any) => row.id)]
          .filter(Boolean)
          .map(String)
          .filter((id) => id !== userId),
      ),
    )
    staffRows = staffIds.length ? await fetchProfilesByIds(admin, staffIds) : []
  }

  const staffIds = staffRows.map((row) => String(row.id))
  const appliedUserIds = new Set<string>()
  const lastRejectedStatus = new Map<string, string>()
  for (const part of chunk(staffIds)) {
    const { data: requests, error: requestsError } = await admin
      .from("leave_plan_requests")
      .select("user_id, status, leave_year_period, is_archived")
      .in("user_id", part)
      .in("leave_type_key", ANNUAL_LEAVE_KEYS)
      .eq("is_archived", false)
    if (requestsError) throw requestsError
    for (const req of requests || []) {
      // Legacy rows may have no period; treat them as the planning year so
      // nobody who actually applied is wrongly reported as outstanding.
      const requestYear = req.leave_year_period ? normalizeYear(req.leave_year_period, "") : year
      if (requestYear !== year) continue
      const id = String(req.user_id)
      const status = String(req.status || "")
      if (APPLIED_STATUSES.has(status)) appliedUserIds.add(id)
      else lastRejectedStatus.set(id, status)
    }
  }

  const pending = staffRows.filter((row) => !appliedUserIds.has(String(row.id)))
  return { ok: true, year, senderProfile: profile, staffRows, pending, lastRejectedStatus }
}

/** True when this staff member already has a live annual leave request for the planning year. */
export async function hasAppliedForYear(admin: any, userId: string, yearInput?: unknown) {
  const year = normalizeYear(yearInput, defaultPlanningYear())
  const { data, error } = await admin
    .from("leave_plan_requests")
    .select("status, leave_year_period")
    .eq("user_id", userId)
    .in("leave_type_key", ANNUAL_LEAVE_KEYS)
    .eq("is_archived", false)
  if (error) throw error
  return (data || []).some((req: any) => {
    const requestYear = req.leave_year_period ? normalizeYear(req.leave_year_period, "") : year
    return requestYear === year && APPLIED_STATUSES.has(String(req.status || ""))
  })
}
