import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"

const ALLOWED_ATTEMPT_TYPES = new Set([
  "manual_checkin",
  "offpremises_checkin",
  "manual_checkout",
  "offpremises_checkout",
  "qr_checkout",
  "auto_checkout",
])

const ACTION_BY_ATTEMPT_TYPE: Record<string, string> = {
  manual_checkin: "check_in_failed",
  offpremises_checkin: "offpremises_checkin_failed",
  manual_checkout: "check_out_failed",
  offpremises_checkout: "offpremises_checkout_failed",
  qr_checkout: "qr_check_out_failed",
  auto_checkout: "auto_checkout_failed",
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const attemptType = String(body?.attemptType || "manual_checkin")
    const failureReason = String(body?.failureReason || "unknown")
    const failureMessage = String(body?.failureMessage || "")

    if (!ALLOWED_ATTEMPT_TYPES.has(attemptType)) {
      return NextResponse.json({ error: "Invalid attempt type" }, { status: 400 })
    }

    const {
      data: profile,
    } = await supabase
      .from("user_profiles")
        .select("employee_id, first_name, last_name, email, rank, role, department_id, assigned_location_id, region_id, departments(name, code), regions(name)")
      .eq("id", user.id)
      .maybeSingle()

    const payload = {
      attempt_type: attemptType,
      failure_reason: failureReason,
      failure_message: failureMessage,
      attempted_at: new Date().toISOString(),
      nearest_location_name: body?.nearestLocationName || null,
      nearest_location_distance_m: body?.nearestLocationDistanceM ?? null,
      latitude: body?.latitude ?? null,
      longitude: body?.longitude ?? null,
      accuracy: body?.accuracy ?? null,
      device_type: body?.deviceType || null,
      device_info: body?.deviceInfo || null,
      user_profile_snapshot: {
        employee_id: profile?.employee_id || null,
        full_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
        role: profile?.role || null,
        department_name: (profile as any)?.departments?.name || null,
        department_code: (profile as any)?.departments?.code || null,
      },
    }

    const clientIp =
      (request as any).ip ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null

    const admin = await createAdminClient()
    const failureAction = ACTION_BY_ATTEMPT_TYPE[attemptType] || "check_in_failed"
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: failureCount } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("action", Object.values(ACTION_BY_ATTEMPT_TYPE))
      .gte("created_at", todayStart.toISOString())

    const shouldEscalate = (failureCount || 0) >= 5
    let escalationSent = false

    if (shouldEscalate) {
      const { data: existingEscalation } = await admin
        .from("audit_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("action", "attendance_failure_escalated")
        .gte("created_at", todayStart.toISOString())
        .limit(1)
        .maybeSingle()

      if (!existingEscalation) {
        const locationQuery = profile?.assigned_location_id
          ? await admin.from("geofence_locations").select("name").eq("id", profile.assigned_location_id).maybeSingle()
          : { data: null }
        const locationName = locationQuery.data?.name || "the assigned location"
        const regionName = (profile as any)?.regions?.name || "the assigned region"
        const latitude = payload.latitude == null ? "Not available" : `${payload.latitude}`
        const longitude = payload.longitude == null ? "Not available" : `${payload.longitude}`
        const gpsCoordinates = payload.latitude == null || payload.longitude == null
          ? "Not available"
          : `${latitude}, ${longitude}`
        const itRoles = ["it-admin", "it_admin", "regional_it_admin", "head_office_it_admin"]
        const { data: itAdmins } = await admin
          .from("user_profiles")
          .select("id, email, first_name, last_name, role, it_admin_scope, assigned_location_id, region_id")
          .in("role", itRoles)
          .eq("is_active", true)
        const matchingAdmins = (itAdmins || []).filter((candidate: any) =>
          (candidate.assigned_location_id && candidate.assigned_location_id === profile?.assigned_location_id) ||
          (candidate.region_id && candidate.region_id === profile?.region_id) ||
          candidate.it_admin_scope === "head_office_it_admin",
        )
        const itAdminEmails = [...new Set(matchingAdmins.map((candidate: any) => String(candidate.email || "").trim().toLowerCase()).filter(Boolean))]
        const { data: systemAdmins } = await admin
          .from("user_profiles")
          .select("email")
          .in("role", ["admin", "administrator"])
          .eq("is_active", true)
        const administratorEmails = [...new Set((systemAdmins || []).map((candidate: any) => String(candidate.email || "").trim().toLowerCase()).filter(Boolean))]
        const primaryRecipient = itAdminEmails[0]
        const cc = [...new Set([...itAdminEmails.slice(1), ...administratorEmails])].filter((email) => email !== primaryRecipient)
        const currentUserEmail = String(profile?.email || user.email || "").trim().toLowerCase()
        const ccWithUser = [...new Set([...cc, currentUserEmail])].filter((email) => email && email !== primaryRecipient)

        if (primaryRecipient && currentUserEmail) {
          const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "A staff member"
          const department = (profile as any)?.departments?.name || "Not available"
          const rank = (profile as any)?.rank || "Not available"
          const role = profile?.role || "Not available"
          const subject = `Ghana Attendance Support: ${name} needs IT assistance`
          const template = {
            subject,
            replyTo: currentUserEmail,
            cc: ccWithUser,
            html: `<div style="font-family:Arial,sans-serif;color:#17324d;line-height:1.6;max-width:680px;margin:0 auto"><div style="background:#0b5d3b;color:#fff;padding:28px 32px;border-radius:12px 12px 0 0"><div style="font-size:14px;letter-spacing:1px;text-transform:uppercase;opacity:.85">QCC Attendance Support • Ghana</div><h1 style="margin:10px 0 0;font-size:24px">We are on it — help is on the way 🤝</h1></div><div style="border:1px solid #d8e2ea;border-top:0;padding:28px 32px;border-radius:0 0 12px 12px"><p>Hello IT Support Team,</p><p><strong>${name}</strong> has experienced more than five failed attendance attempts today. Please kindly assist the staff member and help us resolve the issue before the next working day.</p><div style="background:#f3f8f5;border-left:4px solid #0b5d3b;padding:16px 18px;margin:22px 0"><strong>Staff and incident details</strong><br>👤 <strong>Staff member:</strong> ${name}<br>🏢 <strong>Department:</strong> ${department}<br>🎖️ <strong>Rank:</strong> ${rank}<br>🛡️ <strong>Role:</strong> ${role}<br>📍 <strong>Location:</strong> ${locationName}<br>🌍 <strong>Region:</strong> ${regionName}<br>🛰️ <strong>GPS coordinates:</strong> ${gpsCoordinates}<br>🔁 <strong>Failed attempts:</strong> ${(failureCount || 0) + 1}</div><p>The affected staff member is copied on this email and can follow the support conversation directly. All relevant Regional/Location IT Admins and Administrators have been copied on this single email to coordinate one response and avoid duplicate outreach.</p><p>Thank you for helping us keep attendance running smoothly across Ghana. 🇬🇭</p><p style="margin-bottom:0">Warm regards,<br><strong>QCC Attendance IT Support</strong></p></div></div>`,
            text: `QCC Attendance Support • Ghana\n\nWe are on it — help is on the way.\n\n${name} has experienced more than five failed attendance attempts today. The affected staff member is copied on this email. Please respond to the conversation and help resolve the issue before the next working day.\n\nStaff and incident details:\nStaff member: ${name}\nDepartment: ${department}\nRank: ${rank}\nRole: ${role}\nLocation: ${locationName}\nRegion: ${regionName}\nGPS coordinates: ${gpsCoordinates}\nFailed attempts: ${(failureCount || 0) + 1}\n\nAll relevant Regional/Location IT Admins and Administrators are copied on this single email to coordinate one response. Thank you for supporting our colleagues across Ghana. 🇬🇭`,
          }
          const results = await Promise.all([emailService.sendEmail(primaryRecipient, template, {
            emailModule: "attendance",
            emailEvent: "failed_attempt_escalation",
            emailHeading: "Attendance assistance required",
            emailSubtitle: "A staff member needs help with repeated attendance failures.",
            idempotencyKey: `attendance-failure/${user.id}/${todayStart.toISOString().slice(0, 10)}`,
          })])
          escalationSent = results.some((result) => result.success)
        }

        if (escalationSent) {
          await admin.from("audit_logs").insert({
            user_id: user.id,
            action: "attendance_failure_escalated",
            table_name: "audit_logs",
            new_values: { failure_count: (failureCount || 0) + 1, location_name: locationName, recipients: [primaryRecipient, ...ccWithUser] },
            ip_address: clientIp,
            user_agent: request.headers.get("user-agent"),
          })
        }
      }
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: failureAction,
      table_name: "attendance_records",
      record_id: null,
      new_values: payload,
      ip_address: clientIp,
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ success: true, failureCount: (failureCount || 0) + 1, escalationSent })
  } catch (error) {
    console.error("[v0] Failed to log check-in failure:", error)
    return NextResponse.json({ error: "Failed to log check-in failure" }, { status: 500 })
  }
}
