import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type FailureGroup = {
  userId: string
  attempts: number
  latestAttemptAt: string
  latestPayload: Record<string, any>
}

function getPayload(newValues: any): Record<string, any> {
  return newValues && typeof newValues === "object" ? newValues : {}
}

async function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  const { supabase, user } = await createClientAndGetUser()
  if (!user) return false

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  return ["admin", "it-admin", "god"].includes(String(profile?.role || ""))
}

function toUtcDayRange(dateStr?: string) {
  const source = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date()
  const yyyy = source.getUTCFullYear()
  const mm = String(source.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(source.getUTCDate()).padStart(2, "0")
  const day = `${yyyy}-${mm}-${dd}`

  return {
    day,
    start: `${day}T00:00:00Z`,
    end: `${day}T23:59:59Z`,
  }
}

async function runForceFailedCheckout(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = await createAdminClient()
  const { searchParams } = new URL(request.url)

  const dateParam = searchParams.get("date") || undefined
  const minAttempts = Math.max(3, Number.parseInt(searchParams.get("min_attempts") || "3", 10))
  const maxDistanceM = Math.max(1, Number.parseInt(searchParams.get("max_distance_m") || "100", 10))

  const { day, start, end } = toUtcDayRange(dateParam)

  const { data: locations, error: locErr } = await admin.from("geofence_locations").select("name")
  if (locErr) {
    return NextResponse.json({ error: "Failed to load locations", details: locErr.message }, { status: 500 })
  }

  const knownLocations = new Set((locations || []).map((l: any) => String(l.name || "").trim().toLowerCase()).filter(Boolean))

  const { data: failures, error: failErr } = await admin
    .from("audit_logs")
    .select("id, user_id, action, created_at, new_values")
    .in("action", ["check_out_failed", "offpremises_checkout_failed", "qr_check_out_failed", "auto_checkout_failed"])
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false })

  if (failErr) {
    return NextResponse.json({ error: "Failed to query checkout failures", details: failErr.message }, { status: 500 })
  }

  const grouped = new Map<string, FailureGroup>()

  for (const row of failures || []) {
    const userId = String(row.user_id || "")
    if (!userId) continue

    const payload = getPayload(row.new_values)
    const nearestName = String(payload.nearest_location_name || "").trim()
    const nearestDistance = Number(payload.nearest_location_distance_m)

    if (!Number.isFinite(nearestDistance) || nearestDistance > maxDistanceM) continue
    if (!nearestName) continue
    if (!knownLocations.has(nearestName.toLowerCase())) continue

    const existing = grouped.get(userId)
    if (!existing) {
      grouped.set(userId, {
        userId,
        attempts: 1,
        latestAttemptAt: row.created_at,
        latestPayload: payload,
      })
      continue
    }

    existing.attempts += 1
    if (new Date(row.created_at).getTime() > new Date(existing.latestAttemptAt).getTime()) {
      existing.latestAttemptAt = row.created_at
      existing.latestPayload = payload
    }
  }

  const candidates = Array.from(grouped.values()).filter((g) => g.attempts >= minAttempts)
  if (candidates.length === 0) {
    return NextResponse.json({
      success: true,
      day,
      criteria: { minAttempts, maxDistanceM },
      candidates: 0,
      updated: 0,
      skipped: 0,
      report: [],
    })
  }

  const userIds = candidates.map((c) => c.userId)
  const { data: openAttendance, error: openErr } = await admin
    .from("attendance_records")
    .select("id, user_id, check_in_time, check_out_time, check_in_location_name")
    .in("user_id", userIds)
    .gte("check_in_time", start)
    .lte("check_in_time", end)
    .is("check_out_time", null)

  if (openErr) {
    return NextResponse.json({ error: "Failed to query open attendance", details: openErr.message }, { status: 500 })
  }

  const openByUser = new Map<string, any>()
  for (const rec of openAttendance || []) {
    const existing = openByUser.get(rec.user_id)
    if (!existing || new Date(rec.check_in_time).getTime() > new Date(existing.check_in_time).getTime()) {
      openByUser.set(rec.user_id, rec)
    }
  }

  const report: Array<Record<string, any>> = []
  let updated = 0
  let skipped = 0

  for (const c of candidates) {
    const attendance = openByUser.get(c.userId)
    if (!attendance) {
      skipped += 1
      report.push({ user_id: c.userId, status: "skipped", reason: "no_open_attendance" })
      continue
    }

    const attemptTime = new Date(c.latestAttemptAt)
    const checkInTime = new Date(attendance.check_in_time)
    if (attemptTime.getTime() <= checkInTime.getTime()) {
      skipped += 1
      report.push({ user_id: c.userId, status: "skipped", reason: "attempt_before_checkin" })
      continue
    }

    const payload = c.latestPayload || {}
    const workHours = Math.round(((attemptTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100

    const updatePayload: Record<string, any> = {
      check_out_time: attemptTime.toISOString(),
      check_out_method: "force_after_failed_checkout_attempts",
      check_out_location_name: payload.nearest_location_name || attendance.check_in_location_name || "QCC Location",
      check_out_latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
      check_out_longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
      is_remote_checkout: false,
      work_hours: workHours,
      notes: `Auto force checkout applied after ${c.attempts} failed in-range checkout attempts.`,
      updated_at: new Date().toISOString(),
    }

    const { error: upErr } = await admin.from("attendance_records").update(updatePayload).eq("id", attendance.id)
    if (upErr) {
      skipped += 1
      report.push({ user_id: c.userId, status: "failed", reason: upErr.message })
      continue
    }

    await admin.from("audit_logs").insert({
      user_id: c.userId,
      action: "force_checkout_after_failed_attempts",
      table_name: "attendance_records",
      record_id: attendance.id,
      new_values: {
        force_rule: `>=${minAttempts} failed checkout attempts, <=${maxDistanceM}m, known QCC location`,
        attempts: c.attempts,
        latest_attempt_at: c.latestAttemptAt,
        check_out_method: "force_after_failed_checkout_attempts",
        check_out_location_name: updatePayload.check_out_location_name,
        work_hours: workHours,
        source: "cron",
      },
    })

    updated += 1
    report.push({
      user_id: c.userId,
      attendance_id: attendance.id,
      status: "updated",
      attempts: c.attempts,
      check_out_time: attemptTime.toISOString(),
      location: updatePayload.check_out_location_name,
    })
  }

  return NextResponse.json({
    success: true,
    day,
    criteria: { minAttempts, maxDistanceM },
    candidates: candidates.length,
    updated,
    skipped,
    report,
  })
}

export async function GET(request: NextRequest) {
  return runForceFailedCheckout(request)
}

export async function POST(request: NextRequest) {
  return runForceFailedCheckout(request)
}
