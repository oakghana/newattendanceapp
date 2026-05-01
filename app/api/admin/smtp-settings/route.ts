import { emailService } from "@/lib/email-service"
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

type SmtpSettingsShape = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string
  enabled: boolean
}

function boolFromUnknown(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return fallback
}

function numberFromUnknown(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 }) }
  }

  return { supabase, userId: user.id }
}

async function getCurrentSystemSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from("system_settings").select("settings").eq("id", 1).maybeSingle()
  if (error) throw error
  return (data?.settings || {}) as Record<string, unknown>
}

function buildResponseSmtp(rawSettings: Record<string, unknown>) {
  const smtpRaw = (rawSettings.smtp || {}) as Record<string, unknown>
  const envConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)

  return {
    host: String(smtpRaw.host || process.env.SMTP_HOST || "smtp.gmail.com"),
    port: numberFromUnknown(smtpRaw.port ?? process.env.SMTP_PORT, 587),
    secure: boolFromUnknown(smtpRaw.secure ?? process.env.SMTP_SECURE, false),
    user: String(smtpRaw.user || process.env.SMTP_USER || ""),
    fromName: String(smtpRaw.fromName || "QCC Attendance System"),
    enabled: smtpRaw.enabled === undefined ? true : boolFromUnknown(smtpRaw.enabled, true),
    hasPassword: Boolean(String(smtpRaw.pass || "").trim()) || Boolean(process.env.SMTP_PASS),
    source: envConfigured ? "environment" : "database",
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const settings = await getCurrentSystemSettings(auth.supabase)

    return NextResponse.json({
      smtp: buildResponseSmtp(settings),
    })
  } catch (error) {
    console.error("[smtp-settings] Failed to fetch SMTP settings:", error)
    return NextResponse.json({ error: "Failed to fetch SMTP settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = (await request.json()) as Partial<SmtpSettingsShape>

    const host = String(body.host || "").trim()
    const port = numberFromUnknown(body.port, 587)
    const secure = Boolean(body.secure)
    const user = String(body.user || "").trim()
    const pass = String(body.pass || "").trim()
    const fromName = String(body.fromName || "QCC Attendance System").trim() || "QCC Attendance System"
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true

    if (!host) {
      return NextResponse.json({ error: "SMTP host is required" }, { status: 400 })
    }

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: "SMTP port must be between 1 and 65535" }, { status: 400 })
    }

    if (!user || !isValidEmail(user)) {
      return NextResponse.json({ error: "A valid SMTP username email is required" }, { status: 400 })
    }

    const currentSettings = await getCurrentSystemSettings(auth.supabase)
    const currentSmtp = (currentSettings.smtp || {}) as Record<string, unknown>
    const existingPassword = String(currentSmtp.pass || "").trim()

    const finalPassword = pass || existingPassword

    if (enabled && !finalPassword) {
      return NextResponse.json(
        { error: "SMTP password is required before enabling email notifications" },
        { status: 400 },
      )
    }

    const nextSettings = {
      ...currentSettings,
      smtp: {
        host,
        port,
        secure,
        user,
        pass: finalPassword,
        fromName,
        enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.userId,
      },
    }

    const { error: upsertError } = await auth.supabase.from("system_settings").upsert({
      id: 1,
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })

    if (upsertError) {
      throw upsertError
    }

    await emailService.refreshConfiguration()

    await auth.supabase.from("audit_logs").insert({
      user_id: auth.userId,
      action: "update_smtp_settings",
      details: {
        host,
        port,
        secure,
        user,
        enabled,
        fromName,
        password_updated: Boolean(pass),
      },
      ip_address: request.headers.get("x-forwarded-for") || null,
      user_agent: request.headers.get("user-agent") || "unknown",
    })

    return NextResponse.json({
      success: true,
      message: "SMTP settings saved successfully",
    })
  } catch (error) {
    console.error("[smtp-settings] Failed to save SMTP settings:", error)
    return NextResponse.json({ error: "Failed to save SMTP settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = (await request.json()) as { to?: string }
    const raw = String(body.to || "").trim()
    const recipients = raw
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)

    if (!recipients.length) {
      return NextResponse.json({ error: "At least one test recipient email is required" }, { status: 400 })
    }

    const invalid = recipients.filter((email) => !isValidEmail(email))
    if (invalid.length) {
      return NextResponse.json(
        { error: `Invalid email address(es): ${invalid.join(", ")}` },
        { status: 400 },
      )
    }

    await emailService.refreshConfiguration()

    const available = await emailService.isAvailable()
    if (!available) {
      return NextResponse.json(
        { error: "SMTP is not configured yet. Save valid SMTP settings first." },
        { status: 400 },
      )
    }

    const now = new Date().toLocaleString()
    const sendResults = await Promise.all(
      recipients.map((to) =>
        emailService.sendEmail(to, {
          subject: "QCC SMTP Test Email",
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;"><h2 style="color:#2c6216;">SMTP Test Successful</h2><p>This is a test email from QCC Electronic Attendance.</p><p><strong>Timestamp:</strong> ${now}</p><p>If you received this message, your SMTP setup is working.</p></div>`,
          text: `SMTP test successful. Timestamp: ${now}. If you received this message, your SMTP setup is working.`,
        }),
      ),
    )

    const failed = sendResults
      .map((result, index) => ({ result, recipient: recipients[index] }))
      .filter((entry) => !entry.result.success)

    if (failed.length) {
      return NextResponse.json(
        {
          error: `Failed to send to: ${failed.map((item) => item.recipient).join(", ")}`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${recipients.length} recipient(s)`,
    })
  } catch (error) {
    console.error("[smtp-settings] Failed to send test email:", error)
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 })
  }
}
