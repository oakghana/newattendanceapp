import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    const userRole = searchParams.get("user_role")
    const userDepartment = searchParams.get("user_department")

    if (!userId || !userRole) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
    const isHodOrRm = ["department_head", "regional_manager"].includes(normalizedRole)

    if (!isHodOrRm) {
      return NextResponse.json(
        { error: "Only HOD/RM can view approved memos" },
        { status: 403 }
      )
    }

    let staffIds: string[] = []

    // Get staff under this HOD/RM
    if (normalizedRole === "department_head" && userDepartment) {
      const { data: staffProfiles, error: staffError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("department_id", userDepartment)
        .neq("id", userId)

      if (staffError) {
        throw new Error(staffError.message)
      }

      staffIds = (staffProfiles || []).map((p: any) => p.id)
    } else if (normalizedRole === "regional_manager") {
      // Get staff assigned to this regional manager's locations
      const { data: rmLocations, error: locError } = await supabase
        .from("user_profiles")
        .select("assigned_location_id")
        .eq("id", userId)
        .single()

      if (locError || !rmLocations?.assigned_location_id) {
        return NextResponse.json({ memos: [] })
      }

      const { data: staffProfiles, error: staffError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("assigned_location_id", rmLocations.assigned_location_id)
        .neq("id", userId)

      if (staffError) {
        throw new Error(staffError.message)
      }

      staffIds = (staffProfiles || []).map((p: any) => p.id)
    }

    if (staffIds.length === 0) {
      return NextResponse.json({ memos: [] })
    }

    // Fetch approved leave requests for these staff
    const { data: approvedRequests, error: requestError } = await supabase
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        preferred_start_date,
        preferred_end_date,
        leave_type_key,
        reason,
        status,
        created_at,
        user_profiles:user_id (
          first_name,
          last_name,
          email,
          assigned_location_id,
          geofence_locations:assigned_location_id (
            name,
            address
          )
        ),
        leave_plan_reviews (
          decision,
          reviewed_at,
          reviewer_id,
          reviewer_role
        )
      `)
      .in("user_id", staffIds)
      .in("status", ["approved", "hr_approved"])
      .order("created_at", { ascending: false })

    if (requestError) {
      throw new Error(requestError.message)
    }

    const memos = (approvedRequests || []).map((req: any) => ({
      id: String(req.id),
      user_id: String(req.user_id),
      staff_name: req.user_profiles ? `${req.user_profiles.first_name || ""} ${req.user_profiles.last_name || ""}`.trim() : "Unknown",
      email: req.user_profiles?.email || "N/A",
      location: req.user_profiles?.geofence_locations?.name || "Not Assigned",
      address: req.user_profiles?.geofence_locations?.address || "N/A",
      leave_type: req.leave_type_key || "annual",
      start_date: req.preferred_start_date,
      end_date: req.preferred_end_date,
      reason: req.reason || "",
      status: req.status,
      approved_at: req.leave_plan_reviews?.[0]?.reviewed_at || req.created_at,
      memo_url: `/api/leave/memo-document/${req.id}`, // Link to download memo
    }))

    return NextResponse.json({ memos })
  } catch (error) {
    console.error("[v0] Staff approved memos error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch approved memos" },
      { status: 500 }
    )
  }
}
