import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"
import { finishEmailBroadcast, isEmailBroadcastCancelled, startEmailBroadcast } from "@/lib/email-broadcast-control"

export const maxDuration = 120

const BROADCAST_CONCURRENCY = 4
const WORKER_INTERVAL_MS = 1200
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
  return NextResponse.json({ logs })
}

export async function DELETE() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { error } = await auth.supabase
    .from("email_delivery_logs")
    .delete()
    .not("id", "is", null)

  if (error) {
    console.error("[EmailCenter] Failed to delete delivery history:", error)
    return NextResponse.json({ error: "Unable to delete email delivery history." }, { status: 500 })
  }

  const { data: remainingLogs, error: verifyError } = await auth.supabase
    .from("email_delivery_logs")
    .select("id")
    .limit(1)

  if (verifyError || (remainingLogs?.length ?? 0) > 0) {
    console.error("[EmailCenter] Delivery history deletion could not be verified:", verifyError)
    return NextResponse.json({ error: "Email delivery history could not be fully deleted." }, { status: 500 })
  }

  return NextResponse.json({ success: true, deleted: true })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const adminSupabase = auth.supabase
  const adminUser = auth.user!
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
  let recipients: string[] = Array.from(new Set<string>(Array.isArray(body.recipients) ? body.recipients.map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) : []))
  const requestedAudiences = Array.isArray(body.audienceRoles) ? body.audienceRoles.map((value: unknown) => String(value)) : []
  const isAllStaff = body.broadcastAll === true || requestedAudiences.includes("all")
  if (isAllStaff || requestedAudiences.length) {
    const selectedRoles: string[] | null = isAllStaff ? null : Array.from(new Set<string>(requestedAudiences.flatMap((audience: string) => (AUDIENCE_ROLES[audience] || []) as string[])))
    if (!isAllStaff && (!selectedRoles || !selectedRoles.length)) return NextResponse.json({ error: "Choose at least one supported staff category." }, { status: 400 })
    let staffQuery = auth.supabase.from("user_profiles").select("email").eq("is_active", true).not("email", "is", null)
    if (selectedRoles && selectedRoles.length) staffQuery = staffQuery.in("role", selectedRoles)
    const { data: staff, error: staffError } = await staffQuery
    if (staffError) return NextResponse.json({ error: "Unable to load selected staff recipients", details: staffError.message }, { status: 500 })
    recipients = [...new Set((staff || []).map((profile: { email?: string | null }) => String(profile.email || "").trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
  }
  const cc: string[] = Array.from(new Set<string>((Array.isArray(body.cc) ? body.cc : []).map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))))
  const subject = String(body.subject || "").trim()
  const html = String(body.html || "").trim()
  if (!recipients.length || !subject || !html) return NextResponse.json({ error: (body.broadcastAll || requestedAudiences.length) ? "No active staff members in the selected category have a valid registered email address." : "Add at least one valid recipient, a subject, and a message before sending." }, { status: 400 })
  const text = String(body.text || html.replace(/<[^>]+>/g, " "))
  const broadcastId = String(body.broadcastId || `${adminUser.id}-${Date.now()}`)
  await startEmailBroadcast(broadcastId, adminSupabase)
  const broadcastStartedAt = Date.now()
  const results: Array<{ success: boolean; error?: string } | null> = new Array(recipients.length).fill(null)
  let nextRecipientIndex = 0

  async function sendNextRecipient() {
    while (nextRecipientIndex < recipients.length) {
      if (await isEmailBroadcastCancelled(broadcastId, adminSupabase)) return
      const index = nextRecipientIndex++
      const recipient = recipients[index]
      let result = await emailService.sendEmail(recipient, { subject, html, text, cc }, { emailModule: "broadcast", emailEvent: "broadcast", sentBy: adminUser.id, idempotencyKey: `admin-broadcast/${adminUser.id}/${broadcastStartedAt}/${recipient}` })
      let retryIndex = 0
      while (!result.success && /too many requests|rate limit/i.test(String(result.error || "")) && retryIndex < RATE_LIMIT_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAYS_MS[retryIndex]))
        retryIndex += 1
        result = await emailService.sendEmail(recipient, { subject, html, text, cc }, { emailModule: "broadcast", emailEvent: "broadcast", sentBy: adminUser.id, idempotencyKey: `admin-broadcast/${adminUser.id}/${broadcastStartedAt}/${recipient}` })
      }
      results[index] = result
      await new Promise((resolve) => setTimeout(resolve, WORKER_INTERVAL_MS))
    }
  }

  await Promise.all(Array.from({ length: Math.min(BROADCAST_CONCURRENCY, recipients.length) }, () => sendNextRecipient()))
  const cancelled = await isEmailBroadcastCancelled(broadcastId, adminSupabase)
  const completedResults = results.filter((result): result is { success: boolean; error?: string } => result !== null)
  const sentCount = completedResults.filter((result) => result.success).length
  const failedCount = completedResults.length - sentCount
  await finishEmailBroadcast(broadcastId, adminSupabase, completedResults.length, cancelled)
  return NextResponse.json({ success: !cancelled && failedCount === 0, cancelled, sentCount, failedCount, attemptedCount: completedResults.length, totalCount: recipients.length, results: completedResults })
}
