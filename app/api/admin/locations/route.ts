import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { normalizeAppRole } from "@/lib/role-capabilities"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    const role = normalizeAppRole(profile?.role)
    if (!profile || !["admin", "it-admin", "department_head"].includes(role)) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    const { data: locations, error } = await supabase.from("geofence_locations").select("*").order("name")

    if (error) {
      console.error("[v0] Locations query error:", error)
      // Return empty array instead of throwing to prevent JSON parse errors
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: locations || [] })
  } catch (error) {
    console.error("[v0] Locations API error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch locations", data: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { data: location, error } = await supabase
      .from("geofence_locations")
      .insert([
        {
          name: body.name,
          address: body.address,
          latitude: body.latitude,
          longitude: body.longitude,
          radius_meters: body.radius_meters,
          is_active: true,
          check_in_start_time: body.check_in_start_time || null,
          check_out_end_time: body.check_out_end_time || null,
          require_early_checkout_reason: body.require_early_checkout_reason ?? true,
          working_hours_description: body.working_hours_description || null,
        },
      ])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(location)
  } catch (error) {
    return NextResponse.json({ error: "Failed to create location" }, { status: 500 })
  }
}
