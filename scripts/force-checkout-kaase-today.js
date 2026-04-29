#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

function loadDotEnv(envPath) {
  try {
    const raw = fs.readFileSync(envPath, "utf8")
    const lines = raw.split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/^(\w+)=(.*)$/)
      if (!m) continue
      const key = m[1]
      let val = m[2]
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // ignore missing env file
  }
}

function getPayload(row) {
  return row.new_values && typeof row.new_values === "object" ? row.new_values : {}
}

function toLowerText(value) {
  return String(value || "").trim().toLowerCase()
}

function isKaaseRelated(payload, keyword) {
  const fields = [
    payload.nearest_location_name,
    payload.check_out_location_name,
    payload.location_name,
    payload.failure_message,
    payload.notes,
  ]

  return fields.some((f) => toLowerText(f).includes(keyword))
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), ".env.local"))

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment/.env.local")
    process.exit(1)
  }

  const kaaseKeyword = toLowerText(process.env.KAASE_KEYWORD || "kaase")
  const minAttempts = Number.parseInt(process.env.KAASE_MIN_ATTEMPTS || "1", 10)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().split("T")[0]
  const start = `${today}T00:00:00Z`
  const end = `${today}T23:59:59Z`

  console.log(`[kaase-force-checkout] Processing date: ${today}`)

  const { data: failures, error: failErr } = await supabase
    .from("audit_logs")
    .select("id, user_id, action, created_at, new_values")
    .in("action", ["check_out_failed", "offpremises_checkout_failed", "qr_check_out_failed", "auto_checkout_failed"])
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false })

  if (failErr) {
    console.error("[kaase-force-checkout] Failed to query audit logs:", failErr)
    process.exit(1)
  }

  const grouped = new Map()

  for (const row of failures || []) {
    if (!row.user_id) continue
    const payload = getPayload(row)

    if (!isKaaseRelated(payload, kaaseKeyword)) continue

    if (!grouped.has(row.user_id)) {
      grouped.set(row.user_id, {
        user_id: row.user_id,
        attempts: 0,
        latest_attempt_at: row.created_at,
        latest_payload: payload,
      })
    }

    const g = grouped.get(row.user_id)
    g.attempts += 1

    if (new Date(row.created_at).getTime() > new Date(g.latest_attempt_at).getTime()) {
      g.latest_attempt_at = row.created_at
      g.latest_payload = payload
    }
  }

  const candidates = Array.from(grouped.values()).filter((x) => x.attempts >= minAttempts)

  if (candidates.length === 0) {
    console.log("[kaase-force-checkout] No users matched criteria for Kaase failed checkouts today.")
    process.exit(0)
  }

  const userIds = candidates.map((c) => c.user_id)

  const { data: openAttendance, error: attErr } = await supabase
    .from("attendance_records")
    .select("id, user_id, check_in_time, check_out_time, check_in_location_name")
    .in("user_id", userIds)
    .gte("check_in_time", start)
    .lte("check_in_time", end)
    .is("check_out_time", null)

  if (attErr) {
    console.error("[kaase-force-checkout] Failed to query open attendance:", attErr)
    process.exit(1)
  }

  const openByUser = new Map()
  for (const rec of openAttendance || []) {
    const existing = openByUser.get(rec.user_id)
    if (!existing || new Date(rec.check_in_time).getTime() > new Date(existing.check_in_time).getTime()) {
      openByUser.set(rec.user_id, rec)
    }
  }

  let updated = 0
  let skipped = 0
  const report = []

  for (const candidate of candidates) {
    const attendance = openByUser.get(candidate.user_id)
    if (!attendance) {
      skipped += 1
      report.push({ user_id: candidate.user_id, status: "skipped", reason: "no_open_attendance" })
      continue
    }

    const attemptTime = new Date(candidate.latest_attempt_at)
    const checkInTime = new Date(attendance.check_in_time)

    if (attemptTime.getTime() <= checkInTime.getTime()) {
      skipped += 1
      report.push({ user_id: candidate.user_id, status: "skipped", reason: "attempt_before_checkin" })
      continue
    }

    const workHours = Math.round(((attemptTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100
    const payload = candidate.latest_payload || {}

    const updatePayload = {
      check_out_time: attemptTime.toISOString(),
      check_out_method: "force_after_failed_checkout_attempts",
      check_out_location_name: payload.nearest_location_name || attendance.check_in_location_name || "KAASE",
      check_out_latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
      check_out_longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
      is_remote_checkout: true,
      work_hours: workHours,
      notes: `Force checkout applied for Kaase user after ${candidate.attempts} failed checkout attempt(s) today (distance bypass).`,
      updated_at: new Date().toISOString(),
    }

    const { error: upErr } = await supabase.from("attendance_records").update(updatePayload).eq("id", attendance.id)

    if (upErr) {
      skipped += 1
      report.push({ user_id: candidate.user_id, status: "failed", reason: upErr.message })
      continue
    }

    await supabase.from("audit_logs").insert({
      user_id: attendance.user_id,
      action: "force_checkout_after_failed_attempts",
      table_name: "attendance_records",
      record_id: attendance.id,
      new_values: {
        force_rule: `kaase_today_failed_attempts>=${minAttempts}_distance_bypass`,
        attempts: candidate.attempts,
        latest_attempt_at: candidate.latest_attempt_at,
        check_out_method: "force_after_failed_checkout_attempts",
        check_out_location_name: updatePayload.check_out_location_name,
        work_hours: workHours,
        source: "manual_script_kaase_today",
        attempt_type: "auto_checkout_recovery",
        failure_reason: "auto_force_checkout_after_failed_attempts",
        failure_message: "System auto check-out completed for Kaase after repeated failed checkout attempts.",
        nearest_location_name: payload.nearest_location_name || updatePayload.check_out_location_name,
        nearest_location_distance_m: Number.isFinite(Number(payload.nearest_location_distance_m))
          ? Number(payload.nearest_location_distance_m)
          : null,
      },
    })

    updated += 1
    report.push({
      user_id: candidate.user_id,
      attendance_id: attendance.id,
      status: "updated",
      attempts: candidate.attempts,
      check_out_time: attemptTime.toISOString(),
      location: updatePayload.check_out_location_name,
    })
  }

  console.log("[kaase-force-checkout] Completed")
  console.log(
    JSON.stringify(
      {
        date: today,
        criteria: {
          keyword: kaaseKeyword,
          min_attempts: minAttempts,
          distance_bypass: true,
        },
        candidates: candidates.length,
        updated,
        skipped,
        report,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error("[kaase-force-checkout] Unexpected error:", err)
  process.exit(1)
})
