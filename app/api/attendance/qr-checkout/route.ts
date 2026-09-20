import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { isOvernightShiftDept } from "@/lib/attendance-utils"

export async function POST(request: Request) {
  try {
    console.log("[v0] QR check-out API called")

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { location_id, qr_timestamp, device_info } = body

    if (!location_id) {
      return NextResponse.json({ error: "Location ID is required" }, { status: 400 })
    }

    // Check if user is on leave
    const today = new Date().toISOString().split("T")[0]
    const { data: leaveStatus } = await supabase
      .from("leave_status")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "on_leave")
      .gte("end_date", today)
      .lte("start_date", today)
      .maybeSingle()

    if (leaveStatus) {
      return NextResponse.json(
        {
          error: `You are currently on approved leave from ${new Date(leaveStatus.start_date).toLocaleDateString()} to ${new Date(leaveStatus.end_date).toLocaleDateString()}. You cannot check out during this period. Please contact your manager if you believe this is incorrect.`,
          onLeave: true,
        },
        { status: 403 }
      )
    }

    const { data: location } = await supabase
      .from("geofence_locations")
      .select("*")
      .eq("id", location_id)
      .eq("is_active", true)
      .single()

    if (!location) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 })
    }

    const now = new Date()
    const todayDate = now.toISOString().split("T")[0]

    // Find today's attendance record without check-out
    const { data: todayAttendance, error: findError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", user.id)
      .gte("check_in_time", `${todayDate}T00:00:00Z`)
      .lt("check_in_time", `${todayDate}T23:59:59Z`)
      .is("check_out_time", null)
      .maybeSingle()

    let attendance = todayAttendance

    // Security/Transport staff often work overnight shifts that cross midnight.
    // If they checked in yesterday and haven't been auto-closed (they are exempt
    // from the 11:59 PM auto-checkout), let them check out the next day too.
    if (!attendance) {
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("departments(code, name)")
        .eq("id", user.id)
        .maybeSingle()

      if (isOvernightShiftDept(userProfile?.departments)) {
        const { data: openOvernightRecord } = await supabase
          .from("attendance_records")
          .select("*")
          .eq("user_id", user.id)
          .is("check_out_time", null)
          .lt("check_in_time", `${todayDate}T00:00:00Z`)
          .order("check_in_time", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (openOvernightRecord) {
          attendance = openOvernightRecord
        }
      }
    }

    if (findError || !attendance) {
      console.log("[v0] No active check-in found for checkout:", findError?.message)

      // Check if user has already checked out today
      const { data: completedAttendance } = await supabase
        .from("attendance_records")
        .select("check_in_time, check_out_time")
        .eq("user_id", user.id)
        .gte("check_in_time", `${todayDate}T00:00:00Z`)
        .lt("check_in_time", `${todayDate}T23:59:59Z`)
        .not("check_out_time", "is", null)
        .maybeSingle()

      if (completedAttendance) {
        return NextResponse.json(
          {
            error: "Already checked out",
            message: "You have already checked out today. You cannot check out again until you check in tomorrow.",
            reason: "ALREADY_CHECKED_OUT",
            details: {
              check_in_time: completedAttendance.check_in_time,
              check_out_time: completedAttendance.check_out_time,
            },
          },
          { status: 400 },
        )
      }

      // User hasn't checked in yet today
      return NextResponse.json(
        {
          error: "No active check-in found",
          message: "You need to check in first before you can check out. Please check in at your location.",
          reason: "NOT_CHECKED_IN",
        },
        { status: 400 },
      )
    }

    // Calculate work hours
    const checkInTime = new Date(attendance.check_in_time)
    const workHours = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

    // Update attendance with check-out
    const { error: updateError } = await supabase
      .from("attendance_records")
      .update({
        check_out_location_id: location.id,
        check_out_location_name: location.name,
        check_out_time: now.toISOString(),
        check_out_method: device_info?.method || "qr_code",
        work_hours: workHours,
        notes: attendance.notes
          ? `${attendance.notes}\nQR code check-out at ${new Date(qr_timestamp || now).toLocaleString()}`
          : `QR code check-out at ${new Date(qr_timestamp || now).toLocaleString()}`,
      })
      .eq("id", attendance.id)

    if (updateError) {
      console.error("[v0] Failed to update attendance:", updateError)
      return NextResponse.json({ error: "Failed to record check-out" }, { status: 500 })
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "qr_check_out",
      table_name: "attendance_records",
      record_id: attendance.id,
      new_values: {
        location: location.name,
        check_out_method: device_info?.method || "qr_code",
        work_hours: workHours,
        timestamp: now.toISOString(),
      },
    })

    console.log("[v0] QR check-out completed successfully")

    return NextResponse.json({
      success: true,
      message: `Successfully checked out from ${location.name} using QR code`,
      data: {
        work_hours: workHours.toFixed(2),
        check_in_time: attendance.check_in_time,
        check_out_time: now.toISOString(),
      },
    })
  } catch (error) {
    console.error("[v0] QR check-out error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
