import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status") || "all"
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use admin client to bypass RLS for profile and data queries
    const adminClient = await createAdminClient()

    // Get user profile to verify permissions
    const { data: managerProfile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id, role, department_id, assigned_location_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("[v0] Error fetching manager profile:", profileError)
      return NextResponse.json(
        { error: "Failed to fetch user profile", details: profileError.message },
        { status: 500 }
      )
    }

    if (!managerProfile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    if (!["department_head", "regional_manager", "admin"].includes(managerProfile.role)) {
      // Staff members can only see their own pending requests
      let query = adminClient
        .from("pending_offpremises_checkins")
          .select(`
            id,
            user_id,
            current_location_name,
            latitude,
            longitude,
            accuracy,
            device_info,
            created_at,
            status,
            approved_by_id,
            approved_at,
            rejection_reason,
            google_maps_name,
            reason,
            request_type,
            user_profiles!pending_offpremises_checkins_user_id_fkey (
              id,
              first_name,
              last_name,
              email,
              employee_id,
              department_id,
              position,
              assigned_location_id
            )
          `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      // Apply status filter if not "all"
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter)
      }

      const { data: staffRequests, error } = await query

      if (error) {
        console.error("[v0] Failed to fetch staff off-premises requests:", error)
        return NextResponse.json(
          { error: "Failed to fetch requests", details: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        requests: staffRequests || [],
        count: staffRequests?.length || 0,
      })
    }

    // Build query using admin client to bypass RLS
    // Note: request_type and reason columns may not exist, so we exclude them from the base query
    let queryWithReason = adminClient
      .from("pending_offpremises_checkins")
      .select(`
        id,
        user_id,
        current_location_name,
        latitude,
        longitude,
        accuracy,
        device_info,
        created_at,
        status,
        approved_by_id,
        approved_at,
        rejection_reason,
        google_maps_name,
        reason,
        request_type,
        user_profiles!pending_offpremises_checkins_user_id_fkey (
          id,
          first_name,
          last_name,
          email,
          employee_id,
          department_id,
          position,
          assigned_location_id
        )
      `)
      .order("created_at", { ascending: false })

    // if non-admin manager, restrict to own department or assigned location
    // Note: Filter based on nested user_profiles data client-side since PostgREST doesn't support OR on nested filters well
    if (managerProfile.role !== 'admin') {
      // Fetch all records first, then filter client-side
      const allRes = await queryWithReason
      if (allRes.error) {
        console.error('[v0] Failed to fetch off-premises requests:', allRes.error)
        return NextResponse.json({ error: 'Failed to fetch requests', details: allRes.error.message }, { status: 500 })
      }

      const deptId = managerProfile.department_id
      const locId = managerProfile.assigned_location_id
      
      // Filter records based on department_id or assigned_location_id
      let filteredRequests = allRes.data || []
      if (deptId || locId) {
        filteredRequests = filteredRequests.filter((req: any) => {
          const userDept = req.user_profiles?.department_id
          const userLoc = req.user_profiles?.assigned_location_id
          return (deptId && userDept === deptId) || (locId && userLoc === locId)
        })
      }

      // Apply status filter if needed
      if (statusFilter !== 'all') {
        filteredRequests = filteredRequests.filter((req: any) => req.status === statusFilter)
      }

      return NextResponse.json({
        requests: filteredRequests || [],
        count: filteredRequests?.length || 0,
      })
    }

    // For admin users, apply status filter
    if (statusFilter !== "all") {
      queryWithReason = queryWithReason.eq("status", statusFilter)
    }

    // Execute query
    const res = await queryWithReason
    if (res.error) {
      console.error('[v0] Failed to fetch off-premises requests:', res.error)
      return NextResponse.json({ error: 'Failed to fetch requests', details: res.error.message }, { status: 500 })
    }

    const pendingRequests = res.data || []
    return NextResponse.json({
      requests: pendingRequests,
      count: pendingRequests.length,
    })
  } catch (error) {
    console.error("[v0] Error in pending requests endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
