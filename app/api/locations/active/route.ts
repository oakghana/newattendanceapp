import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    // Optional lat/lng query params for distance calculation (client can pass admin's location)
    const url = new URL(request.url)
    const latParam = url.searchParams.get("lat")
    const lngParam = url.searchParams.get("lng")
    let adminLat = latParam ? parseFloat(latParam) : null
    let adminLng = lngParam ? parseFloat(lngParam) : null

    // If requester is authenticated, attempt to use their assigned location coords
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (!authError && user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select(`
            assigned_location:geofence_locations!assigned_location_id (
              latitude,
              longitude
            )
          `)
          .eq("id", user.id)
          .single()

        const assigned = profile?.assigned_location
        if (!adminLat && assigned?.latitude) adminLat = assigned.latitude
        if (!adminLng && assigned?.longitude) adminLng = assigned.longitude
      }
    } catch (e) {
      // ignore auth/profile lookup errors and continue using query params if present
      console.warn("[v0] Unable to determine admin assigned location:", e)
    }

    const { data: locations, error } = await supabase
      .from("geofence_locations")
      .select(`
        id,
        name,
        address,
        latitude,
        longitude,
        radius_meters,
        location_code,
        district_id
      `)
      .eq("is_active", true)
      .order("name")

    if (error) {
      console.error("[v0] Failed to fetch locations:", error)
      return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 })
    }

    // Compute stats per location: today's check-ins/check-outs and currently checked-in count
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startIso = startOfDay.toISOString()
    const nowIso = new Date().toISOString()

    // Haversine distance helper
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371000 // meters
      const dLat = toRad(lat2 - lat1)
      const dLon = toRad(lon2 - lon1)
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return R * c
    }

    const enriched = await Promise.all((locations || []).map(async (loc) => {
      try {
        // Today's check-ins for this location
        const { count: checkInCount, error: inCountErr } = await supabase
          .from("attendance_records")
          .select("id", { count: "exact" })
          .eq("check_in_location_id", loc.id)
          .gte("check_in_time", startIso)
          .lte("check_in_time", nowIso)

        if (inCountErr) {
          console.error("[v0] Error counting check-ins for", loc.id, inCountErr)
        }

        // Latest check-in time
        const { data: lastInData } = await supabase
          .from("attendance_records")
          .select("check_in_time")
          .eq("check_in_location_id", loc.id)
          .order("check_in_time", { ascending: false })
          .limit(1)

        // Today's check-outs
        const { count: checkOutCount, error: outCountErr } = await supabase
          .from("attendance_records")
          .select("id", { count: "exact" })
          .eq("check_out_location_id", loc.id)
          .gte("check_out_time", startIso)
          .lte("check_out_time", nowIso)

        if (outCountErr) {
          console.error("[v0] Error counting check-outs for", loc.id, outCountErr)
        }

        const { data: lastOutData } = await supabase
          .from("attendance_records")
          .select("check_out_time")
          .eq("check_out_location_id", loc.id)
          .order("check_out_time", { ascending: false })
          .limit(1)

        // Currently checked-in (no check_out_time)
        const { count: currentlyCheckedIn, error: currErr } = await supabase
          .from("attendance_records")
          .select("id", { count: "exact" })
          .eq("check_in_location_id", loc.id)
          .is("check_out_time", null)

        if (currErr) {
          console.error("[v0] Error counting currently checked-in for", loc.id, currErr)
        }

        const distanceMeters =
          adminLat !== null && adminLng !== null && loc.latitude && loc.longitude
            ? Math.round(haversine(adminLat, adminLng, loc.latitude, loc.longitude))
            : null

        return {
          ...loc,
          distance_meters: distanceMeters,
          today: {
            check_in_count: checkInCount || 0,
            last_check_in_time: lastInData?.[0]?.check_in_time || null,
            check_out_count: checkOutCount || 0,
            last_check_out_time: lastOutData?.[0]?.check_out_time || null,
            currently_checked_in: currentlyCheckedIn || 0,
          },
        }
      } catch (innerErr) {
        console.error("[v0] Error enriching location", loc.id, innerErr)
        return { ...loc, error: "Failed to compute stats" }
      }
    }))

    return NextResponse.json({ success: true, locations: enriched })
  } catch (error) {
    console.error("[v0] Locations API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
