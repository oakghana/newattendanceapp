import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { EmailService, emailService } from "@/lib/email-service"
import { buildForcedPasswordChangeMetadata } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Create regular client for user verification
    const { createClient: createRegularClient } = await import("@/lib/supabase/server")
    const supabase = await createRegularClient()

    const { userId, newPassword } = await request.json()

    console.log("[v0] Admin password reset: Received request", { userId })

    if (!userId || !newPassword) {
      return NextResponse.json({ error: "User ID and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 })
    }

    // Verify admin access using regular client
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[v0] Admin password reset: Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, first_name, last_name, is_active")
      .eq("id", user.id)
      .single()

    console.log("[v0] Admin password reset: Profile check:", { profile, profileError })

    if (profileError) {
      console.error("[v0] Admin password reset: Profile error:", profileError)
      return NextResponse.json({ error: "Failed to verify admin status" }, { status: 500 })
    }

    if (!profile) {
      console.error("[v0] Admin password reset: No profile found")
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    if (profile.role !== "admin" && profile.role !== "it-admin") {
      console.error("[v0] Admin password reset: Insufficient permissions:", profile.role)
      return NextResponse.json(
        {
          error: "Admin or IT-Admin access required",
          currentRole: profile.role,
        },
        { status: 403 },
      )
    }

    if (!profile.is_active) {
      console.error("[v0] Admin password reset: Admin account inactive")
      return NextResponse.json({ error: "Admin account is inactive" }, { status: 403 })
    }

    console.log("[v0] Admin password reset: Admin verified:", `${profile.first_name} ${profile.last_name}`)

    const { data: targetUser, error: userError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, email, role")
      .eq("id", userId)
      .single()

    if (userError || !targetUser) {
      console.error("[v0] Admin password reset: User not found:", userError)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (profile.role === "it-admin" && (targetUser.role === "admin" || targetUser.role === "it-admin")) {
      console.error("[v0] Admin password reset: IT-Admin tried to reset admin/it-admin password")
      return NextResponse.json(
        {
          error: "IT-Admin users cannot reset passwords for Admin or IT-Admin accounts",
          targetRole: targetUser.role,
        },
        { status: 403 },
      )
    }

    console.log("[v0] Admin password reset: Found target user:", targetUser.email)

    if (!supabaseServiceKey || !supabaseUrl) {
      console.error("[v0] Admin password reset: Missing Supabase admin configuration")
      return NextResponse.json(
        {
          error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin password resets.",
        },
        { status: 500 },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const issuedAt = new Date().toISOString()
    const { data: authUserResult, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(targetUser.id)

    if (authUserError) {
      console.error("[v0] Admin password reset: Failed to load auth user metadata:", authUserError)
      return NextResponse.json({ error: "Failed to prepare password reset" }, { status: 500 })
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      password: newPassword,
      user_metadata: buildForcedPasswordChangeMetadata(authUserResult.user.user_metadata, issuedAt),
    })

    if (updateError) {
      console.error("[v0] Admin password reset: Update error:", updateError)
      return NextResponse.json(
        {
          error: `Failed to update password: ${updateError.message}`,
        },
        { status: 500 },
      )
    }

    console.log("[v0] Admin password reset: Password updated successfully for:", targetUser.email)

    try {
      await supabase.from("user_profiles").update({ password_changed_at: null }).eq("id", targetUser.id)
    } catch (err) {
      console.warn("[v0] Failed to flag password for forced change:", err)
    }

    let deliveryNote = "The user must change this temporary password at next login."
    const emailResult = await emailService.sendEmail(targetUser.email, EmailService.templates.passwordReset, {
      firstName: targetUser.first_name || "Staff",
      tempPassword: newPassword,
    })

    if (emailResult.success) {
      deliveryNote = "The temporary password has been sent to the user's email and must be changed at next login."
    } else {
      console.warn("[v0] Temporary password email was not delivered:", emailResult.error)
      deliveryNote =
        "The password was reset successfully, but the server email service is not configured. Share the temporary password securely with the user; they will be forced to change it at next login."
    }

    // Log the password reset action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_password_reset",
      table_name: "auth.users",
      record_id: userId,
      old_values: {},
      new_values: {
        target_user_email: targetUser.email,
        target_user_name: `${targetUser.first_name} ${targetUser.last_name}`,
      },
      ip_address: request.headers.get("x-forwarded-for") || null,
      user_agent: request.headers.get("user-agent") || "unknown",
    })

    return NextResponse.json({
      success: true,
      message: `Password updated successfully for ${targetUser.first_name} ${targetUser.last_name} (${targetUser.email}). ${deliveryNote}`,
    })
  } catch (error) {
    console.error("[v0] Admin password reset: Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
