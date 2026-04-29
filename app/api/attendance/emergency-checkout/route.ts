import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { validateCheckoutLocation, type LocationData } from "@/lib/geolocation"
import { sendEmergencyCheckoutNotification } from "@/lib/email-service"

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
    const { latitude, longitude, location_id, emergency_reason } = body

    // Validate emergency reason is provided
    if (!emergency_reason || emergency_reason.trim().length === 0) {
      return NextResponse.json({
        error: "Emergency reason is required"
      }, { status: 400 })
    }

    if (!latitude || !longitude) {
      return NextResponse.json({ error: "Location coordinates are required for emergency check-out" }, { status: 400 })
    }

    const now = new Date()
    const today = new Date().toISOString().split("T")[0]

    // Get today's attendance record
    const { data: attendanceRecord, error: findError } = await supabase
      .from("attendance_records")
      .select(`
        *,
        geofence_locations!check_in_location_id (
          name,
          address
        )
      `)
      .eq("user_id", user.id)
      .gte("check_in_time", `${today}T00:00:00`)
      .lt("check_in_time", `${today}T23:59:59`)
      .maybeSingle()

    if (findError || !attendanceRecord) {
      return NextResponse.json({ error: "No check-in record found for today" }, { status: 400 })
    }

    if (attendanceRecord.check_out_time) {
      return NextResponse.json({
        error: "You have already checked out today. Emergency check-out is only available before regular check-out."
      }, { status: 400 })
    }

    // Check if within 30 minutes of check-in
    const checkInTime = new Date(attendanceRecord.check_in_time)
    const timeSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60) // minutes

    if (timeSinceCheckIn > 30) {
      return NextResponse.json({
        error: `Emergency check-out is only available within 30 minutes of check-in. You checked in ${Math.round(timeSinceCheckIn)} minutes ago.`
      }, { status: 400 })
    }

    // Check if on leave
    const { data: onLeave } = await supabase
      .from("leave_status")
      .select("date, leave_request_id")
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("status", "on_leave")
      .maybeSingle()

    if (onLeave) {
      return NextResponse.json(
        {
          error: "You are currently on approved leave. Emergency check-out is not available during leave periods.",
        },
        { status: 403 },
      )
    }

    // Get user profile for notifications
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("first_name, last_name, employee_id, department_id, departments(name)")
      .eq("id", user.id)
      .single()

    // Get QCC locations for validation
    const { data: qccLocations, error: locationsError } = await supabase
      .from("geofence_locations")
      .select("id, name, address, latitude, longitude, radius_meters, district_id")
      .eq("is_active", true)

    if (locationsError || !qccLocations || qccLocations.length === 0) {
      return NextResponse.json({ error: "No active QCC locations found" }, { status: 400 })
    }

    // Get device radius settings
    const { data: deviceRadiusSettings } = await supabase
      .from("device_radius_settings")
      .select("device_type, check_out_radius_meters")
      .eq("is_active", true)

    const deviceType = request.headers.get("x-device-type") || "desktop"
    let deviceCheckOutRadius = 1000
    if (deviceRadiusSettings && deviceRadiusSettings.length > 0) {
      const deviceRadiusSetting = deviceRadiusSettings.find((s: any) => s.device_type === deviceType)
      if (deviceRadiusSetting) {
        deviceCheckOutRadius = deviceRadiusSetting.check_out_radius_meters
      }
    }

    // Validate location
    const userLocation: LocationData = {
      latitude,
      longitude,
      accuracy: 10,
    }

    const validation = validateCheckoutLocation(userLocation, qccLocations, deviceCheckOutRadius)

    if (!validation.canCheckOut) {
      return NextResponse.json(
        {
          error: `Location validation failed for emergency check-out: ${validation.message}`,
        },
        { status: 400 },
      )
    }

    const checkoutLocationData = validation.nearestLocation

    // Calculate work hours (should be minimal for emergency check-out)
    const workHours = Math.round(timeSinceCheckIn * 100) / 100

    // Perform emergency check-out
    const checkoutData = {
      check_out_time: now.toISOString(),
      check_out_location_id: checkoutLocationData?.id || null,
      work_hours: workHours,
      check_out_latitude: latitude,
      check_out_longitude: longitude,
      is_emergency_checkout: true,
      emergency_reason: emergency_reason.trim(),
      updated_at: now.toISOString(),
      check_out_method: "emergency",
      check_out_location_name: checkoutLocationData?.name || "Unknown Location",
    }

    const { data: updatedRecord, error: updateError } = await supabase
      .from("attendance_records")
      .update(checkoutData)
      .eq("id", attendanceRecord.id)
      .select(`
        *,
        geofence_locations!check_in_location_id (
          name,
          address
        ),
        checkout_location:geofence_locations!check_out_location_id (
          name,
          address
        )
      `)
      .single()

    if (updateError) {
      console.error("[v0] Emergency checkout update error:", updateError)
      return NextResponse.json({ error: `Failed to record emergency check-out: ${updateError.message}` }, { status: 500 })
    }

    // Log emergency check-out in audit logs
    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "emergency_checkout",
        table_name: "attendance_records",
        record_id: attendanceRecord.id,
        old_values: attendanceRecord,
        new_values: updatedRecord,
        ip_address: request.ip || null,
        user_agent: request.headers.get("user-agent"),
      })
    } catch (auditError) {
      console.error("[v0] Emergency checkout audit log error (non-critical):", auditError)
    }

    // Send emergency notification (async, don't block response)
    if (userProfile) {
      try {
        await sendEmergencyCheckoutNotification({
          userName: `${userProfile.first_name} ${userProfile.last_name}`,
          employeeId: userProfile.employee_id,
          department: userProfile.departments?.name || "Unknown",
          checkInTime: checkInTime.toLocaleString(),
          checkOutTime: now.toLocaleString(),
          workHours: workHours.toFixed(2),
          emergencyReason: emergency_reason.trim(),
          location: checkoutLocationData?.name || "Unknown Location",
        })
      } catch (emailError) {
        console.error("[v0] Emergency checkout notification error (non-critical):", emailError)
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedRecord,
      message: `Emergency check-out recorded successfully. Work hours: ${workHours.toFixed(2)} minutes. Notifications have been sent.`,
      emergency: true,
    })
  } catch (error) {
    console.error("[v0] Emergency check-out error:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 },
    )
  }
}