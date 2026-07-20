import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const departmentId = searchParams.get("department_id")
    const status = searchParams.get("status") || "approved"
    const limit = parseInt(searchParams.get("limit") || "500")
    const offset = parseInt(searchParams.get("offset") || "0")

    console.log("[v0] Fetching off-premises review log:", { departmentId, status, limit, offset })

    let query = supabase
      .from("pending_offpremises_checkins")
      .select(
        `
        id,
        user_id,
        current_location_name,
        google_maps_name,
        latitude,
        longitude,
        accuracy,
        status,
        created_at,
        approved_at,
        approved_by_id,
        rejection_reason,
        device_info,
        user_profiles!pending_offpremises_checkins_user_id_fkey (
          id,
          first_name,
          last_name,
          email,
          department_id,
          role
        ),
        approved_by:approved_by_id (
          id,
          first_name,
          last_name,
          email,
          role
        )
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })

    // Filter by status
    if (status) {
      query = query.eq("status", status)
    }

    // Filter by department if provided
    if (departmentId) {
      query = query.eq("user_profiles.department_id", departmentId)
    }

    // Add pagination
    const { data: records, error: fetchError, count } = await query.range(offset, offset + limit - 1)

    if (fetchError) {
      console.error("[v0] Failed to fetch off-premises records:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch records" },
        { status: 500 }
      )
    }

    console.log("[v0] Fetched", records?.length || 0, "off-premises records")

    return NextResponse.json(
      {
        success: true,
        data: records || [],
        total: count || 0,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < (count || 0),
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[v0] Off-premises review log error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch review log" },
      { status: 500 }
    )
  }
}
