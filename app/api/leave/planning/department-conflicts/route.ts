import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isExcludedLocation } from "@/lib/hr-workflow"

const ANNUAL_TYPES = ["annual", "annual_leave"]

// Statuses that mean the HOD has already approved (or the request has moved
// further down the pipeline after HOD approval).
const HOD_ASSIGNED_STATUSES = [
  "hod_approved",
  "hr_office_forwarded",
  "pending_hr_records_reference",
  "pending_hr_leave_processing",
  "approved",
  "hr_approved",
]

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: unknown) {
  const raw = String(value || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA <= endB && startB <= endA
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const params = new URL(request.url).searchParams
    const start = parseDate(params.get("start"))
    const end = parseDate(params.get("end")) || start
    if (!start || !end || end < start) {
      return NextResponse.json({ applicable: false, conflicts: [] })
    }

    const { data: me } = await admin
      .from("user_profiles")
      .select("id, department_id, departments(name), geofence_locations!user_profiles_assigned_location_id_fkey(name)")
      .eq("id", user.id)
      .maybeSingle()

    const myLocation = String((me as any)?.geofence_locations?.name || "")
    const departmentId = (me as any)?.department_id || null
    const departmentName = (me as any)?.departments?.name || null

    // Only staff at non-regional / head-office locations share an HOD-managed
    // department calendar.
    if (!departmentId || !myLocation || !isExcludedLocation(myLocation)) {
      return NextResponse.json({ applicable: false, conflicts: [] })
    }

    const { data: colleagues } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, geofence_locations!user_profiles_assigned_location_id_fkey(name)")
      .eq("department_id", departmentId)
      .neq("id", user.id)
      .eq("is_active", true)
      .limit(1000)

    const colleagueMap = new Map<string, { name: string; position: string | null }>()
    for (const row of colleagues || []) {
      const locationName = String((row as any)?.geofence_locations?.name || "")
      if (!locationName || !isExcludedLocation(locationName)) continue
      const name = `${(row as any).first_name || ""} ${(row as any).last_name || ""}`.trim() || "A colleague"
      colleagueMap.set(String((row as any).id), { name, position: (row as any).position || null })
    }

    if (colleagueMap.size === 0) {
      return NextResponse.json({ applicable: true, department: departmentName, conflicts: [] })
    }

    const { data: rows, error } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, status, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date")
      .in("user_id", Array.from(colleagueMap.keys()))
      .in("leave_type_key", ANNUAL_TYPES)
      .in("status", HOD_ASSIGNED_STATUSES)
      .eq("is_archived", false)
      .limit(2000)
    if (error) throw error

    const assigned = (rows || [])
      .map((row: any) => {
        const rangeStart = parseDate(row.adjusted_start_date || row.preferred_start_date)
        const rangeEnd = parseDate(row.adjusted_end_date || row.preferred_end_date)
        const colleague = colleagueMap.get(String(row.user_id))
        if (!rangeStart || !rangeEnd || !colleague) return null
        return { id: String(row.id), start: rangeStart, end: rangeEnd, colleague }
      })
      .filter(Boolean) as Array<{ id: string; start: Date; end: Date; colleague: { name: string; position: string | null } }>

    const conflicts = assigned
      .filter((range) => overlaps(start, end, range.start, range.end))
      .sort((a, b) => a.start.getTime() - b.start.getTime())

    if (conflicts.length === 0) {
      return NextResponse.json({ applicable: true, department: departmentName, conflicts: [] })
    }

    // Suggest the next window of the same length that is free of HOD-assigned dates.
    const durationDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
    let candidateStart = new Date(Math.max(...conflicts.map((range) => range.end.getTime())) + DAY_MS)
    for (let guard = 0; guard < 400; guard += 1) {
      const candidateEnd = new Date(candidateStart.getTime() + (durationDays - 1) * DAY_MS)
      const blocking = assigned.find((range) => overlaps(candidateStart, candidateEnd, range.start, range.end))
      if (!blocking) break
      candidateStart = new Date(blocking.end.getTime() + DAY_MS)
    }

    return NextResponse.json({
      applicable: true,
      department: departmentName,
      conflicts: conflicts.map((range) => ({
        id: range.id,
        staff_name: range.colleague.name,
        position: range.colleague.position,
        start_date: toIso(range.start),
        end_date: toIso(range.end),
      })),
      suggested_start_date: toIso(candidateStart),
    })
  } catch (error: any) {
    console.error("[v0] department-conflicts error:", error?.message)
    return NextResponse.json({ applicable: false, conflicts: [], error: "Unable to check department dates" }, { status: 200 })
  }
}
