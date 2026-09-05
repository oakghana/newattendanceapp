import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { calculateDistance, getBrowserTolerance } from "@/lib/geolocation"
import { shouldSkipSystemAutoCheckout } from "@/lib/attendance-utils"

export async function POST(request: Request) {
  try {
    console.log("[v0] QR check-in API called")

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log("[v0] No authenticated user")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    console.log("[v0] QR check-in request body:", body)

    const { location_id, qr_timestamp, device_info, userLatitude, userLongitude } = body

    if (!location_id) {
      return NextResponse.json({ error: "Location ID is required" }, { status: 400 })
    }

    const { data: location, error: locationError } = await supabase
      .from("geofence_locations")
      .select("*")
      .eq("id", location_id)
      .eq("is_active", true)
      .maybeSingle()

    if (locationError || !location) {
      console.log("[v0] Location not found or inactive:", locationError)
      return NextResponse.json({ error: "Invalid or inactive location" }, { status: 400 })
    }

    let distance = 0
    let proximityVerified = false
    let gpsAvailable = false

    const browserTolerance = await getBrowserTolerance()

    if (userLatitude !== undefined && userLongitude !== undefined) {
      gpsAvailable = true
      distance = calculateDistance(userLatitude, userLongitude, location.latitude, location.longitude)

      console.log("[v0] QR scan with GPS - distance from location:", distance, "meters")
      console.log("[v0] Browser tolerance:", browserTolerance, "meters")

      const QR_PROXIMITY_LIMIT = browserTolerance

      if (distance > QR_PROXIMITY_LIMIT) {
        console.log("[v0] User too far from location for QR check-in:", distance, "meters")
        return NextResponse.json(
          {
            error: "Too far from location",
            message: `You must be within 50 meters of your assigned location to check in. Please use manual location code entry.`,
            distance: Math.round(distance),
            locationName: location.name,
          },
          { status: 403 },
        )
      }

      proximityVerified = true
      console.log("[v0] GPS proximity verified - within", browserTolerance, "m of:", location.name)
    } else {
      console.log("[v0] QR check-in WITHOUT GPS (device GPS unavailable or manual entry)")
      distance = 0
      proximityVerified = false
      gpsAvailable = false
    }

    const now = new Date()
    const today = now.toISOString().split("T")[0]

    const { data: existingAttendance, error: attendanceError } = await supabase
      .from("attendance_records")
      .select("*, user_profiles!inner(departments(code, name))")
      .eq("user_id", user.id)
      .is("check_out_time", null)
      .order("check_in_time", { ascending: false })
      .maybeSingle()

    if (attendanceError) {
      console.error("[v0] Error checking existing attendance:", attendanceError)
    }

    let missedCheckoutWarning = null

    if (existingAttendance && !existingAttendance.check_out_time) {
      const checkInDate = new Date(existingAttendance.check_in_time).toISOString().split("T")[0]

      if (checkInDate !== today && !shouldSkipSystemAutoCheckout(existingAttendance.user_profiles?.departments)) {
        console.log("[v0] Found unclosed attendance from previous day, auto-closing...")

        const previousDayEnd = new Date(`${checkInDate}T23:59:59Z`)
        const checkInTime = new Date(existingAttendance.check_in_time)
        const workHours = (previousDayEnd.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

        await supabase
          .from("attendance_records")
          .update({
            check_out_time: previousDayEnd.toISOString(),
            work_hours: workHours,
            auto_checkout: true,
            notes: "Auto checked out at 11:59 PM (missed checkout)",
          })
          .eq("id", existingAttendance.id)

        missedCheckoutWarning = {
          message:
            "You did not check out yesterday. Your previous day's attendance has been automatically closed at 11:59 PM.",
          previousDate: checkInDate,
          autoCheckoutTime: previousDayEnd.toISOString(),
        }

        console.log("[v0] Previous day auto-closed successfully")
      } else if (checkInDate !== today) {
        return NextResponse.json(
          { error: "Your overnight attendance session is still open. Please check out before starting a new check-in." },
          { status: 400 },
        )
      } else {
        return NextResponse.json({ error: "Already checked in today" }, { status: 400 })
      }
    } else if (existingAttendance && existingAttendance.check_out_time) {
      return NextResponse.json({ error: "Already completed attendance for today" }, { status: 400 })
    }

    const { data: attendance, error: insertError } = await supabase
      .from("attendance_records")
      .insert({
        user_id: user.id,
        check_in_location_id: location.id,
        check_in_location_name: location.name,
        check_in_time: now.toISOString(),
        check_in_method: "qr_code",
        check_in_latitude: userLatitude || location.latitude,
        check_in_longitude: userLongitude || location.longitude,
        status: "present",
        notes: gpsAvailable
          ? `QR code scanned - ${Math.round(distance)}m from location (GPS verified within ${browserTolerance}m tolerance)`
          : `QR code scanned - GPS unavailable, location verified by QR code only (manual entry or GPS disabled)`,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Failed to create attendance record:", insertError)
      return NextResponse.json({ error: "Failed to record attendance", details: insertError.message }, { status: 500 })
    }

    console.log("[v0] Attendance record created via QR code (within tolerance):", attendance.id)

    if (device_info) {
      await supabase.from("device_sessions").insert({
        user_id: user.id,
        attendance_record_id: attendance.id,
        device_info: device_info,
        session_start: now.toISOString(),
      })
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "qr_check_in",
      table_name: "attendance_records",
      record_id: attendance.id,
      new_values: {
        location: location.name,
        check_in_method: "qr_code",
        timestamp: now.toISOString(),
        distance_meters: Math.round(distance),
      },
    })

    console.log("[v0] QR check-in completed successfully:", gpsAvailable ? "GPS verified" : "No GPS verification")

    return NextResponse.json({
      success: true,
      message: `Successfully checked in at ${location.name} using QR code${gpsAvailable ? " (GPS verified)" : " (manual entry)"}`,
      data: {
        attendance,
        location_tracking: {
          location_name: location.name,
          check_in_method: "qr_code",
          distance_meters: Math.round(distance),
          proximity_verified: proximityVerified,
          gps_available: gpsAvailable,
        },
      },
      missedCheckoutWarning,
    })
  } catch (error) {
    console.error("[v0] QR check-in error:", error)

    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during check-in"

    return NextResponse.json(
      {
        error: "Internal server error",
        message: errorMessage,
        details: "Please try again or contact support if the problem persists",
      },
      { status: 500 },
    )
  }
}
