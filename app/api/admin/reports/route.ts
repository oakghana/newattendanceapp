import { createClientAndGetUser } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Create supabase client and fetch user, using helper which clears stale auth cookies
    const { supabase, user, authError } = await createClientAndGetUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has admin or department_head role
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

    if (!profile || !["admin", "department_head"].includes(profile.role)) {
      return NextResponse.json({ error: "Admin or Department Head access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const locationId = searchParams.get("location_id")
    const departmentId = searchParams.get("department_id")

    // Pagination params (optional)
    const pageParam = searchParams.get("page")
    const pageSizeParam = searchParams.get("page_size")
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1
    const pageSize = pageSizeParam ? Math.max(1, parseInt(pageSizeParam, 10) || 1050) : 1050
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize - 1

    // Build attendance query
    let attendanceQuery = supabase.from("attendance_records").select(`
        *,
        user_profiles (
          first_name,
          last_name,
          employee_id,
          departments (name),
          regions (name)
        ),
        qcc_locations (name, address)
      `)

    // Apply filters
    if (startDate) {
      attendanceQuery = attendanceQuery.gte("check_in_time", startDate)
    }
    if (endDate) {
      attendanceQuery = attendanceQuery.lte("check_in_time", endDate)
    }

    // sanitize incoming params
    const safeLocationId = locationId && locationId !== "undefined" ? locationId : null
    const safeDepartmentId = departmentId && departmentId !== "undefined" ? departmentId : null

    if (safeLocationId) {
      attendanceQuery = attendanceQuery.eq("location_id", safeLocationId)
    }
    if (safeDepartmentId) {
      // department filtering will be applied after joining if necessary; attempt server-side where possible
      attendanceQuery = attendanceQuery.eq("department_id", safeDepartmentId)
    }

    // Apply ordering and pagination
    const { data: attendanceData, error: attendanceError } = await attendanceQuery.order("check_in_time", { ascending: false }).range(startIndex, endIndex)

    if (attendanceError) {
      console.error("Error fetching attendance data:", attendanceError)
      return NextResponse.json({ error: "Failed to fetch attendance data" }, { status: 500 })
    }

    // Get summary statistics
    const { data: totalUsers } = await supabase.from("user_profiles").select("id", { count: "exact", head: true })

    const { data: activeUsers } = await supabase
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)

    // total matching records (without pagination)
    let totalRecords = 0
    try {
      const countQuery = supabase.from("attendance_records").select("id", { count: "exact", head: true })
      if (startDate) countQuery.gte("check_in_time", startDate)
      if (endDate) countQuery.lte("check_in_time", endDate)
      if (safeLocationId) countQuery.eq("location_id", safeLocationId)
      if (safeDepartmentId) countQuery.eq("department_id", safeDepartmentId)

      const { count: countResult, error: countError } = await countQuery
      if (countError) {
        console.error("Reports count query error:", countError)
      } else {
        totalRecords = countResult || 0
      }
    } catch (err) {
      console.error("Reports count exception:", err)
    }

    // Calculate attendance statistics
    const totalRecordsOnPage = attendanceData?.length || 0
    const uniqueUsers = new Set(attendanceData?.map((record) => record.user_id)).size
    const avgCheckInTime =
      attendanceData?.length > 0
        ? attendanceData.reduce((sum, record) => {
            const time = new Date(record.check_in_time).getHours() * 60 + new Date(record.check_in_time).getMinutes()
            return sum + time
          }, 0) / attendanceData.length
        : 0

    return NextResponse.json({
      data: attendanceData,
      summary: {
        totalUsers: totalUsers?.length || 0,
        activeUsers: activeUsers?.length || 0,
        totalRecords,
        totalRecordsOnPage,
        uniqueUsers,
        page,
        pageSize,
        avgCheckInTime:
          Math.floor(avgCheckInTime / 60) + ":" + String(Math.floor(avgCheckInTime % 60)).padStart(2, "0"),
      },
    })
  } catch (error) {
    console.error("Reports API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
