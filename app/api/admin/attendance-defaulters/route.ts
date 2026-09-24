import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "department_head", "accounts_executive"].includes(profile.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get("timeframe") || "daily"
    const departmentId = searchParams.get("department_id")
    const locationId = searchParams.get("location_id")

    const now = new Date()
    const startDate = new Date()

    if (timeframe === "daily") {
      startDate.setHours(0, 0, 0, 0)
    } else {
      startDate.setDate(now.getDate() - 7)
      startDate.setHours(0, 0, 0, 0)
    }

    let query = supabase
      .from("user_profiles")
      .select(`
        id,
        first_name,
        last_name,
        email,
        role,
        department_id,
        assigned_location_id,
        departments!user_profiles_department_id_fkey(name),
        geofence_locations!user_profiles_assigned_location_id_fkey(name)
      `)
      .eq("is_active", true)
      .neq("role", "admin")
      .neq("role", "it-admin")

    if (profile.role === "department_head" || profile.role === "accounts_executive") {
      query = query.eq("department_id", profile.department_id)
    } else if (departmentId && departmentId !== "all") {
      query = query.eq("department_id", departmentId)
    }

    if (locationId && locationId !== "all") {
      query = query.eq("assigned_location_id", locationId)
    }

    const { data: staff, error: staffError } = await query

    if (staffError) {
      console.error("Error fetching attendance defaulters:", staffError)
      throw staffError
    }

    const defaulters = await Promise.all(
      (staff || []).map(async (s: any) => {
        const { data: attendance } = await supabase
          .from("attendance_records")
          .select("check_in_time, check_out_time, created_at")
          .eq("user_id", s.id)
          .gte("created_at", startDate.toISOString())
          .order("created_at", { ascending: false })

        const { data: leaves } = await supabase
          .from("excuse_documents")
          .select("excuse_date")
          .eq("user_id", s.id)
          .in("final_status", ["approved", "pending"])
          .gte("excuse_date", startDate.toISOString().split("T")[0])

        const attendanceDays = attendance?.length || 0
        const leaveDays = leaves?.length || 0

        const expectedDays = timeframe === "daily" ? 1 : 5
        const actualDays = attendanceDays + leaveDays

        if (actualDays >= expectedDays) return null

        let issueType: "no_check_in" | "no_check_out" | "both" = "both"
        const latestAttendance = attendance?.[0]

        if (latestAttendance) {
          if (!latestAttendance.check_in_time) issueType = "no_check_in"
          else if (!latestAttendance.check_out_time) issueType = "no_check_out"
        } else {
          issueType = "no_check_in"
        }

        return {
          id: s.id,
          full_name: `${s.first_name || ""} ${s.last_name || ""}`.trim(),
          email: s.email,
          department_name: s.departments?.name || "N/A",
          location_name: s.geofence_locations?.name || "N/A",
          role: s.role,
          last_check_in: latestAttendance?.check_in_time || null,
          last_check_out: latestAttendance?.check_out_time || null,
          days_missed: expectedDays - actualDays,
          issue_type: issueType,
        }
      }),
    )

    const filtered = defaulters.filter(Boolean)

    return NextResponse.json({ defaulters: filtered })
  } catch (error) {
    console.error("Error fetching attendance defaulters:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
  }
}
