import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the current user's profile to determine their role
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, department_id")
      .eq("id", user.id)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 401 })
    }

    // Only HOD, Regional Manager, and HR can view staff leave
    const allowedRoles = ["head_of_department", "regional_manager", "hr_executive", "hr_leave_office", "admin"]
    if (!allowedRoles.includes(userProfile.role)) {
      return NextResponse.json(
        { error: "Only HOD, Regional Manager, and HR can view staff leave schedules" },
        { status: 403 }
      )
    }

    let query = supabase
      .from("user_profiles")
      .select(
        `
        id,
        first_name,
        last_name,
        leave_status,
        leave_start_date,
        leave_end_date,
        leave_reason,
        departments(name, code)
      `
      )
      .neq("leave_status", "active")
      .neq("leave_status", null)

    // Filter by department if HOD
    if (userProfile.role === "head_of_department" && userProfile.department_id) {
      query = query.eq("department_id", userProfile.department_id)
    }

    // Filter by region if Regional Manager
    const { data: rmRegion, error: rmError } = await supabase
      .from("user_profiles")
      .select("region_id")
      .eq("id", user.id)
      .single()

    if (userProfile.role === "regional_manager" && !rmError && rmRegion?.region_id) {
      // Get all departments in this region
      const { data: regionDepts } = await supabase
        .from("departments")
        .select("id")
        .eq("region_id", rmRegion.region_id)

      if (regionDepts && regionDepts.length > 0) {
        const deptIds = regionDepts.map((d) => d.id)
        query = query.in("department_id", deptIds)
      }
    }

    // Execute query
    const { data: staffOnLeave, error: leaveError } = await query.order("leave_end_date", {
      ascending: true,
    })

    if (leaveError) {
      console.error("[v0] Error fetching staff leave:", leaveError)
      return NextResponse.json({ error: "Failed to fetch staff leave schedules" }, { status: 500 })
    }

    // Transform data for response
    const transformedData = (staffOnLeave || []).map((staff: any) => ({
      id: staff.id,
      user_id: staff.id,
      first_name: staff.first_name,
      last_name: staff.last_name,
      department: staff.departments?.name || "Unknown",
      department_code: staff.departments?.code || "",
      leave_type: staff.leave_reason || "Leave",
      leave_start_date: staff.leave_start_date,
      leave_end_date: staff.leave_end_date,
      leave_status: staff.leave_status,
    }))

    return NextResponse.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
    })
  } catch (error) {
    console.error("[v0] Staff leave monitoring error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
