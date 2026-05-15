import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET: Fetch all locations with their regions for leave request dropdowns
export async function GET() {
  try {
    const supabase = await createAdminClient()

    // Fetch locations with district and region info
    const { data: locations, error: locError } = await supabase
      .from("geofence_locations")
      .select(`
        id,
        name,
        district_id,
        districts (
          id,
          name,
          region_id,
          regions (
            id,
            name
          )
        )
      `)
      .eq("is_active", true)
      .order("name")

    if (locError) {
      console.error("[v0] Error fetching locations:", locError)
      throw locError
    }

    // Format locations with region info
    const formattedLocations = (locations || []).map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      district_id: loc.district_id,
      district_name: loc.districts?.name || null,
      region_id: loc.districts?.region_id || null,
      region_name: loc.districts?.regions?.name || null,
    }))

    // Extract unique regions
    const regionsMap = new Map<string, { id: string; name: string }>()
    formattedLocations.forEach((loc: any) => {
      if (loc.region_id && loc.region_name) {
        regionsMap.set(loc.region_id, { id: loc.region_id, name: loc.region_name })
      }
    })
    const regions = Array.from(regionsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      locations: formattedLocations,
      regions,
    })
  } catch (error) {
    console.error("[v0] Failed to fetch locations/regions:", error)
    return NextResponse.json({ error: "Failed to fetch locations and regions" }, { status: 500 })
  }
}
