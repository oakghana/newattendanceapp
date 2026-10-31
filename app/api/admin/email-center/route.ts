import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"

export const maxDuration = 120

const BROADCAST_CONCURRENCY = 8
const WORKER_INTERVAL_MS = 1000
const RATE_LIMIT_RETRY_DELAYS_MS = [1500, 3500]
const AUDIENCE_ROLES: Record<string, string[]> = {
  staff: ["staff", "nsp", "intern", "contract", "contract_role", "contract_staff", "contract_worker"],
  leadership: ["department_head", "head_of_department", "regional_manager"],
  hr_accounts: ["hr", "hr_executive", "hr_executive_officer", "director_hr", "manager_hr", "regional_hr", "regional_hr_office", "accounts_executive"],
  operations: ["transport_manager", "chief_driver", "audit_staff", "it-admin", "it_admin"],
  administrators: ["admin", "administrator"],
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  const role = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  if (!["admin", "administrator"].includes(role)) {
    return { error: NextResponse.json({ error: "Administrator access required" }, { status: 403 }) }
  }
  return { supabase: await createAdminClient(), user }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const view = request.nextUrl.searchParams.get("view") || "logs"
  if (view === "cc") {
    const { data, error } = await auth.supabase.from("system_settings").select("settings").eq("id", 1).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ccSettings: data?.settings?.emailCcByModule || {} })
  }
  if (view === "templates") {
    const { data, error } = await auth.supabase.from("email_templates").select("*").order("module").order("event_key")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data || [] })
  }
  const { data, error } = await auth.supabase.from("email_delivery_logs").select("*").order("created_at", { ascending: false }).limit(250)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const logs = data || []
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim()
  if (resendApiKey) {
    await Promise.allSettled(logs.filter((log) => log.provider_message_id).map(async (log) => {
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(log.provider_message_id)}`, { headers: { Authorization: `Bearer ${resendApiKey}` }, cache: "no-store" })
      if (!response.ok) return
      const provider = await response.json() as { last_event?: string }
      const failed = ["failed", "bounced", "complained"].includes(String(provider.last_event || "").toLowerCase())
      const nextStatus = failed ? "failed" : log.status
      const nextError = failed && !log.error_message ? `Provider event: ${provider.last_event}` : log.error_message
      if (nextStatus !== log.status || nextError !== log.error_message) {
        await auth.supabase.from("email_delivery_logs").update({ status: nextStatus, error_message: nextError }).eq("id", log.id)
        log.status = nextStatus
        log.error_message = nextError
      }
    }))
  }
  return NextResponse.json({ logs })
}

export async function DELETE() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { error } = await auth.supabase.from("email_delivery_logs").delete().not("id", "is", null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await request.json()
  if (body.ccSettings && typeof body.ccSettings === "object") {
    const { data: current } = await auth.supabase.from("system_settings").select("settings").eq("id", 1).maybeSingle()
    const nextSettings = { ...(current?.settings || {}), emailCcByModule: body.ccSettings }
    const { error } = await auth.supabase.from("system_settings").upsert({ id: 1, settings: nextSettings, updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, ccSettings: body.ccSettings })
  }
  const { id, subject, html_body, text_body, accent_color, is_active } = body
  if (!id || !subject || !html_body) return NextResponse.json({ error: "Template id, subject, and HTML are required" }, { status: 400 })
  const { data, error } = await auth.supabase.from("email_templates").update({ subject, html_body, text_body: text_body || "", accent_color: accent_color || "#0f766e", is_active: is_active !== false, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await request.json()
  if (body.retryLogId) {
    const { data: failedLog, error: logError } = await auth.supabase.from("email_delivery_logs").select("id, recipient, subject, module").eq("id", String(body.retryLogId)).maybeSingle()
    if (logError || !failedLog) return NextResponse.json({ error: "Failed alert record could not be found." }, { status: 404 })
    const retrySubject = String(failedLog.subject || "Email alert retry")
    const safeSubject = retrySubject.replace(/[&<>]/g, (character: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] || character)
    const retryText = `This is a retry of the email alert: ${retrySubject}. Please review the original notification details in the QCC portal.`
    const retryHtml = `<p>This is a retry of the email alert <strong>${safeSubject}</strong>.</p><p>Please review the notification details in the QCC portal.</p>`
    const result = await emailService.sendEmail(String(failedLog.recipient), { subject: retrySubject, html: retryHtml, text: retryText }, { emailEvent: "alert_retry", emailModule: String(failedLog.module || "admin"), idempotencyKey: `retry/${failedLog.id}/${Date.now()}` })
    return NextResponse.json({ success: result.success, error: result.error || null })
  }
  let recipients = Array.isArray(body.recipients) ? [...new Set(body.recipients.map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))] : []
  const requestedAudiences = Array.isArray(body.audienceRoles) ? body.audienceRoles.map((value: unknown) => String(value)) : []
  const isAllStaff = body.broadcastAll === true || requestedAudiences.includes("all")
  if (isAllStaff || requestedAudiences.length) {
    const selectedRoles = isAllStaff ? null : [...new Set(requestedAudiences.flatMap((audience: string) => AUDIENCE_ROLES[audience] || []))]
    if (!isAllStaff && !selectedRoles.length) return NextResponse.json({ error: "Choose at least one supported staff category." }, { status: 400 })
    let staffQuery = auth.supabase.from("user_profiles").select("email").eq("is_active", true).not("email", "is", null)
    if (selectedRoles) staffQuery = staffQuery.in("role", selectedRoles)
    const { data: staff, error: staffError } = await staffQuery
    if (staffError) return NextResponse.json({ error: "Unable to load selected staff recipients", details: staffError.message }, { status: 500 })
    recipients = [...new Set((staff || []).map((profile: { email?: string | null }) => String(profile.email || "").trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
  }
  const cc = [...new Set((Array.isArray(body.cc) ? body.cc : []).map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
  const subject = String(body.subject || "").trim()
  const html = String(body.html || "").trim()
  if (!recipients.length || !subject || !html) return NextResponse.json({ error: (body.broadcastAll || requestedAudiences.length) ? "No active staff members in the selected category have a valid registered email address." : "Add at least one valid recipient, a subject, and a message before sending." }, { status: 400 })
  const text = String(body.text || html.replace(/<[^>]+>/g, " "))
  const broadcastStartedAt = Date.now()
  const results = new Array(recipients.length)
  let nextRecipientIndex = 0

  async function sendNextRecipient() {
    while (nextRecipientIndex < recipients.length) {
      const index = nextRecipientIndex++
      const recipient = recipients[index]
      let result = await emailService.sendEmail(recipient, { subject, html, text, cc }, { emailModule: "broadcast", emailEvent: "broadcast", sentBy: auth.user.id, idempotencyKey: `admin-broadcast/${auth.user.id}/${broadcastStartedAt}/${recipient}` })
      let retryIndex = 0
      while (!result.success && /too many requests|rate limit/i.test(String(result.error || "")) && retryIndex < RATE_LIMIT_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAYS_MS[retryIndex]))
        retryIndex += 1
        result = await emailService.sendEmail(recipient, { subject, html, text, cc }, { emailModule: "broadcast", emailEvent: "broadcast", sentBy: auth.user.id, idempotencyKey: `admin-broadcast/${auth.user.id}/${broadcastStartedAt}/${recipient}` })
      }
      results[index] = result
      await new Promise((resolve) => setTimeout(resolve, WORKER_INTERVAL_MS))
    }
  }

  await Promise.all(Array.from({ length: Math.min(BROADCAST_CONCURRENCY, recipients.length) }, () => sendNextRecipient()))
  const sentCount = results.filter((result) => result.success).length
  const failedCount = results.length - sentCount
  return NextResponse.json({ success: failedCount === 0, sentCount, failedCount, results })
}
