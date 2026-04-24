import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import {
  rateLimit,
  getClientIdentifier,
  validatePassword,
  createSecurityHeaders,
  clearForcedPasswordChangeMetadata,
} from "@/lib/security"

export async function POST(request: NextRequest) {
  const headers = createSecurityHeaders()

  try {
    const clientId = getClientIdentifier(request)
    const isAllowed = rateLimit(clientId, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 3, // Max 3 password change attempts per 15 minutes
    })

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Too many password change attempts. Please try again later." },
        { status: 429, headers },
      )
    }

    const supabase = await createClient()
    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400, headers })
    }

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required" }, { status: 400, headers })
    }

    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: "Password requirements not met", details: passwordValidation.errors },
        { status: 400, headers },
      )
    }

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    })

    if (verifyError) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400, headers })
    }

    // Update password and clear any force-change flag from temporary or rotated passwords
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: clearForcedPasswordChangeMetadata(user.user_metadata),
    })

    if (updateError) {
      console.error("Password update error:", updateError)
      return NextResponse.json({ error: "Failed to update password" }, { status: 500, headers })
    }

    // update profile timestamp so we can enforce expiry
    try {
      await supabase.from("user_profiles").update({ password_changed_at: new Date().toISOString() }).eq("id", user.id)
    } catch (err) {
      console.warn("[v0] Failed to update password_changed_at:", err)
    }

    // Audit logging should never block a successful password change
    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "password_changed",
        table_name: "auth.users",
        ip_address: request.headers.get("x-forwarded-for") || null,
        user_agent: request.headers.get("user-agent"),
      })
    } catch (auditError) {
      console.warn("[v0] Failed to write password change audit log:", auditError)
    }

    return NextResponse.json(
      {
        success: true,
        message: "Password changed successfully",
      },
      { headers },
    )
  } catch (error) {
    console.error("Change password error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers })
  }
}
