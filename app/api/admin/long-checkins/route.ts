import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const ALLOWED_ROLES = new Set(["admin"])

type OpenAttendance = {
  id: string
  user_id: string
  check_in_time: string
  check_in_location_name: string | null
  user_profiles: {
    employee_id: string | null
    first_name: string | null
    last_name: string | null
    department_id: string | null
    departments: { name: string | null } | null
  } | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase.from("user_profiles").select("role, first_name, last_name").eq("id", user.id).single()
  if (!profile || !ALLOWED_ROLES.has(profile.role)) return { supabase, user, profile: null }
  return { supabase, user, profile }
}

export async function GET() {
  try {
    const { user, profile } = await requireAdmin()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!profile) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })

    const admin = await createAdminClient()
    const nowMs = Date.now()
    const { data, error } = await admin
      .from("attendance_records")
      .select("id, user_id, check_in_time, check_in_location_name")
      .is("check_out_time", null)
      .order("check_in_time", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Calculate elapsed time in JavaScript so timestamp-with/without-time-zone
    // values are handled consistently instead of relying on a database cast.
    const rows = (data || []).filter((row: any) => {
      const checkInMs = Date.parse(row.check_in_time)
      return Number.isFinite(checkInMs) && nowMs - checkInMs >= 20 * 60 * 60 * 1000
    }) as Array<Omit<OpenAttendance, "user_profiles">>
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))]
    const { data: profiles, error: profilesError } = userIds.length
      ? await admin.from("user_profiles").select("id, employee_id, first_name, last_name, department_id, departments(name)").in("id", userIds)
      : { data: [], error: null }
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))

    const records = rows.map((record) => {
      const person = profileMap.get(record.user_id) as any
      return {
        id: record.id,
        user_id: record.user_id,
        employee_id: person?.employee_id || "N/A",
        full_name: `${person?.first_name || ""} ${person?.last_name || ""}`.trim() || "Unknown User",
        department_name: person?.departments?.name || "Unassigned",
        department_id: person?.department_id || null,
        check_in_time: record.check_in_time,
        location_name: record.check_in_location_name || "Unknown",
        hours_open: Math.round(((nowMs - Date.parse(record.check_in_time)) / 3_600_000) * 100) / 100,
      }
    })

    return NextResponse.json({
      success: true,
      records,
      thresholdHours: 20,
      calculatedAt: new Date(nowMs).toISOString(),
    })
  } catch (error) {
    console.error("[long-checkins GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireAdmin()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!profile) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })

    const body = await request.json() as { recordIds?: string[]; note?: string }
    const recordIds = [...new Set((body.recordIds || []).filter(Boolean))]
    if (!recordIds.length) return NextResponse.json({ error: "Select at least one open check-in" }, { status: 400 })

    const admin = await createAdminClient()
    const now = new Date()
    const { data: openRecords, error: fetchError } = await admin
      .from("attendance_records")
      .select("id, user_id, check_in_time")
      .in("id", recordIds)
      .is("check_out_time", null)

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    const updated: string[] = []
    for (const record of openRecords || []) {
      const workHours = Math.round(((now.getTime() - new Date(record.check_in_time).getTime()) / 3_600_000) * 100) / 100
      const { error } = await admin.from("attendance_records").update({
        check_out_time: now.toISOString(),
        check_out_method: "admin_long_checkin_cleanup",
        work_hours: Math.max(0, workHours),
        auto_checkout: true,
        notes: body.note?.trim() || "Administrator checked out an attendance record open for more than 20 hours.",
        updated_at: now.toISOString(),
      }).eq("id", record.id).is("check_out_time", null)
      if (!error) updated.push(record.id)
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_bulk_long_checkin_checkout",
      new_values: { record_ids: updated, requested_record_ids: recordIds, note: body.note || null },
    })

    return NextResponse.json({ success: true, checkedOut: updated.length, message: `${updated.length} user(s) checked out.` })
  } catch (error) {
    console.error("[long-checkins POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
