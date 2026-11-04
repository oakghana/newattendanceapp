import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"

const FAILURE_ACTIONS = ["check_in_failed", "offpremises_checkin_failed", "check_out_failed", "offpremises_checkout_failed", "qr_check_out_failed", "auto_checkout_failed", "force_checkout_after_failed_attempts"]
const IT_ROLES = ["it-admin", "it_admin", "regional_it_admin", "head_office_it_admin"]

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { userId?: string; forceSend?: boolean; recipientIds?: string[] }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = await createAdminClient()
  const { data: requester } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (!requester || !["admin", "administrator"].includes(requester.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { data: failures } = await admin.from("audit_logs").select("user_id, new_values").in("action", FAILURE_ACTIONS).gte("created_at", start.toISOString()).not("user_id", "is", null).limit(10000)
  const counts = new Map<string, number>()
  for (const failure of failures || []) counts.set(failure.user_id, (counts.get(failure.user_id) || 0) + 1)
  const candidates = [...counts.entries()].filter(([userId, count]) => count >= 12 && (!body.userId || body.userId === userId))
  let sent = 0

  for (const [userId, count] of candidates) {
    const { data: existing } = await admin.from("audit_logs").select("id").eq("user_id", userId).eq("action", "attendance_failure_escalated").gte("created_at", start.toISOString()).limit(1).maybeSingle()
    if (existing && !body.forceSend) continue
    const { data: profile } = await admin.from("user_profiles").select("id, email, first_name, last_name, employee_id, rank, role, department_id, assigned_location_id, region_id").eq("id", userId).maybeSingle()
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const currentEmail = String(profile?.email || authUser.user?.email || "").trim().toLowerCase()
    if (!currentEmail) continue
    const { data: location } = profile?.assigned_location_id ? await admin.from("geofence_locations").select("name").eq("id", profile.assigned_location_id).maybeSingle() : { data: null }
    const { data: allSupportProfiles } = await admin.from("user_profiles").select("email, role, is_active, assigned_location_id, region_id, it_admin_scope")
    const itAdmins = (allSupportProfiles || []).filter((it: any) => {
      const role = String(it.role || "").toLowerCase().replace(/[ _-]/g, "")
      if (it.is_active === false) return false
      return IT_ROLES.map((value) => value.replace(/[ _-]/g, "")).includes(role) || (role.includes("it") && role.includes("admin"))
    })
    const matches = itAdmins.filter((it: any) => it.assigned_location_id === profile?.assigned_location_id || it.region_id === profile?.region_id || it.it_admin_scope === "head_office_it_admin")
    const matchingProfiles = matches.length ? matches : itAdmins
    const selectedProfiles = body.recipientIds?.length
      ? matchingProfiles.filter((profile: any) => body.recipientIds?.includes(profile.id))
      : matchingProfiles
    const itEmails = [...new Set(selectedProfiles.map((it: any) => String(it.email || "").trim().toLowerCase()).filter(Boolean))]
    const { data: admins } = await admin.from("user_profiles").select("email, is_active").in("role", ["admin", "administrator"])
    const adminEmails = (admins || []).filter((a: any) => a.is_active !== false).map((a: any) => String(a.email || "").trim().toLowerCase()).filter(Boolean)
    const primaryRecipient = currentEmail || itEmails[0] || adminEmails[0]
    const cc = [...new Set([...itEmails, ...adminEmails])].filter((email) => email && email !== primaryRecipient)
    if (!primaryRecipient) continue
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || `Staff ${profile?.employee_id || userId}`
    const employeeId = profile?.employee_id || "Not available"
    const { data: departmentRow } = profile?.department_id ? await admin.from("departments").select("name").eq("id", profile.department_id).maybeSingle() : { data: null }
    const department = departmentRow?.name || profile?.department_id || "Not available"
    const region = profile?.region_id || "Not available"
    const html = `<div style="font-family:Arial,sans-serif;color:#17324d;line-height:1.6;max-width:680px;margin:auto"><div style="background:#0b5d3b;color:#fff;padding:28px 32px;border-radius:12px 12px 0 0"><div style="font-size:14px;letter-spacing:1px;text-transform:uppercase">QCC Attendance Support • Ghana</div><h1 style="margin:10px 0 0;font-size:24px">We are on it — help is on the way 🤝</h1></div><div style="border:1px solid #d8e2ea;border-top:0;padding:28px 32px;border-radius:0 0 12px 12px"><p>Hello IT Support Team,</p><p><strong>${name}</strong> has reached 12 failed attendance attempts today. Please assist promptly.</p><div style="background:#f3f8f5;border-left:4px solid #0b5d3b;padding:16px 18px"><strong>Staff and incident details</strong><br>👤 Staff member: ${name}<br>🪪 Staff ID: ${employeeId}<br>📧 Staff email: ${currentEmail}<br>🏢 Department: ${department}<br>🎖️ Rank: ${profile?.rank || "Not available"}<br>🛡️ Role: ${profile?.role || "Not available"}<br>📍 Location: ${location?.name || "Not available"}<br>🌍 Region: ${region}<br>🛠️ IT Admin recipients: ${itEmails.join(", ") || "Administrator fallback"}<br>🔁 Failed attempts: ${count}</div><p>The affected staff member is copied. All relevant IT Admins and Administrators are copied on this single email to coordinate one response.</p><p>Thank you for supporting our colleagues across Ghana. 🇬🇭</p></div></div>`
    const results = await emailService.sendEmail(primaryRecipient, { subject: `Ghana Attendance Support: ${name} needs IT assistance`, replyTo: currentEmail, cc, html, text: `${name} has reached 12 failed attendance attempts today. Department: ${department}. Rank: ${profile?.rank || "Not available"}. Role: ${profile?.role || "Not available"}. Location: ${location?.name || "Not available"}. Region: ${region}. Staff ID: ${employeeId}. Failed attempts: ${count}. IT Admin recipients: ${itEmails.join(", ") || "Not available"}. The affected user is included in this alert.` }, { emailModule: "attendance", emailEvent: "failed_attempt_escalation", emailHeading: "Attendance assistance required", emailSubtitle: "Existing repeated failure reconciled", idempotencyKey: `attendance-failure/${userId}/${start.toISOString().slice(0, 10)}` })
    if (results.success) {
      sent++
      await admin.from("audit_logs").insert({ user_id: userId, action: "attendance_failure_escalated", table_name: "audit_logs", record_id: start.toISOString().slice(0, 10), new_values: { failure_count: count, reconciled: true, recipients: [primaryRecipient, ...cc] } })
    }
  }
  return NextResponse.json({ success: true, sent, checked: candidates.length })
}
