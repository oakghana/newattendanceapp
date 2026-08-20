import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { normalizeAppRole } from "@/lib/role-capabilities"

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    console.log("[v0] Location update request for ID:", id)

    const supabase = await createClient()

    // Get authenticated user and check admin role
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Location update - unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only administrators may edit location definitions and hierarchy.
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
    const role = normalizeAppRole(profile?.role)

    if (!profile || !["admin", "it-admin", "it_admin"].includes(role)) {
      console.log("[v0] Location update - insufficient permissions")
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    console.log("[v0] Location update data:", body)

    const { name, address, latitude, longitude, radius_meters, is_active } = body
    const locationType = ["regional_office", "district_office", "facility"].includes(body.location_type)
      ? body.location_type
      : "facility"

    if (locationType === "district_office" && !body.parent_location_id) {
      return NextResponse.json({ error: "A regional office is required for district offices" }, { status: 400 })
    }

    const newLat = Number(latitude)
    const newLng = Number(longitude)

    if (isNaN(newLat) || isNaN(newLng)) {
      return NextResponse.json({ error: "Invalid coordinates provided" }, { status: 400 })
    }

      const { data: currentLocation, error: fetchError } = await supabase
        .from("geofence_locations")
        .select("id, name, latitude, longitude")
        .eq("id", id)
        .single()

    if (fetchError || !currentLocation) {
      console.error("[v0] Location not found:", fetchError)
      return NextResponse.json({ error: "Location not found" }, { status: 404 })
    }

    const coordsChanged =
      Math.abs(currentLocation.latitude - newLat) > 0.00001 || Math.abs(currentLocation.longitude - newLng) > 0.00001

    let conflicts: any[] = []

    if (coordsChanged) {
      const { data: otherLocations, error: conflictError } = await supabase
        .from("geofence_locations")
        .select("id, name, latitude, longitude")
          .neq("id", id)
        .eq("is_active", true) // Only check active locations

      if (conflictError) {
        console.error("[v0] Error checking for conflicts:", conflictError)
        return NextResponse.json({ error: "Failed to validate coordinates" }, { status: 500 })
      }

      // Check if new coordinates are too close to any other location (within 50 meters)
      conflicts = otherLocations?.filter((loc) => {
        const distance = calculateDistance(newLat, newLng, loc.latitude, loc.longitude)
        return distance < 50 // Too close if within 50 meters
      })

      if (conflicts && conflicts.length > 0) {
        const conflictNames = conflicts.map((c) => c.name).join(", ")
        console.log("[v0] Coordinate conflict warning (non-blocking):", conflictNames)
        // Continue with the update anyway - conflict is just a warning
      }

      console.log("[v0] Coordinates changed for location:", currentLocation.name)
    }

    const { data: updatedLocation, error } = await supabase
      .from("geofence_locations")
      .update({
        name,
        address,
        latitude: newLat,
        longitude: newLng,
        radius_meters: Number(radius_meters),
        is_active: is_active ?? true,
        check_in_start_time: body.check_in_start_time || null,
        check_out_end_time: body.check_out_end_time || null,
        require_early_checkout_reason: body.require_early_checkout_reason ?? true,
        working_hours_description: body.working_hours_description || null,
        location_type: locationType,
        parent_location_id: body.parent_location_id || null,
        updated_at: new Date().toISOString(),
      })
        .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Location update error:", error)
      return NextResponse.json({ error: "Failed to update location" }, { status: 500 })
    }

    console.log("[v0] Location updated successfully:", updatedLocation.name)

    const conflictWarning =
      coordsChanged && conflicts && conflicts.length > 0
        ? `Note: This location is within 50m of: ${conflicts.map((c) => c.name).join(", ")}. This may cause check-in conflicts.`
        : null

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "update_location",
      table_name: "geofence_locations",
        record_id: id,
      old_values: {
        name: currentLocation.name,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      },
      new_values: { name, address, latitude: newLat, longitude: newLng, radius_meters, is_active },
      ip_address: request.headers.get("x-forwarded-for") || null,
    })

    return NextResponse.json({
      success: true,
      data: updatedLocation,
      message: `Location "${updatedLocation.name}" updated successfully. Only this location was modified.`,
      warning: conflictWarning,
    })
  } catch (error) {
    console.error("[v0] Location update API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
