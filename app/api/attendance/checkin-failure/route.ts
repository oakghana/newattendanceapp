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
        .select("employee_id, first_name, last_name, email, role, department_id, assigned_location_id, region_id, departments(name, code)")
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
        const recipients = [...new Set(matchingAdmins.map((candidate: any) => String(candidate.email || "").trim().toLowerCase()).filter(Boolean))]
        const { data: systemAdmins } = await admin
          .from("user_profiles")
          .select("email")
          .in("role", ["admin", "administrator"])
          .eq("is_active", true)
        const cc = [...new Set((systemAdmins || []).map((candidate: any) => String(candidate.email || "").trim().toLowerCase()).filter(Boolean))]
        const currentUserEmail = String(profile?.email || user.email || "").trim().toLowerCase()

        if (recipients.length && currentUserEmail) {
          const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "A staff member"
          const subject = `Attendance assistance required: ${name} exceeded failed attempts`
          const template = {
            subject,
            replyTo: currentUserEmail,
            cc: cc.filter((email) => !recipients.includes(email) && email !== currentUserEmail),
            html: `<p><strong>${name}</strong> has recorded more than five failed attendance attempts today.</p><p>Please contact the staff member directly to investigate and resolve the issue before the next working day.</p><p><strong>Location:</strong> ${locationName}<br/><strong>Failure reason:</strong> ${failureReason}<br/><strong>Latest message:</strong> ${failureMessage || "Not provided"}</p>`,
            text: `${name} has recorded more than five failed attendance attempts today. Please contact the staff member directly. Location: ${locationName}. Failure reason: ${failureReason}. Latest message: ${failureMessage || "Not provided"}.`,
          }
          const results = await Promise.all(recipients.map((recipient) => emailService.sendEmail(recipient, template, {
            emailModule: "attendance",
            emailEvent: "failed_attempt_escalation",
            emailHeading: "Attendance assistance required",
            emailSubtitle: "A staff member needs help with repeated attendance failures.",
            idempotencyKey: `attendance-failure/${user.id}/${todayStart.toISOString().slice(0, 10)}`,
          })))
          escalationSent = results.some((result) => result.success)
        }

        if (escalationSent) {
          await admin.from("audit_logs").insert({
            user_id: user.id,
            action: "attendance_failure_escalated",
            table_name: "audit_logs",
            new_values: { failure_count: (failureCount || 0) + 1, location_name: locationName, recipients },
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
