import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"

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
  if (view === "templates") {
    const { data, error } = await auth.supabase.from("email_templates").select("*").order("module").order("event_key")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data || [] })
  }
  const { data, error } = await auth.supabase.from("email_delivery_logs").select("*").order("created_at", { ascending: false }).limit(250)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data || [] })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const body = await request.json()
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
  let recipients = Array.isArray(body.recipients) ? [...new Set(body.recipients.map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))] : []
  if (body.broadcastAll === true) {
    const { data: staff, error: staffError } = await auth.supabase.from("user_profiles").select("email").eq("is_active", true).not("email", "is", null)
    if (staffError) return NextResponse.json({ error: "Unable to load active staff recipients", details: staffError.message }, { status: 500 })
    recipients = [...new Set((staff || []).map((profile: { email?: string | null }) => String(profile.email || "").trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))]
  }
  const subject = String(body.subject || "").trim()
  const html = String(body.html || "").trim()
  if (!recipients.length || !subject || !html) return NextResponse.json({ error: body.broadcastAll ? "No active staff members have a valid registered email address." : "Add at least one valid recipient, a subject, and a message before sending." }, { status: 400 })
  const results = await Promise.all(recipients.map((recipient: string) => emailService.sendEmail(recipient, { subject, html, text: String(body.text || html.replace(/<[^>]+>/g, " ")) }, { emailModule: "admin", emailEvent: "broadcast", sentBy: auth.user.id, idempotencyKey: `admin-broadcast/${auth.user.id}/${Date.now()}/${recipient}` })))
  const sentCount = results.filter((result) => result.success).length
  const failedCount = results.length - sentCount
  return NextResponse.json({ success: failedCount === 0, sentCount, failedCount, results })
}
