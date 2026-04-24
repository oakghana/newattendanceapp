import { EmailService, emailService } from "@/lib/email-service"
import { buildForcedPasswordChangeMetadata, generateTemporaryPassword, isEndOfQuarter } from "@/lib/security"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

async function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  const { supabase, user } = await createClientAndGetUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  return ["admin", "it-admin", "god"].includes(profile?.role || "")
}

async function runMonthlyPasswordReset(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const runtimeClient = await createAdminClient()
  const { data: runtimeSettings } = await runtimeClient.from("system_settings").select("settings").maybeSingle()
  const passwordEnforcementEnabled = Boolean(runtimeSettings?.settings?.password_enforcement_enabled)

  if (!passwordEnforcementEnabled) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Quarterly password rotation is currently disabled by runtime controls.",
    })
  }

  const forceRun = request.nextUrl.searchParams.get("force") === "true"
  const now = new Date()

  if (!forceRun && !isEndOfQuarter(now)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Today is not the end of the quarter, so no password rotation was performed.",
    })
  }

  let adminClient

  try {
    adminClient = await createAdminClient()
  } catch (error) {
    console.error("[v0] Quarterly password reset - missing admin configuration:", error)
    return NextResponse.json(
      {
        error: "Quarterly password rotation requires SUPABASE_SERVICE_ROLE_KEY on the server.",
      },
      { status: 500 },
    )
  }

  const emailAvailable = await emailService.isAvailable()

  if (!emailAvailable) {
    return NextResponse.json(
      {
        error: "Quarterly password rotation aborted because the email service is not configured. This prevents rotating passwords without delivering the temporary credentials.",
      },
      { status: 500 },
    )
  }

  const { data: users, error } = await adminClient
    .from("user_profiles")
    .select("id, email, first_name, last_name, is_active")
    .eq("is_active", true)

  if (error) {
    console.error("[v0] Quarterly password reset - failed to fetch users:", error)
    return NextResponse.json({ error: "Failed to fetch active users" }, { status: 500 })
  }

  let processed = 0
  let emailed = 0
  const failures: Array<{ email: string; error: string }> = []

  for (const user of users || []) {
    if (!user?.id || !user?.email) continue

    const tempPassword = generateTemporaryPassword()
    const issuedAt = new Date().toISOString()

    const { data: authUserResult, error: authUserError } = await adminClient.auth.admin.getUserById(user.id)

    if (authUserError) {
      failures.push({ email: user.email, error: authUserError.message })
      continue
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      password: tempPassword,
      user_metadata: buildForcedPasswordChangeMetadata(authUserResult.user.user_metadata, issuedAt),
    })

    if (updateError) {
      failures.push({ email: user.email, error: updateError.message })
      continue
    }

    try {
      await adminClient.from("user_profiles").update({ password_changed_at: null }).eq("id", user.id)
    } catch (profileError) {
      console.warn("[v0] Quarterly password reset - failed to flag password_changed_at:", profileError)
    }

    processed++

    const emailResult = await emailService.sendEmail(user.email, EmailService.templates.passwordReset, {
      firstName: user.first_name || "Staff",
      tempPassword,
    })

    if (emailResult.success) {
      emailed++
    } else {
      failures.push({
        email: user.email,
        error: typeof emailResult.error === "string" ? emailResult.error : "Email delivery failed",
      })
    }
  }

  return NextResponse.json({
    success: true,
    message: "Quarterly password rotation completed.",
    processed,
    emailed,
    failed: failures.length,
    failures,
  })
}

export async function POST(request: NextRequest) {
  return runMonthlyPasswordReset(request)
}

export async function GET(request: NextRequest) {
  return runMonthlyPasswordReset(request)
}
