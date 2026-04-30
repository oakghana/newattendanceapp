import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Reports API - Starting request")
    const { supabase, user, authError } = await createClientAndGetUser()

    if (authError || !user) {
      console.error("[v0] Reports API - Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Reports API - User authenticated:", user.id)

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "regional_manager", "department_head", "staff"].includes(profile.role)) {
      console.error("[v0] Reports API - Insufficient permissions:", profile?.role)
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    console.log("[v0] Reports API - User role:", profile.role)

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const startDate =
      searchParams.get("start_date") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const endDate = searchParams.get("end_date") || new Date().toISOString().split("T")[0]
    const departmentId = searchParams.get("department_id")
    const userId = searchParams.get("user_id")
    const locationId = searchParams.get("location_id")
    const districtId = searchParams.get("district_id")
    const status = searchParams.get("status")

    console.log("[v0] Reports API - Filters:", {
      startDate,
      endDate,
      departmentId,
      userId,
      locationId,
      districtId,
      status,
    })

    let query = supabase
      .from("attendance_records")
      .select(`
        *,
        check_in_location:geofence_locations!check_in_location_id (
          id,
          name,
          address,
          district_id
        ),
        check_out_location:geofence_locations!check_out_location_id (
          id,
          name,
          address,
          district_id
        )
      `)
      .gte("check_in_time", `${startDate}T00:00:00`)
      .lte("check_in_time", `${endDate}T23:59:59`)

    // Validate incoming UUID-like params to avoid invalid input to Postgres
    const safeLocationId = locationId && locationId !== "undefined" ? locationId : null
    const safeDistrictId = districtId && districtId !== "undefined" ? districtId : null
    const safeDepartmentId = departmentId && departmentId !== "undefined" ? departmentId : null
    const safeStatus = status && status !== "undefined" && status !== "all" ? status : null

    if (profile.role === "staff") {
      query = query.eq("user_id", user.id)
    } else if (userId) {
      query = query.eq("user_id", userId)
    }

    // ── Role-based data scoping ─────────────────────────────────────────────
    // admin          → no automatic restriction (sees all)
    // regional_manager → restricted to their own assigned_location_id
    // department_head  → restricted to their own department_id

    if (profile.role === "regional_manager" && profile.assigned_location_id) {
      // Regional manager can only see records where the check-in location matches
      // their assigned location, regardless of any user-supplied location filter.
      query = query.eq("check_in_location_id", profile.assigned_location_id)
    } else if (safeLocationId) {
      // Admin (or future roles): honour the explicit location filter
      query = query.eq("check_in_location_id", safeLocationId)
    }

    // If a status filter is selected, scope records by status
    if (safeStatus) {
      query = query.eq("status", safeStatus)
    }

    // Department scoping via user_profiles sub-query
    if (profile.role === "department_head") {
      // Department heads always see their own department only — ignore any dept filter param
      const { data: deptUsers } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("department_id", profile.department_id)
      const deptUserIds = (deptUsers || []).map((u: any) => u.id)
      if (deptUserIds.length > 0) {
        query = query.in("user_id", deptUserIds)
      } else {
        query = query.eq("user_id", "00000000-0000-0000-0000-000000000000")
      }
    } else if (safeDepartmentId && profile.role !== "staff") {
      // Admin / regional_manager with an explicit dept filter
      const { data: deptUsers } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("department_id", safeDepartmentId)
      const deptUserIds = (deptUsers || []).map((u: any) => u.id)
      if (deptUserIds.length > 0) {
        query = query.in("user_id", deptUserIds)
      } else {
        query = query.eq("user_id", "00000000-0000-0000-0000-000000000000")
      }
    }

    // Apply ordering and pagination
    const pageParam = searchParams.get("page")
    const pageSizeParam = searchParams.get("page_size")
    const exportMode = searchParams.get("export") === "true"
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1
    // Cap normal page size at 200 for UI performance; export mode fetches in large chunks
    const pageSize = exportMode
      ? Math.min(1000, pageSizeParam ? parseInt(pageSizeParam, 10) || 1000 : 1000)
      : Math.min(200, pageSizeParam ? parseInt(pageSizeParam, 10) || 50 : 50)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize - 1

    const { data: attendanceRecords, error } = await query.order("check_in_time", { ascending: false }).range(startIndex, endIndex)

    if (error) {
      console.error("[v0] Reports API - Attendance query error:", error)
      return NextResponse.json({ error: "Failed to fetch attendance report" }, { status: 500 })
    }

    console.log("[v0] Reports API - Found", attendanceRecords.length, "attendance records")

    const userIds = [...new Set(attendanceRecords.map((record) => record.user_id))]

    // Ensure we have a non-empty array to query
    let userProfiles: any[] = []
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("user_profiles")
        .select(`
          id,
          first_name,
          last_name,
          email,
          employee_id,
          department_id,
          assigned_location_id,
          departments (
            id,
            name,
            code
          ),
          assigned_location:geofence_locations!assigned_location_id (
            id,
            name,
            address,
            district_id,
            districts (
              id,
              name
            )
          )
        `)
        .in("id", userIds)
      
      if (profileError) {
        console.error("[v0] Reports API - Error fetching user profiles:", profileError)
      }
      userProfiles = profiles || []
    }

    console.log("[v0] Reports API - Fetched", userProfiles.length, "user profiles for", userIds.length, "unique user IDs")

    const userMap = new Map(userProfiles.map((user) => [user.id, user]) || [])

    // For user_ids without profiles, try to get email from auth.users
    const missingProfileIds = userIds.filter(id => !userMap.has(id))
    let authUserMap = new Map<string, { email?: string | null }>()
    if (missingProfileIds.length > 0) {
      try {
        const adminClient = await createAdminClient()
        const { data: authUsers } = await adminClient.auth.admin.listUsers()
        if (authUsers?.users) {
          authUsers.users.forEach((u) => {
            if (missingProfileIds.includes(u.id)) {
              authUserMap.set(u.id, { email: u.email })
            }
          })
        }
      } catch (authErr) {
        console.error('[v0] Reports API - Failed to fetch auth users:', authErr)
      }
    }

    // All department and location filtering is now done at the DB query level above.
    // Post-fetch we only need district filtering (no DB column to filter on directly).
    let filteredRecords = attendanceRecords

    if (safeDistrictId) {
      filteredRecords = filteredRecords.filter((record) => {
        const user = userMap.get(record.user_id)
        return (
          user?.assigned_location?.district_id === safeDistrictId ||
          record.check_in_location?.district_id === safeDistrictId
        )
      })
    }

    console.log("[v0] Reports API - After filtering:", filteredRecords.length, "records")

    // Diagnostic: if we fetched records but filtering removed all of them, log helpful details
    if ((attendanceRecords?.length || 0) > 0 && filteredRecords.length === 0) {
      try {
        console.warn("[v0] Reports API - Filtering removed all fetched records — diagnostic info:", {
          userRole: profile?.role,
          profileDepartmentId: profile?.department_id,
          requestDepartmentId: departmentId,
          requestDistrictId: districtId,
          fetchedAttendanceCount: attendanceRecords.length,
          attendanceUserIds: userIds,
          foundUserProfilesCount: (userProfiles || []).length,
          userProfilesPreview: (userProfiles || []).slice(0, 10).map((u: any) => ({ id: u.id, department_id: u.department_id, assigned_location_id: u.assigned_location_id }))
        })
      } catch (diagErr) {
        console.error('[v0] Reports API - Diagnostic logging failed:', diagErr)
      }
    }

    const enrichedRecords = filteredRecords.map((record) => {
      const userProfile = userMap.get(record.user_id) || null

      // Determine if check-in/check-out was outside assigned location
      const isCheckInOutsideLocation =
        userProfile?.assigned_location_id && record.check_in_location_id !== userProfile.assigned_location_id

      const isCheckOutOutsideLocation =
        userProfile?.assigned_location_id &&
        record.check_out_location_id &&
        record.check_out_location_id !== userProfile.assigned_location_id

      // If no profile, try to get email from auth.users
      const authUser = authUserMap.get(record.user_id)
      const enrichedProfile = userProfile || (authUser ? { email: authUser.email } : null)
      
      // Log if we have a record without profile
      if (!userProfile && !authUser) {
        console.warn('[v0] Reports API - Record has no profile or auth data:', {
          recordId: record.id,
          userId: record.user_id,
          hasLateness: !!record.lateness_reason,
          hasEarlyCheckout: !!record.early_checkout_reason
        })
      }

      return {
        ...record,
        user_profiles: enrichedProfile,
        is_check_in_outside_location: isCheckInOutsideLocation,
        is_check_out_outside_location: isCheckOutOutsideLocation,
        // Keep backward compatibility
        geofence_locations: record.check_in_location,
      }
    })

    // --- audit: if any attendance rows are missing user_profiles, write an audit log so admins can track and fix ---
    const missingProfiles = enrichedRecords.filter((r) => !r.user_profiles)
    if (missingProfiles.length > 0) {
      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'missing_user_profiles_detected',
          table_name: 'attendance_records',
          details: { missing_count: missingProfiles.length, examples: missingProfiles.slice(0,10).map(m => ({ id: m.id, user_id: m.user_id })) },
          ip_address: (request as any).ip || request.headers.get('x-forwarded-for') || null,
          user_agent: request.headers.get('user-agent')
        })
      } catch (auditErr) {
        console.error('[v0] Reports API - Failed to write missing_user_profiles audit log:', auditErr)
      }
    }

    // Calculate summary statistics
    // Calculate total matching records (without pagination)
    // Use filtered record count as total (accurate because DB-level filters applied above)
    let totalRecords = filteredRecords.length
    try {
      // Build a count query that mirrors the main query filters exactly
      let countQuery = supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .gte("check_in_time", `${startDate}T00:00:00`)
        .lte("check_in_time", `${endDate}T23:59:59`)

      if (profile.role === "staff") {
        countQuery = countQuery.eq("user_id", user.id)
      } else if (userId) {
        countQuery = countQuery.eq("user_id", userId)
      }
      if (safeLocationId) countQuery = countQuery.eq("check_in_location_id", safeLocationId)
      if (safeStatus) countQuery = countQuery.eq("status", safeStatus)

      // Mirror department user scoping for the count
      if (safeDepartmentId && profile.role !== "staff") {
        let deptUsersCountQuery = supabase
          .from("user_profiles")
          .select("id")
          .eq("department_id", safeDepartmentId)
        if (profile.role === "department_head") {
          deptUsersCountQuery = deptUsersCountQuery.eq("department_id", profile.department_id)
        }
        const { data: deptUsersCount } = await deptUsersCountQuery
        const deptUserIdsCount = (deptUsersCount || []).map((u: any) => u.id)
        if (deptUserIdsCount.length > 0) {
          countQuery = countQuery.in("user_id", deptUserIdsCount)
        } else {
          countQuery = countQuery.eq("user_id", "00000000-0000-0000-0000-000000000000")
        }
      } else if (profile.role === "department_head" && !safeDepartmentId) {
        const { data: deptUsersCount } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("department_id", profile.department_id)
        const deptUserIdsCount = (deptUsersCount || []).map((u: any) => u.id)
        if (deptUserIdsCount.length > 0) {
          countQuery = countQuery.in("user_id", deptUserIdsCount)
        } else {
          countQuery = countQuery.eq("user_id", "00000000-0000-0000-0000-000000000000")
        }
      }

      const { count: countResult, error: countError } = await countQuery
      if (countError) {
        console.error("[v0] Reports API - Count query error:", countError)
      } else {
        totalRecords = countResult || 0
      }
    } catch (err) {
      console.error("[v0] Reports API - Count exception:", err)
    }

    const totalWorkHours = enrichedRecords.reduce((sum, record) => sum + (record.work_hours || 0), 0)
    const averageWorkHours = totalRecords > 0 ? totalWorkHours / totalRecords : 0

    // Group by status
    const statusCounts = enrichedRecords.reduce(
      (acc, record) => {
        acc[record.status] = (acc[record.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Group by department
    const departmentStats = enrichedRecords.reduce(
      (acc, record) => {
        const deptName = record.user_profiles?.departments?.name || "Unknown"
        if (!acc[deptName]) {
          acc[deptName] = { count: 0, totalHours: 0 }
        }
        acc[deptName].count += 1
        acc[deptName].totalHours += record.work_hours || 0
        return acc
      },
      {} as Record<string, { count: number; totalHours: number }>,
    )

    console.log("[v0] Reports API - Returning", totalRecords, "records with summary")

    return NextResponse.json(
      {
        success: true,
        data: {
          records: enrichedRecords,
          summary: {
            totalRecords,
            totalWorkHours: Math.round(totalWorkHours * 100) / 100,
            averageWorkHours: Math.round(averageWorkHours * 100) / 100,
            statusCounts,
            departmentStats,
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Reports API - Unexpected error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    )
  }
}
