import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/client"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const auth = createClient()
    const { data: { user } } = await auth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's role and department
    const { data: profile } = await auth.from("user_profiles").select("role, department_id").eq("id", user.id).single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Check authorization — must be hr_leave_office or admin
    const roleStr = String(profile.role || "").toLowerCase().trim()
    if (!["hr_leave_office", "admin", "director_hr", "manager_hr"].includes(roleStr)) {
      return NextResponse.json({ error: "Forbidden — requires HR leave office role" }, { status: 403 })
    }

    const admin = createAdminClient()

    // Get query params for filtering
    const statusParam = searchParams.get("status")
    const searchParam = searchParams.get("search")
    const departmentParam = searchParams.get("department")
    const pageParam = searchParams.get("page") || "1"
    const pageSizeParam = searchParams.get("page_size") || "50"

    const page = Math.max(1, parseInt(pageParam, 10) || 1)
    const pageSize = Math.min(500, parseInt(pageSizeParam, 10) || 50)
    const offset = (page - 1) * pageSize

    // Build leave requests query
    let query = admin
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        preferred_start_date,
        preferred_end_date,
        reason,
        status,
        created_at,
        updated_at,
        is_archived,
        user_profiles!user_id (
          id,
          first_name,
          last_name,
          email,
          department_id,
          department_profiles!department_id (
            name,
            code
          )
        )
        `,
        { count: "exact" }
      )
      .eq("is_archived", false)
      .order("created_at", { ascending: false })

    // Filter by status if provided
    if (statusParam && statusParam !== "all") {
      query = query.eq("status", statusParam)
    }

    // Filter by department if provided (and user is not admin)
    if (departmentParam && roleStr !== "admin") {
      query = query.eq("user_profiles.department_id", departmentParam)
    }

    // Search by staff name or email
    if (searchParam) {
      query = query.or(`user_profiles.first_name.ilike.%${searchParam}%,user_profiles.last_name.ilike.%${searchParam}%,user_profiles.email.ilike.%${searchParam}%`)
    }

    // Apply pagination
    query = query.range(offset, offset + pageSize - 1)

    const { data: requests, count: totalCount, error } = await query

    if (error) {
      console.error("[v0] Error fetching leave requests:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Format response
    const formattedRequests = (requests || []).map((req: any) => ({
      id: req.id,
      userId: req.user_id,
      staffName: `${req.user_profiles?.first_name || ""} ${req.user_profiles?.last_name || ""}`.trim(),
      staffEmail: req.user_profiles?.email,
      department: req.user_profiles?.department_profiles?.[0]?.name || "N/A",
      departmentCode: req.user_profiles?.department_profiles?.[0]?.code,
      startDate: req.preferred_start_date,
      endDate: req.preferred_end_date,
      reason: req.reason,
      status: req.status,
      createdAt: req.created_at,
      updatedAt: req.updated_at,
    }))

    return NextResponse.json({
      success: true,
      data: formattedRequests,
      pagination: {
        page,
        pageSize,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / pageSize),
      },
    })
  } catch (err: any) {
    console.error("[v0] Error in all-requests route:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
