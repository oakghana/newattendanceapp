import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isRegionalHrOfficerRole } from "@/lib/leave-planning"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

const ANNUAL_LEAVE_KEYS = ["annual", "annual_leave", "annual leave"]

// A staff member with a request in any of these statuses has already applied.
// Rejected requests are intentionally absent: the staff member can (and must)
// re-apply, so they stay on the "yet to apply" list.
const APPLIED_STATUSES = new Set([
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

type ScopeKind = "regional" | "hod"

function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function normalizeYear(value: unknown, fallback: string) {
  const match = String(value || "").trim().match(/^(\d{4})/)
  return match ? match[1] : fallback
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function fetchProfilesByIds(admin: any, ids: string[]) {
  const rows: any[] = []
  for (const part of chunk(ids, CHUNK_SIZE)) {
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

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const scope = (url.searchParams.get("scope") || "") as ScopeKind
    if (scope !== "regional" && scope !== "hod") {
      return NextResponse.json({ error: "scope must be 'regional' or 'hod'" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, assigned_location_id, region_id")
      .eq("id", user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const year = normalizeYear(url.searchParams.get("year"), String(new Date().getFullYear() + 1))

    let staffRows: any[] = []

    if (scope === "regional") {
      if (!isRegionalHrOfficerRole(profile.role)) {
        return NextResponse.json({ error: "Forbidden — requires Regional HR Office role" }, { status: 403 })
      }
      const ownedLocationIds = await resolveOwnedLocationIdsForRegionalOffice(
        admin,
        profile.assigned_location_id,
        profile.region_id,
      )
      if (ownedLocationIds.length > 0) {
        staffRows = await fetchProfilesByLocations(admin, ownedLocationIds, user.id)
      } else if (profile.region_id) {
        staffRows = await fetchProfilesByRegion(admin, String(profile.region_id), user.id)
      }
    } else {
      // Every staff member linked to this HOD / Regional Manager, whether the
      // link lives in loan_hod_linkages or directly on user_profiles.hod_id.
      const [{ data: linkRows, error: linkError }, { data: hodIdRows, error: hodIdError }] = await Promise.all([
        admin.from("loan_hod_linkages").select("staff_user_id").eq("hod_user_id", user.id),
        admin.from("user_profiles").select("id").eq("hod_id", user.id),
      ])
      if (linkError) throw linkError
      if (hodIdError) throw hodIdError
      const staffIds = Array.from(
        new Set(
          [...(linkRows || []).map((row: any) => row.staff_user_id), ...(hodIdRows || []).map((row: any) => row.id)]
            .filter(Boolean)
            .map(String)
            .filter((id) => id !== user.id),
        ),
      )
      staffRows = staffIds.length ? await fetchProfilesByIds(admin, staffIds) : []
    }

    const staffIds = staffRows.map((row) => String(row.id))

    // Latest annual request per staff member for the planning year.
    const appliedUserIds = new Set<string>()
    const lastRejectedStatus = new Map<string, string>()
    for (const part of chunk(staffIds, CHUNK_SIZE)) {
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
        const userId = String(req.user_id)
        const status = String(req.status || "")
        if (APPLIED_STATUSES.has(status)) appliedUserIds.add(userId)
        else lastRejectedStatus.set(userId, status)
      }
    }

    const pending = staffRows.filter((row) => !appliedUserIds.has(String(row.id)))

    const locationIds = Array.from(new Set(pending.map((row) => row.assigned_location_id).filter(Boolean).map(String)))
    const locationNames = new Map<string, string>()
    for (const part of chunk(locationIds, CHUNK_SIZE)) {
      const { data: locations, error: locationsError } = await admin
        .from("geofence_locations")
        .select("id, name")
        .in("id", part)
      if (locationsError) throw locationsError
      for (const location of locations || []) locationNames.set(String(location.id), String(location.name || ""))
    }

    const staff = pending
      .map((row) => ({
        id: String(row.id),
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unknown",
        employee_id: row.employee_id || "",
        position: row.position || "",
        role: normalizeRole(row.role),
        email: row.email || "",
        department_name: row.departments?.name || "",
        location_name: locationNames.get(String(row.assigned_location_id || "")) || "",
        previous_request_status: lastRejectedStatus.get(String(row.id)) || null,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    return NextResponse.json({
      year,
      scope,
      total_staff: staffRows.length,
      applied_count: staffRows.length - pending.length,
      yet_to_apply_count: staff.length,
      staff,
    })
  } catch (error: any) {
    console.error("[v0] yet-to-apply error:", error)
    return NextResponse.json({ error: String(error?.message || "Internal server error") }, { status: 500 })
  }
}
