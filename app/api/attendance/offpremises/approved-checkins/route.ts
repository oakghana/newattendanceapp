import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const departmentId = searchParams.get("department_id")
    const limit = parseInt(searchParams.get("limit") || "500")
    const offset = parseInt(searchParams.get("offset") || "0")

    console.log("[v0] Fetching approved off-premises check-ins:", { departmentId, limit, offset })

    let query = supabase
      .from("attendance_records")
      .select(
        `
        id,
        user_id,
        check_in_time,
        actual_location_name,
        actual_latitude,
        actual_longitude,
        on_official_duty_outside_premises,
        check_in_type,
        device_info,
        user_profiles!user_id (
          id,
          first_name,
          last_name,
          email,
          department_id,
          role
        )
        `,
        { count: "exact" }
      )
      .eq("on_official_duty_outside_premises", true)
      .order("check_in_time", { ascending: false })

    // Filter by department if provided
    if (departmentId) {
      query = query.eq("user_profiles.department_id", departmentId)
    }

    // Add pagination
    const { data: records, error: fetchError, count } = await query.range(offset, offset + limit - 1)

    if (fetchError) {
      console.error("[v0] Failed to fetch approved check-ins:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch records" },
        { status: 500 }
      )
    }

    console.log("[v0] Fetched", records?.length || 0, "approved off-premises check-ins")

    // Transform records to match expected format
    const transformedRecords = records?.map((record: any) => ({
      ...record,
      staff_name: `${record.user_profiles?.first_name} ${record.user_profiles?.last_name}`,
      department_id: record.user_profiles?.department_id,
      approval_type: "Off-Premises Duty",
      status: "checked_in",
    })) || []

    return NextResponse.json(
      {
        success: true,
        data: transformedRecords,
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
    console.error("[v0] Approved check-ins error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch approved check-ins" },
      { status: 500 }
    )
  }
}
