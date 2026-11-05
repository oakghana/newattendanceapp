import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isOvernightShiftDept } from "@/lib/attendance-utils"

const ALLOWED_ROLES = new Set(["admin"])
const THRESHOLD_HOURS = 5
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const FETCH_CHUNK = 1000

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1)
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE))
    const { user, profile } = await requireAdmin()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!profile) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })

    const admin = await createAdminClient()
    const nowMs = Date.now()
    // Let PostgreSQL compare the stored timestamp directly. This avoids silently
    // dropping valid sessions when JavaScript parses timestamp formats differently
    // from the database timezone.
    const thresholdTime = nowMs - THRESHOLD_HOURS * 60 * 60 * 1000
    const thresholdIso = new Date(thresholdTime).toISOString()

    // Supabase caps a single response at 1000 rows, so page through every stale open record.
    const openRows: any[] = []
    for (let from = 0; ; from += FETCH_CHUNK) {
      const { data, error } = await admin
        .from("attendance_records")
        .select("id, user_id, check_in_time, check_in_location_name, check_in_method, auto_checkout")
        .is("check_out_time", null)
        .lte("check_in_time", thresholdIso)
        .order("check_in_time", { ascending: false })
        .range(from, from + FETCH_CHUNK - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      openRows.push(...(data || []).filter((row: any) => row.auto_checkout !== true))
      if (!data || data.length < FETCH_CHUNK) break
    }

    const latestByUser = new Map<string, any>()
    for (const row of openRows) {
      if (row.user_id && !latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row)
    }

    const candidateIds = [...latestByUser.keys()]
    const { data: departmentRows } = await admin.from("departments").select("id, code, name")
    const overnightDepartmentIds = (departmentRows || [])
      .filter((department: any) => isOvernightShiftDept(department))
      .map((department: any) => department.id)
    const { data: overnightProfiles } = candidateIds.length && overnightDepartmentIds.length
      ? await admin
          .from("user_profiles")
          .select("id, department_id")
          .in("id", candidateIds)
          .in("department_id", overnightDepartmentIds)
      : { data: [] as any[] }
    const overnightUserIds = new Set((overnightProfiles || []).map((person: any) => String(person.id)))
    for (const userId of candidateIds) {
      if (!overnightUserIds.has(String(userId))) latestByUser.delete(userId)
    }

    // The source query already guarantees check_out_time IS NULL and selects
    // the latest open session per user. Do not compare it with completed rows:
    // a later completed attendance record must not hide the current open one.
    const rows = [...latestByUser.values()]
      .sort((a, b) => Date.parse(a.check_in_time) - Date.parse(b.check_in_time))
    const attendanceCount = rows.length
    const pagedRows = rows.slice((page - 1) * limit, page * limit)
    const userIds = [...new Set(pagedRows.map((row) => row.user_id).filter(Boolean))]
    const { data: profiles, error: profilesError } = userIds.length
      ? await admin.from("user_profiles").select("id, employee_id, first_name, last_name, department_id").in("id", userIds)
      : { data: [], error: null }
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
    const departmentIds = [...new Set((profiles || []).map((person: any) => person.department_id).filter(Boolean))]
    const { data: departments, error: departmentsError } = departmentIds.length
      ? await admin.from("departments").select("id, name").in("id", departmentIds)
      : { data: [], error: null }
    if (departmentsError) return NextResponse.json({ error: departmentsError.message }, { status: 500 })
    const departmentMap = new Map((departments || []).map((department: any) => [department.id, department.name]))
    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))

    const records = pagedRows.map((record) => {
      const person = profileMap.get(record.user_id) as any
      return {
        id: record.id,
        user_id: record.user_id,
        employee_id: person?.employee_id || "N/A",
        full_name: `${person?.first_name || ""} ${person?.last_name || ""}`.trim() || "Unknown User",
        department_name: departmentMap.get(person?.department_id) || "Unassigned",
        department_id: person?.department_id || null,
        check_in_time: record.check_in_time,
        last_check_in: record.check_in_time,
        activity: record.check_in_method || "Check-in remains open",
        location_name: record.check_in_location_name || "Unknown",
        hours_open: Math.round(((nowMs - Date.parse(record.check_in_time)) / 3_600_000) * 100) / 100,
      }
    })

    return NextResponse.json({
      success: true,
      records,
      thresholdHours: THRESHOLD_HOURS,
      page,
      limit,
      total: attendanceCount || 0,
      totalPages: Math.max(1, Math.ceil((attendanceCount || 0) / limit)),
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
      .select("id, user_id, check_in_time, check_out_time")
      .in("id", recordIds)

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    const updated: string[] = []
    const checkoutTimes: Record<string, string> = {}
    const updatedUserIds: string[] = []
    const failures: string[] = []
    const openOnly = (openRecords || []).filter((item: any) => item.check_out_time == null || String(item.check_out_time).trim() === "")
    for (const record of openOnly) {
      // work_hours is DECIMAL(4,2) (max 99.99), and a single duty period is capped at 24h
      // everywhere else in the app, so never write the raw elapsed time.
      const elapsedHours = Math.round(((now.getTime() - new Date(record.check_in_time).getTime()) / 3_600_000) * 100) / 100
      const workHours = Math.min(24, Math.max(0, elapsedHours))
      const checkoutAt = now.toISOString()
      const note = body.note?.trim() || `Administrator checked out an attendance record open for more than ${THRESHOLD_HOURS} hours.`

      let { error } = await admin.from("attendance_records").update({
        check_out_time: checkoutAt,
        check_out_method: "admin_long_checkin_cleanup",
        work_hours: workHours,
        auto_checkout: true,
        notes: note,
        updated_at: checkoutAt,
      }).eq("id", record.id).is("check_out_time", null)

      if (error) {
        console.warn("[long-checkins] Full update failed, retrying minimal:", record.id, error.message)
        const retry = await admin.from("attendance_records").update({
          check_out_time: checkoutAt,
          work_hours: workHours,
        }).eq("id", record.id).is("check_out_time", null)
        error = retry.error
      }

      if (error) {
        failures.push(error.message)
        continue
      }
      {
        updated.push(record.id)
        checkoutTimes[record.id] = checkoutAt
        if (record.user_id) {
          updatedUserIds.push(record.user_id)
          // Close any older orphaned open sessions too so the user cannot reappear in this list.
          await admin.from("attendance_records").update({
            check_out_time: now.toISOString(),
            check_out_method: "admin_long_checkin_cleanup",
            auto_checkout: true,
            updated_at: now.toISOString(),
          }).eq("user_id", record.user_id).is("check_out_time", null).lte("check_in_time", record.check_in_time)
        }
      }
    }

    const notifiedUserIds = [...new Set(updatedUserIds)]
    if (notifiedUserIds.length) {
      const { error: notificationError } = await admin.from("staff_notifications").insert(
        notifiedUserIds.map((userId) => ({
          user_id: userId,
          title: "Check-out completed successfully",
          message: `An administrator checked you out at ${now.toISOString()}. Your next login will start a new check-in record.`, 
          type: "info",
          is_read: false,
        })),
      )
      if (notificationError) console.warn("[long-checkins] Failed to notify checked-out staff:", notificationError.message)
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_bulk_long_checkin_checkout",
      new_values: { record_ids: updated, requested_record_ids: recordIds, checkout_times: checkoutTimes, note: body.note || null },
    })

    if (!updated.length) {
      const reason = failures[0]
        ? `Check-out failed: ${failures[0]}`
        : "The selected records are no longer open. Refresh the list."
      return NextResponse.json({ success: false, error: reason, checkedOut: 0 }, { status: failures.length ? 500 : 409 })
    }

    const failedNote = failures.length ? ` ${failures.length} record(s) could not be checked out.` : ""
    return NextResponse.json({
      success: true,
      checkedOut: updated.length,
      notified: notifiedUserIds.length,
      failed: failures.length,
      checkoutTime: now.toISOString(),
      checkoutTimes,
      message: `${updated.length} user(s) checked out and notified at ${now.toISOString()}.${failedNote}`, 
    })
  } catch (error) {
    console.error("[long-checkins POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
