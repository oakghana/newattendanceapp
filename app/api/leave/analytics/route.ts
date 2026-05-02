import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const ALLOWED_ROLES = new Set([
  "admin",
  "hr",
  "hr_leave_office",
  "hr_office",
  "loan_office",
  "hr_officer",
  "hr_director",
  "director_hr",
  "manager_hr",
  "department_head",
  "regional_manager",
  "accounts",
])

const OUTSTANDING_STATUSES = [
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
] as const

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA <= endB && startB <= endA
}

function getDefaultRange() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  return { start, end }
}

function clampRange(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  const spanDays = Math.floor((end.getTime() - start.getTime()) / msPerDay)
  if (spanDays <= 400) return { start, end }
  const clampedEnd = new Date(start.getTime() + 400 * msPerDay)
  return { start, end: clampedEnd }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = normalizeRole((profile as any).role)
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = new URL(request.url)
    const startParam = String(url.searchParams.get("start") || "").trim()
    const endParam = String(url.searchParams.get("end") || "").trim()
    const defaults = getDefaultRange()
    const parsedStart = startParam ? parseDateOnly(startParam) : defaults.start
    const parsedEnd = endParam ? parseDateOnly(endParam) : defaults.end

    if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) {
      return NextResponse.json({ error: "Invalid analytics date range." }, { status: 400 })
    }

    const { start, end } = clampRange(parsedStart, parsedEnd)
    const rangeStart = formatDateOnly(start)
    const rangeEnd = formatDateOnly(end)

    const [approvedRes, outstandingRes] = await Promise.all([
      admin
        .from("leave_plan_requests")
        .select("id, user_id, leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, requested_days, adjusted_days, entitlement_days, status, submitted_at, created_at, adjusted_at, is_archived")
        .eq("is_archived", false)
        .eq("status", "hr_approved")
        .order("created_at", { ascending: false }),
      admin
        .from("leave_plan_requests")
        .select("id, status, created_at, submitted_at")
        .eq("is_archived", false)
        .in("status", [...OUTSTANDING_STATUSES])
        .order("created_at", { ascending: false }),
    ])

    if (approvedRes.error) throw approvedRes.error
    if (outstandingRes.error) throw outstandingRes.error

    const approvedRowsRaw = approvedRes.data || []
    const approvedUserIds = Array.from(new Set(approvedRowsRaw.map((row: any) => String(row?.user_id || "")).filter(Boolean)))

    let profileRows: any[] = []
    if (approvedUserIds.length > 0) {
      const { data, error } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, department_id, assigned_location_id")
        .in("id", approvedUserIds)
      if (error) throw error
      profileRows = data || []
    }

    const profileMap = new Map(profileRows.map((row: any) => [String(row.id), row]))

    const departmentIds = Array.from(
      new Set(profileRows.map((row: any) => String(row?.department_id || "")).filter(Boolean)),
    )
    const locationIds = Array.from(
      new Set(profileRows.map((row: any) => String(row?.assigned_location_id || "")).filter(Boolean)),
    )

    let departmentLookup = new Map<string, any>()
    if (departmentIds.length > 0) {
      const { data, error } = await admin
        .from("departments")
        .select("id, name, code")
        .in("id", departmentIds)
      if (!error && data) {
        departmentLookup = new Map(data.map((row: any) => [String(row.id), row]))
      }
    }

    let locationLookup = new Map<string, any>()
    if (locationIds.length > 0) {
      const { data, error } = await admin
        .from("geofence_locations")
        .select("id, name, address")
        .in("id", locationIds)
      if (!error && data) {
        locationLookup = new Map(data.map((row: any) => [String(row.id), row]))
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const approvedRows = approvedRowsRaw.flatMap((row: any) => {
      const effectiveStart = String(row?.adjusted_start_date || row?.preferred_start_date || "")
      const effectiveEnd = String(row?.adjusted_end_date || row?.preferred_end_date || "")
      const startDate = parseDateOnly(effectiveStart)
      const endDate = parseDateOnly(effectiveEnd)
      if (!startDate || !endDate) return []
      if (!overlaps(startDate, endDate, start, end)) return []

      const profileRow = profileMap.get(String(row?.user_id || ""))
      const deptRow = departmentLookup.get(String(profileRow?.department_id || ""))
      const locRow = locationLookup.get(String(profileRow?.assigned_location_id || ""))

      return [{
        id: String(row.id),
        user_id: String(row.user_id || ""),
        staff_name: [profileRow?.first_name, profileRow?.last_name].filter(Boolean).join(" ") || profileRow?.employee_id || "Staff",
        employee_id: profileRow?.employee_id || null,
        rank: profileRow?.position || null,
        leave_type_key: String(row?.leave_type_key || "annual"),
        start_date: effectiveStart,
        end_date: effectiveEnd,
        days: Number(row?.adjusted_days || row?.requested_days || 0),
        submitted_at: row?.submitted_at || row?.created_at || null,
        location_name: locRow?.name || deptRow?.name || "Unassigned Location",
        location_address: locRow?.address || null,
        department_name: deptRow?.name || null,
      }]
    })

    const outstandingRows = (outstandingRes.data || []).filter((row: any) => {
      const createdAt = row?.submitted_at || row?.created_at
      if (!createdAt) return false
      const createdDate = new Date(createdAt)
      if (Number.isNaN(createdDate.getTime())) return false
      createdDate.setHours(0, 0, 0, 0)
      return createdDate >= start && createdDate <= end
    })

    const onLeaveNow = approvedRows.filter((row: any) => {
      const recordStart = parseDateOnly(String(row.start_date))
      const recordEnd = parseDateOnly(String(row.end_date))
      if (!recordStart || !recordEnd) return false
      return recordStart <= today && recordEnd >= today
    })

    const upcoming = approvedRows.filter((row: any) => {
      const recordStart = parseDateOnly(String(row.start_date))
      return recordStart ? recordStart > today : false
    })

    const completed = approvedRows.filter((row: any) => {
      const recordEnd = parseDateOnly(String(row.end_date))
      return recordEnd ? recordEnd < today : false
    })

    const typeMap = new Map<string, { leave_type_key: string; total: number; on_leave_now: number; upcoming: number; completed: number }>()
    const locationMap = new Map<string, { name: string; total: number; on_leave_now: number; upcoming: number }>()
    const dailyCountMap = new Map<string, number>()
    const monthlyCountMap = new Map<string, number>()

    for (const row of approvedRows) {
      const typeEntry = typeMap.get(row.leave_type_key) || {
        leave_type_key: row.leave_type_key,
        total: 0,
        on_leave_now: 0,
        upcoming: 0,
        completed: 0,
      }
      typeEntry.total += 1
      if (onLeaveNow.some((item: any) => item.id === row.id)) typeEntry.on_leave_now += 1
      if (upcoming.some((item: any) => item.id === row.id)) typeEntry.upcoming += 1
      if (completed.some((item: any) => item.id === row.id)) typeEntry.completed += 1
      typeMap.set(row.leave_type_key, typeEntry)

      const locationEntry = locationMap.get(row.location_name) || {
        name: row.location_name,
        total: 0,
        on_leave_now: 0,
        upcoming: 0,
      }
      locationEntry.total += 1
      if (onLeaveNow.some((item: any) => item.id === row.id)) locationEntry.on_leave_now += 1
      if (upcoming.some((item: any) => item.id === row.id)) locationEntry.upcoming += 1
      locationMap.set(row.location_name, locationEntry)

      const recordStart = parseDateOnly(String(row.start_date))
      const recordEnd = parseDateOnly(String(row.end_date))
      if (!recordStart || !recordEnd) continue

      const overlapStart = recordStart > start ? recordStart : start
      const overlapEnd = recordEnd < end ? recordEnd : end
      const monthKey = String(row.start_date).slice(0, 7)
      monthlyCountMap.set(monthKey, (monthlyCountMap.get(monthKey) || 0) + 1)

      const cursor = new Date(overlapStart)
      while (cursor <= overlapEnd) {
        const key = formatDateOnly(cursor)
        dailyCountMap.set(key, (dailyCountMap.get(key) || 0) + 1)
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }

    return NextResponse.json({
      rangeStart,
      rangeEnd,
      analytics: {
        totals: {
          outstanding_requests: outstandingRows.length,
          approved_total: approvedRows.length,
          staff_on_leave_now: new Set(onLeaveNow.map((row: any) => row.user_id).filter(Boolean)).size,
          staff_yet_to_enjoy: new Set(upcoming.map((row: any) => row.user_id).filter(Boolean)).size,
          staff_completed_leave: new Set(completed.map((row: any) => row.user_id).filter(Boolean)).size,
          completed_leave_requests: completed.length,
          unique_staff_in_range: new Set(approvedRows.map((row: any) => row.user_id).filter(Boolean)).size,
        },
        outstanding_by_status: Array.from(
          outstandingRows.reduce((map: Map<string, number>, row: any) => {
            const key = String(row?.status || "unknown")
            map.set(key, (map.get(key) || 0) + 1)
            return map
          }, new Map<string, number>()).entries(),
        ).map(([status, total]) => ({ status, total })),
        leave_type_breakdown: Array.from(typeMap.values()).sort((a, b) => b.total - a.total),
        location_ranking: Array.from(locationMap.values()).sort((a, b) => b.total - a.total).slice(0, 10),
        current_leave_roster: onLeaveNow.slice(0, 12),
        daily_leave_counts: Array.from(dailyCountMap.entries())
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        monthly_leave_counts: Array.from(monthlyCountMap.entries())
          .map(([month, total]) => ({ month, total }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        records: approvedRows,
      },
    })
  } catch (error) {
    console.error("[leave/analytics] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load leave analytics" },
      { status: 500 },
    )
  }
}