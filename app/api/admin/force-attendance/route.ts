import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

const ALLOWED_ROLES = new Set(["admin"])

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: adminProfile } = await supabase
      .from("user_profiles")
      .select("role, first_name, last_name")
      .eq("id", user.id)
      .single()

    if (!adminProfile || !ALLOWED_ROLES.has(adminProfile.role))
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })

    const body = await request.json()
    const { userId, action, note } = body as {
      userId: string
      action: "checkin" | "checkout"
      note?: string
    }

    if (!userId || !action) return NextResponse.json({ error: "userId and action required" }, { status: 400 })

    // Use admin client to bypass RLS for target user operations
    const admin = await createAdminClient()

    // Fetch the target user's profile
    const { data: targetProfile } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, role, department_id")
      .eq("id", userId)
      .single()

    if (!targetProfile) return NextResponse.json({ error: "Target user not found" }, { status: 404 })

    const now = new Date()
    const today = now.toISOString().split("T")[0]
    const adminName = `${adminProfile.first_name || ""} ${adminProfile.last_name || ""}`.trim() || "Admin"
    const forceNote = note || `Admin override by ${adminName}`

    if (action === "checkin") {
      // Check if already checked in today
      const { data: existing } = await admin
        .from("attendance_records")
        .select("id, check_in_time, check_out_time")
        .eq("user_id", userId)
        .gte("check_in_time", `${today}T00:00:00`)
        .lt("check_in_time", `${today}T23:59:59`)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({
          error: existing.check_out_time
            ? "User already has a complete attendance record for today."
            : "User is already checked in today.",
        }, { status: 409 })
      }

      const { data: newRecord, error: insertErr } = await admin
        .from("attendance_records")
        .insert({
          user_id: userId,
          check_in_time: now.toISOString(),
          check_in_method: "admin_override",
          status: "present",
          is_remote_location: false,
          notes: forceNote,
        })
        .select("id")
        .single()

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_force_checkin",
        new_values: {
          target_user_id: userId,
          target_name: `${targetProfile.first_name} ${targetProfile.last_name}`,
          target_employee_id: targetProfile.employee_id,
          attendance_record_id: newRecord?.id,
          check_in_time: now.toISOString(),
          note: forceNote,
        },
      }).catch(() => {})

      return NextResponse.json({
        success: true,
        message: `${targetProfile.first_name} ${targetProfile.last_name} has been checked in at ${now.toLocaleTimeString()}.`,
        recordId: newRecord?.id,
      })
    }

    if (action === "checkout") {
      // Find today's open check-in (no checkout)
      const { data: openRecord } = await admin
        .from("attendance_records")
        .select("id, check_in_time, check_out_time")
        .eq("user_id", userId)
        .gte("check_in_time", `${today}T00:00:00`)
        .lt("check_in_time", `${today}T23:59:59`)
        .is("check_out_time", null)
        .maybeSingle()

      if (!openRecord) {
        // Also check if they're fully checked out already
        const { data: completedRecord } = await admin
          .from("attendance_records")
          .select("id, check_in_time, check_out_time")
          .eq("user_id", userId)
          .gte("check_in_time", `${today}T00:00:00`)
          .lt("check_in_time", `${today}T23:59:59`)
          .not("check_out_time", "is", null)
          .maybeSingle()

        if (completedRecord) {
          return NextResponse.json({ error: "User already checked out today." }, { status: 409 })
        }
        return NextResponse.json({ error: "No open check-in found for this user today." }, { status: 404 })
      }

      const checkInTime = new Date(openRecord.check_in_time)
      const workedMs = now.getTime() - checkInTime.getTime()
      const workedHours = Math.round((workedMs / 3_600_000) * 100) / 100

      const { error: updateErr } = await admin
        .from("attendance_records")
        .update({
          check_out_time: now.toISOString(),
          check_out_method: "admin_override",
          work_hours: workedHours,
          updated_at: now.toISOString(),
          notes: forceNote,
        })
        .eq("id", openRecord.id)

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "admin_force_checkout",
        new_values: {
          target_user_id: userId,
          target_name: `${targetProfile.first_name} ${targetProfile.last_name}`,
          target_employee_id: targetProfile.employee_id,
          attendance_record_id: openRecord.id,
          check_out_time: now.toISOString(),
          work_hours: workedHours,
          note: forceNote,
        },
      }).catch(() => {})

      return NextResponse.json({
        success: true,
        message: `${targetProfile.first_name} ${targetProfile.last_name} has been checked out at ${now.toLocaleTimeString()} (${workedHours}h worked).`,
        workedHours,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    console.error("[force-attendance]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
