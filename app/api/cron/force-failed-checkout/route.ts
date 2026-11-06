import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"
import { isOvernightShiftDept } from "@/lib/attendance-utils"
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

async function sendTimedCheckoutWarning(admin: any, userId: string, session: any, warningType: "20_hour" | "11pm") {
  const { data: profile } = await admin.from("user_profiles").select("email, employee_id, first_name, last_name, position, role, department_id, assigned_location_id, region_id").eq("id", userId).maybeSingle()
  const [{ data: department }, { data: location }, { data: links }] = await Promise.all([
    profile?.department_id ? admin.from("departments").select("name, code").eq("id", profile.department_id).maybeSingle() : { data: null },
    profile?.assigned_location_id ? admin.from("geofence_locations").select("name").eq("id", profile.assigned_location_id).maybeSingle() : { data: null },
    admin.from("loan_hod_linkages").select("hod_user_id").eq("staff_user_id", userId).limit(20),
  ])
  const hodIds = Array.from(new Set((links || []).map((link: any) => link.hod_user_id).filter(Boolean)))
  const { data: hodProfiles } = hodIds.length ? await admin.from("user_profiles").select("email").in("id", hodIds).eq("is_active", true) : { data: [] as any[] }
  const staffEmail = String(profile?.email || "").trim().toLowerCase()
  if (!staffEmail) return
  const cc = [...new Set([...(hodProfiles || []).map((row: any) => String(row.email || "").trim().toLowerCase()), "oheneba.boamah@qccgh.com", "qualitycontrolcompanyltd@gmail.com"])].filter((email) => email && email !== staffEmail)
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "Staff member"
  const reference = `CHECKOUT-${session.id}`
  const subject = `[${reference}] Attendance checkout warning — ${name}`
  const threshold = warningType === "20_hour" ? "20 hours" : "11:00 PM"
  const action = warningType === "20_hour" ? "Your session has remained open for 20 hours. Please complete checkout immediately; overnight sessions are limited to 24 hours." : "The system has automatically checked you out at 11:00 PM because your department is not an overnight department."
  const text = `Formal attendance warning\n\nDear ${name},\n\n${action}\n\nCheck-in: ${new Date(session.check_in_time).toISOString()}\nDepartment: ${department?.name || "Not available"}\nLocation: ${location?.name || session.check_in_location_name || "Not available"}\nStaff ID: ${profile?.employee_id || "Not available"}\nIncident reference: ${reference}\n\nPlease ensure you check out of the attendance portal at the end of every work period. Continued missed checkouts may be referred to Management for review. Your HOD has been copied for follow-up.\n\nQCC Attendance Administration`
  const html = `<div style="font-family:Arial,sans-serif;color:#243447;line-height:1.6;max-width:700px;margin:auto"><div style="background:#8b1e1e;color:#fff;padding:26px 30px"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase">QCC Attendance Administration</div><h1 style="margin:10px 0 0;font-size:23px">Formal Checkout Warning</h1></div><div style="border:1px solid #d7dee8;border-top:0;padding:26px 30px"><p>Dear <strong>${name}</strong>,</p><p>${action}</p><div style="background:#fff7ed;border-left:4px solid #c2410c;padding:14px 16px"><strong>Attendance details</strong><br>Check-in: ${new Date(session.check_in_time).toISOString()}<br>Review point: ${threshold}<br>Staff ID: ${profile?.employee_id || "Not available"}<br>Department: ${department?.name || "Not available"}<br>Location: ${location?.name || session.check_in_location_name || "Not available"}<br>Incident reference: ${reference}</div><p>Please ensure checkout is completed at the end of every work period. Continued missed checkouts may be referred to Management for review. Your HOD has been copied for follow-up.</p><p>Regards,<br><strong>QCC Attendance Administration</strong></p></div></div>`
  await emailService.sendEmail(staffEmail, { subject, html, text, cc }, { emailModule: "attendance", emailEvent: "timed_checkout_warning", emailHeading: "Attendance checkout warning", emailSubtitle: warningType === "20_hour" ? "20-hour overnight review" : "11 PM automatic checkout", idempotencyKey: `timed-checkout/${warningType}/${userId}/${session.id}` })
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
  const now = new Date()
  const autoCheckoutCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const officeCutoff = new Date(now)
  officeCutoff.setHours(23, 0, 0, 0)
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  let departmentAutoCheckedOut = 0
  let officeAutoCheckedOut = 0
  let autoLoggedOut = 0

  const { data: overdueSessions, error: openSessionsError } = await admin
    .from("attendance_records")
    .select("id, user_id, check_in_time, check_in_location_name")
    .is("check_out_time", null)
    .lt("check_in_time", autoCheckoutCutoff.toISOString())

  const { data: officeSessions } = now >= officeCutoff
    ? await admin
        .from("attendance_records")
        .select("id, user_id, check_in_time, check_in_location_name")
        .is("check_out_time", null)
        .gte("check_in_time", dayStart.toISOString())
        .lte("check_in_time", officeCutoff.toISOString())
    : { data: [] }
  const previousDayStart = new Date(dayStart)
  previousDayStart.setDate(previousDayStart.getDate() - 1)
  const { data: previousDaySessions } = await admin
    .from("attendance_records")
    .select("id, user_id, check_in_time, check_in_location_name")
    .is("check_out_time", null)
    .gte("check_in_time", previousDayStart.toISOString())
    .lt("check_in_time", dayStart.toISOString())

  const openSessions = Array.from(new Map([...(overdueSessions || []), ...(officeSessions || []), ...(previousDaySessions || [])].map((session: any) => [session.id, session])).values())

  if (openSessionsError) {
    return NextResponse.json({ error: "Failed to query overdue attendance", details: openSessionsError.message }, { status: 500 })
  }

  // Only Security, Transport, and Operations may keep sessions open overnight.
  // Their hard maximum is 24 hours; standard departments use normal office rules.
  const openUserIds = [...new Set((openSessions || []).map((session: any) => session.user_id).filter(Boolean))]
  const { data: departmentRows } = await admin.from("departments").select("id, code, name")
  const overnightDepartmentIds = (departmentRows || [])
    .filter((department: any) => isOvernightShiftDept(department))
    .map((department: any) => department.id)
  const { data: departmentProfiles } = openUserIds.length && overnightDepartmentIds.length
    ? await admin.from("user_profiles").select("id, department_id").in("id", openUserIds).in("department_id", overnightDepartmentIds)
    : { data: [] }
  const overnightUserIds = new Set((departmentProfiles || []).map((profile: any) => String(profile.id)))

  for (const session of openSessions) {
    const checkInTime = new Date(session.check_in_time)
    const isOvernight = overnightUserIds.has(String(session.user_id))
    const isTodayOfficeSession = checkInTime >= dayStart && checkInTime <= officeCutoff
    const sessionAgeHours = (now.getTime() - checkInTime.getTime()) / 3600000
    if (isOvernight && sessionAgeHours >= 20 && sessionAgeHours < 24) {
      await sendTimedCheckoutWarning(admin, String(session.user_id), session, "20_hour")
    }
    if (isOvernight && sessionAgeHours >= 24) {
      const checkoutTime = new Date(checkInTime.getTime() + 24 * 60 * 60 * 1000)
      const { error: closeError } = await admin
        .from("attendance_records")
        .update({
          check_out_time: checkoutTime.toISOString(),
          check_out_method: "system_24_hour_auto_checkout",
          check_out_location_name: session.check_in_location_name || "Automatic checkout",
          work_hours: 24,
          auto_checkout: true,
          notes: "Automatically checked out after the 24-hour maximum overnight department period.",
          updated_at: now.toISOString(),
        })
        .eq("id", session.id)
        .is("check_out_time", null)
      if (!closeError) departmentAutoCheckedOut += 1
      continue
    }

    if (!isOvernight && (checkInTime < dayStart || now >= officeCutoff)) {
      const sessionDayCutoff = new Date(checkInTime)
      sessionDayCutoff.setHours(23, 0, 0, 0)
      const checkoutTime = sessionDayCutoff < now ? sessionDayCutoff : now
      const { error: closeError } = await admin
        .from("attendance_records")
        .update({
          check_out_time: checkoutTime.toISOString(),
          check_out_method: "system_11pm_auto_checkout",
          check_out_location_name: session.check_in_location_name || "Automatic checkout",
          work_hours: Math.max(0, Math.min(24, Math.round(((checkoutTime.getTime() - checkInTime.getTime()) / 3600000) * 100) / 100)),
          auto_checkout: true,
          notes: "Automatically checked out at 11:00 PM for a non-overnight department.",
          updated_at: now.toISOString(),
        })
        .eq("id", session.id)
        .is("check_out_time", null)

      if (!closeError) {
        officeAutoCheckedOut += 1
        await sendTimedCheckoutWarning(admin, String(session.user_id), session, "11pm")
        try {
          await admin.auth.admin.signOut(String(session.user_id), "global")
          await admin.from("device_sessions").delete().eq("user_id", session.user_id)
          autoLoggedOut += 1
        } catch (logoutError) {
          console.error("[cron/force-failed-checkout] Auto logout failed:", logoutError)
        }
      }
    }
  }

  // Backfill warnings for users whose automatic checkout happened before the
  // warning-email code was deployed. The idempotency key prevents duplicates.
  const yesterdayStart = new Date(dayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const yesterdayEnd = new Date(dayStart)
  const { data: missedCheckoutSessions } = await admin
    .from("attendance_records")
    .select("id, user_id, check_in_time, check_in_location_name")
    .eq("auto_checkout", true)
    .in("check_out_method", ["system_11pm_auto_checkout", "system_midnight_auto_checkout"])
    .gte("check_out_time", yesterdayStart.toISOString())
    .lt("check_out_time", yesterdayEnd.toISOString())
  for (const session of missedCheckoutSessions || []) {
    await sendTimedCheckoutWarning(admin, String(session.user_id), session, "11pm")
  }

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
  
  // Fetch user departments early to check for Security staff
  const { data: earlyProfiles, error: earlyProfileErr } = await admin
    .from("user_profiles")
    .select("id, department_id, department:departments!inner(name)")
    .in("id", candidates.map((c) => c.userId))

  const securityStaffIds = new Set<string>()
  if (earlyProfiles) {
    for (const profile of earlyProfiles) {
      const deptName = profile.department?.name?.toLowerCase() || ""
      if (deptName.includes("security")) {
        securityStaffIds.add(profile.id)
      }
    }
  }

  const nonSecurityCandidates = candidates.filter((c) => !securityStaffIds.has(c.userId))
  const securityExemptCount = candidates.length - nonSecurityCandidates.length

  if (nonSecurityCandidates.length === 0) {
    return NextResponse.json({
      success: true,
      day,
      criteria: { minAttempts, maxDistanceM },
      candidates: candidates.length,
      security_exempted: securityExemptCount,
      department_24_hour_auto_checked_out: departmentAutoCheckedOut,
      office_11pm_auto_checked_out: officeAutoCheckedOut,
      auto_logged_out: autoLoggedOut,
      updated: 0,
      skipped: 0,
      report: candidates.map((c) => ({ 
        user_id: c.userId, 
        status: securityStaffIds.has(c.userId) ? "exempted" : "skipped", 
        reason: securityStaffIds.has(c.userId) ? "security_department_exemption" : "no_open_attendance" 
      })),
    })
  }

  const filteredUserIds = nonSecurityCandidates.map((c) => c.userId)

  const { data: openAttendance, error: openErr } = await admin
    .from("attendance_records")
    .select("id, user_id, check_in_time, check_out_time, check_in_location_name")
    .in("user_id", filteredUserIds)
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

  for (const c of nonSecurityCandidates) {
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
        attempt_type: "auto_checkout_recovery",
        failure_reason: "auto_force_checkout_after_failed_attempts",
        failure_message: "System auto check-out completed after repeated failed checkout attempts.",
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
    security_exempted: securityExemptCount,
    department_24_hour_auto_checked_out: departmentAutoCheckedOut,
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
