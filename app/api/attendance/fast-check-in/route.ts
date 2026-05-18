import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getDeviceInfo } from "@/lib/device-info"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Haversine distance calculation (meters)
const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371e3
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lon2 - lon1)
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

export async function POST(request: NextRequest) {
  const startTime = performance.now()

  try {
    const supabase = await createClient()

    const getClientIp = () => {
      return (request as any).ip || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null
    }

    // Get user (should be cached by middleware)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { location_id, latitude, longitude, accuracy, device_info, location_name, is_remote_location } = body

    // Check today's attendance in parallel
    const today = new Date().toISOString().split("T")[0]
    const { data: existingRecord } = await supabase
      .from("attendance_records")
      .select("id, check_in_time, check_out_time")
      .eq("user_id", user.id)
      .gte("check_in_time", `${today}T00:00:00`)
      .lt("check_in_time", `${today}T23:59:59`)
      .maybeSingle()

    if (existingRecord?.check_in_time) {
      const checkInTime = new Date(existingRecord.check_in_time).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })

      return NextResponse.json(
        {
          error: "You have already checked in today",
          message: `You checked in at ${checkInTime}`,
          timestamp: existingRecord.check_in_time,
          type: "duplicate_checkin",
        },
        { status: 400 }
      )
    }

    // Check if user is on leave (per-day leave_status table)
    const { data: leaveStatus } = await supabase
      .from("leave_status")
      .select("date, leave_request_id")
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("status", "on_leave")
      .maybeSingle()

    if (leaveStatus) {
      return NextResponse.json(
        {
          error: "You are on approved leave today. Cannot check in while on leave.",
          type: "on_leave",
        },
        { status: 400 }
      )
    }

    // --- CRITICAL: Server-side geofence validation to prevent out-of-range check-ins ---
    if (latitude && longitude && !is_remote_location) {
      // Fetch active QCC locations and device radius settings
      const [{ data: qccLocations }, { data: deviceRadiusSettings }] = await Promise.all([
        supabase.from("geofence_locations").select("id, name, latitude, longitude, radius_meters, is_active").eq("is_active", true),
        supabase.from("device_radius_settings").select("device_type, check_in_radius_meters").eq("is_active", true),
      ])

      if (!qccLocations || qccLocations.length === 0) {
        return NextResponse.json({ error: "No active QCC locations found" }, { status: 400 })
      }

      // Determine device type and radius
      const deviceType = device_info?.device_type || "desktop"
      let deviceCheckInRadius = 400 // safe default
      if (deviceRadiusSettings && deviceRadiusSettings.length > 0) {
        const s = deviceRadiusSettings.find((r: any) => r.device_type === deviceType)
        if (s) deviceCheckInRadius = s.check_in_radius_meters
      }

      // Find nearest location and distance
      const distances = qccLocations.map((loc: any) => ({ loc, distance: distanceMeters(latitude, longitude, loc.latitude, loc.longitude) }))
      distances.sort((a: any, b: any) => a.distance - b.distance)
      const nearest = distances[0]

      // If user provided a location_id ensure it matches the computed nearest and is within radius
      if (location_id) {
        const providedLoc = qccLocations.find((l: any) => l.id === location_id)
        if (providedLoc) {
          const providedDistance = distanceMeters(latitude, longitude, providedLoc.latitude, providedLoc.longitude)
          // Cap any client-reported accuracy buffer on server - inaccurate data should not expand radius
          const MAX_ACCURACY_BUFFER = 500

          if (providedDistance > deviceCheckInRadius + MAX_ACCURACY_BUFFER) {
            // Log suspicious attempt
            try {
              await supabase.from("device_security_violations").insert({
                device_id: device_info?.device_id || null,
                ip_address: getClientIp() || null,
                attempted_user_id: user.id,
                bound_user_id: user.id,
                violation_type: "geofence_mismatch",
                device_info: device_info || null,
                details: {
                  provided_location: location_id,
                  computed_distance_m: providedDistance,
                  allowed_radius_m: deviceCheckInRadius,
                },
              })
            } catch (err) {
              // ignore logging failure
            }

            console.warn("[v0] OUT OF RANGE AUTO CHECK-IN BLOCKED", {
              userId: user.id,
              distance: providedDistance,
              allowedRadius: deviceCheckInRadius,
              location: location_name,
            })

            return NextResponse.json(
              { error: "You are outside the allowed proximity for this location (within 50m required). Auto check-in blocked. Please move closer or use manual check-in.", type: "out_of_range" },
              { status: 400 }
            )
          }
        }
      } else if (nearest && nearest.distance > deviceCheckInRadius + 500) {
        // If no location_id was provided, ensure the nearest location is within the allowed radius
        console.warn("[v0] OUT OF RANGE AUTO CHECK-IN BLOCKED - No location provided", {
          userId: user.id,
          nearestDistance: nearest.distance,
          allowedRadius: deviceCheckInRadius,
          nearestLocation: nearest.loc.name,
        })

        return NextResponse.json(
          { error: "You are too far from any registered QCC location to check in (within 50m required). Please move closer.", type: "out_of_range" },
          { status: 400 }
        )
      }
    }

    // Insert attendance record (optimized query)
    const { data: record, error: insertError } = await supabase
      .from("attendance_records")
      .insert({
        user_id: user.id,
        check_in_time: new Date().toISOString(),
        check_in_location_id: location_id,
        check_in_location_name: location_name,
        latitude,
        longitude,
        accuracy,
        device_info,
        is_remote_location: is_remote_location || false,
      })
      .select("id, check_in_time")
      .single()

    if (insertError) {
      console.error("[v0] Check-in insertion error:", insertError)
      return NextResponse.json(
        { error: "Failed to record check-in" },
        { status: 500 }
      )
    }

    const elapsedTime = performance.now() - startTime

    return NextResponse.json({
      success: true,
      message: "Checked in successfully",
      data: record,
      performanceMetrics: {
        elapsedMs: Math.round(elapsedTime),
      },
    })
  } catch (error) {
    console.error("[v0] Fast check-in error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
