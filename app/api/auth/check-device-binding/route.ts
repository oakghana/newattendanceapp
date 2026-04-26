import { createAdminClient, createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { parseRuntimeFlags } from "@/lib/runtime-flags"

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
    const { device_id, device_info } = body
    const adminClient = await createAdminClient()

    if (!device_id) {
      return NextResponse.json({ error: "Device ID is required" }, { status: 400 })
    }

    // Only Admin/Administrator bypasses device binding checks
    const { data: userProfile } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    const normalizedRole = userProfile?.role?.trim().toLowerCase().replace(/_/g, "-")
    if (["admin", "administrator"].includes(normalizedRole || "")) {
      return NextResponse.json({ allowed: true, violation: false })
    }

    // Check if device-sharing enforcement is currently enabled by admin
    // Must use adminClient to bypass RLS — regular users cannot read system_settings
    const { data: systemSettings } = await adminClient
      .from("system_settings")
      .select("settings")
      .maybeSingle()
    const { deviceSharingEnforcementEnabled } = parseRuntimeFlags(systemSettings?.settings)

    const getValidIpAddress = () => {
      const forwardedFor = request.headers.get("x-forwarded-for")
      const forwardedCandidates = forwardedFor
        ? forwardedFor
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []

      const possibleIps = [
        request.headers.get("x-vercel-forwarded-for"),
        request.headers.get("cf-connecting-ip"),
        request.headers.get("x-real-ip"),
        request.headers.get("x-client-ip"),
        request.ip,
        ...forwardedCandidates,
      ]

      for (const rawIp of possibleIps) {
        if (!rawIp || rawIp === "unknown") continue

        const normalizedIp = rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp
        if (normalizedIp === "::1" || normalizedIp === "127.0.0.1") continue

        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalizedIp) || /^[0-9a-fA-F:]+$/.test(normalizedIp)) {
          return normalizedIp
        }
      }

      return null
    }

    const ipAddress = getValidIpAddress()

    try {
      const { data: existingBindings, error: bindingError } = await adminClient
        .from("device_user_bindings")
        .select("user_id, user_profiles!inner(first_name, last_name, email, department_id)")
        .eq("device_id", device_id)
        .eq("is_active", true)
        .limit(20)

      if (bindingError) {
        // If enforcement is disabled, allow login even when table errors occur
        if (!deviceSharingEnforcementEnabled) {
          console.warn("[v0] Device binding check skipped (enforcement disabled):", bindingError.message)
          return NextResponse.json({ allowed: true, violation: false })
        }
        if (
          bindingError.code === "PGRST205" ||
          bindingError.code === "42P01" ||
          bindingError.message?.includes("Could not find the table") ||
          bindingError.message?.includes("does not exist")
        ) {
          console.error("[v0] Device binding security tables are missing; blocking login until setup is completed")
          return NextResponse.json({
            allowed: false,
            violation: true,
            requiresSetup: true,
            setupRequiredTables: ["device_user_bindings", "device_security_violations"],
            message:
              "Device security setup is incomplete. Login is temporarily blocked until required security tables are created.",
          })
        }
        if (
          bindingError.code === "42501" ||
          bindingError.message?.toLowerCase().includes("permission denied")
        ) {
          console.error("[v0] Device binding security policies are misconfigured; blocking login", bindingError)
          return NextResponse.json({
            allowed: false,
            violation: true,
            requiresSetup: true,
            setupRequiredTables: ["device_user_bindings", "device_security_violations"],
            message:
              "Device security permissions are not configured correctly. Login is blocked until access policies are fixed.",
          })
        }
        console.error("[v0] Error checking device binding:", bindingError)
        return NextResponse.json({
          allowed: false,
          violation: true,
          message: "Device verification failed. Please contact IT support.",
        })
      }

      const bindings = Array.isArray(existingBindings) ? existingBindings : []
      const conflictingBinding = bindings.find((binding: any) => binding.user_id !== user.id)
      const currentUserBinding = bindings.find((binding: any) => binding.user_id === user.id)

      if (conflictingBinding) {
        console.log("[v0] Device binding violation detected:", {
          device_id,
          attempted_user: user.id,
          bound_user: conflictingBinding.user_id,
        })

        // Always log the violation regardless of enforcement state
        try {
          await adminClient.from("device_security_violations").insert({
            device_id,
            ip_address: ipAddress,
            attempted_user_id: user.id,
            bound_user_id: conflictingBinding.user_id,
            violation_type: "login_attempt",
            device_info: device_info || null,
          })

          const { data: currentUserProfile } = await adminClient
            .from("user_profiles")
            .select("first_name, last_name, email, department_id")
            .eq("id", user.id)
            .single()

          if (currentUserProfile?.department_id) {
            const { data: deptHead } = await adminClient
              .from("user_profiles")
              .select("id")
              .eq("department_id", currentUserProfile.department_id)
              .eq("role", "department_head")
              .eq("is_active", true)
              .maybeSingle()

            if (deptHead) {
              await adminClient.from("staff_notifications").insert({
                recipient_id: deptHead.id,
                sender_id: user.id,
                sender_role: "system",
                sender_label: "Security Alert",
                notification_type: "security_violation",
                message: `Security Alert: ${currentUserProfile.first_name} ${currentUserProfile.last_name} (${currentUserProfile.email}) attempted to login using a device fingerprint already registered to ${conflictingBinding.user_profiles?.first_name || "Unknown"} ${conflictingBinding.user_profiles?.last_name || ""}. This may indicate device sharing or unauthorized access. Please investigate.`,
                is_read: false,
              })
            }
          }
        } catch (notificationError) {
          console.error("[v0] Failed to log violation or send notification:", notificationError)
        }

        // If enforcement is disabled by admin, allow login with a warning only
        if (!deviceSharingEnforcementEnabled) {
          return NextResponse.json({
            allowed: true,
            violation: false,
            warning: true,
            message: `Note: This device is shared with another staff member. Device-sharing enforcement is currently disabled by the administrator.`,
          })
        }

        // Enforcement is on - block the login
        return NextResponse.json({
          allowed: false,
          violation: true,
          message: `This device fingerprint is already registered to another staff member. Each device should only be used by one person. Please contact your supervisor or IT department.`,
          bound_to_email: conflictingBinding.user_profiles?.email || null,
        })
      }

      // Detect concurrent active device sessions for this user (other devices)
      let concurrentSessions: any[] = []
      try {
        const { data: otherSessions, error: sessionsError } = await supabase
          .from("device_sessions")
          .select("id, device_name, device_type, device_id, ip_address, last_activity")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .neq("device_id", device_id)
          .limit(10)

        if (!sessionsError && Array.isArray(otherSessions) && otherSessions.length > 0) {
          concurrentSessions = otherSessions
        }
      } catch (sessionErr) {
        console.log("[v0] Could not check concurrent device sessions:", sessionErr)
      }

      if (!currentUserBinding) {
        try {
          await adminClient.from("device_user_bindings").insert({
            device_id,
            ip_address: ipAddress,
            user_id: user.id,
            device_info: device_info || null,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          })
        } catch (insertError) {
          console.log("[v0] Could not create device binding, table may not exist:", insertError)
        }
      } else {
        try {
          await adminClient
            .from("device_user_bindings")
            .update({
              ip_address: ipAddress,
              last_seen_at: new Date().toISOString(),
              device_info: device_info || null,
            })
            .eq("device_id", device_id)
            .eq("user_id", user.id)
        } catch (updateError) {
          console.log("[v0] Could not update device binding:", updateError)
        }
      }

      return NextResponse.json({
        allowed: true,
        violation: false,
        concurrent: concurrentSessions.length > 0,
        sessions: concurrentSessions,
        message: "Device verified successfully",
      })
    } catch (dbError: any) {
      console.log("[v0] Database error during device binding check:", dbError?.message)
      if (!deviceSharingEnforcementEnabled) {
        return NextResponse.json({ allowed: true, violation: false })
      }
      return NextResponse.json({
        allowed: false,
        violation: true,
        message: "Device verification unavailable. Login blocked for security.",
      })
    }
  } catch (error) {
    console.error("[v0] Device binding check error:", error)
    return NextResponse.json({
      allowed: false,
      violation: true,
      message: "Device verification error. Login blocked for security.",
    })
  }
}
