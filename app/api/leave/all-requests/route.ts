import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's role
    const { data: profile } = await supabase.from("user_profiles").select("role, department_id").eq("id", user.id).single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Expand allowed roles to include all HR-level roles
    const roleStr = String(profile.role || "").toLowerCase().trim()
    const allowedRoles = ["hr_leave_office", "admin", "director_hr", "manager_hr", "hr_office", "it-admin"]
    if (!allowedRoles.includes(roleStr)) {
      return NextResponse.json({ error: "Forbidden — requires HR role" }, { status: 403 })
    }

    const admin = await createAdminClient()

    const statusParam = searchParams.get("status")
    const searchParam = searchParams.get("search")
    const departmentParam = searchParams.get("department")
    const pageParam = searchParams.get("page") || "1"
    const pageSizeParam = searchParams.get("page_size") || "50"

    const page = Math.max(1, parseInt(pageParam, 10) || 1)
    const pageSize = Math.min(500, parseInt(pageSizeParam, 10) || 50)
    const offset = (page - 1) * pageSize

    // Fetch leave requests with user profiles
    // Sort by HR approval time (newest first), with fallback to submission date for unapproved requests
    let query = admin
      .from("leave_plan_requests")
      .select(
        `id, user_id, leave_type_key, preferred_start_date, preferred_end_date,
         requested_days, status, created_at, updated_at, hr_approved_at,
         user_profiles!user_id (id, first_name, last_name, email, department_id)`,
        { count: "exact" }
      )
      .order("hr_approved_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (statusParam && statusParam !== "all") {
      query = query.eq("status", statusParam)
    }
    if (departmentParam) {
      query = query.eq("user_profiles.department_id", departmentParam)
    }
    if (searchParam) {
      query = query.or(
        `user_profiles.first_name.ilike.%${searchParam}%,user_profiles.last_name.ilike.%${searchParam}%,user_profiles.email.ilike.%${searchParam}%`
      )
    }

    query = query.range(offset, offset + pageSize - 1)

    const { data: requests, count: totalCount, error } = await query

    if (error) {
      console.error("[v0] Error fetching leave requests:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Collect all unique department_ids and resolve names in one query
    const deptIds = [...new Set((requests || []).map((r: any) => r.user_profiles?.department_id).filter(Boolean))]
    let deptMap: Record<string, string> = {}
    if (deptIds.length > 0) {
      const { data: depts } = await admin.from("departments").select("id, name").in("id", deptIds)
      deptMap = Object.fromEntries((depts || []).map((d: any) => [d.id, d.name]))
    }

    // Fetch all HOD reviewers for these requests
    const requestIds = (requests || []).map((r: any) => r.id).filter(Boolean)
    let hodReviewersMap: Record<string, string[]> = {}
    if (requestIds.length > 0) {
      const { data: reviewRows } = await admin
        .from("leave_plan_reviews")
        .select("leave_plan_request_id, reviewer_id")
        .in("leave_plan_request_id", requestIds)

      const reviewerIds = [...new Set((reviewRows || []).map((r: any) => r.reviewer_id).filter(Boolean))]
      if (reviewerIds.length > 0) {
        const { data: reviewerProfiles } = await admin
          .from("user_profiles")
          .select("id, first_name, last_name")
          .in("id", reviewerIds)

        const profileMap = new Map((reviewerProfiles || []).map((p: any) => [p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim()]))
        for (const row of (reviewRows || [])) {
          const name = profileMap.get(row.reviewer_id) || ""
          if (!name) continue
          if (!hodReviewersMap[row.leave_plan_request_id]) hodReviewersMap[row.leave_plan_request_id] = []
          hodReviewersMap[row.leave_plan_request_id].push(name)
        }
      }
    }

    // Fetch resumption confirmation data from leave_resumption_notifications
    // Match by user_id + leave_end_date to link to leave_plan_requests
    const userIds = [...new Set((requests || []).map((r: any) => r.user_id).filter(Boolean))]
    let resumptionMap: Record<string, { staffConfirmed: boolean; hodConfirmed: boolean }> = {}
    if (userIds.length > 0) {
      const { data: resumptions } = await admin
        .from("leave_resumption_notifications")
        .select("user_id, leave_end_date, first_check_in_date, first_hod_rm_check_in_date")
        .in("user_id", userIds)
      if (resumptions) {
        for (const r of resumptions) {
          // Key by user_id + leave_end_date for matching
          const key = `${r.user_id}::${r.leave_end_date}`
          resumptionMap[key] = {
            staffConfirmed: !!r.first_check_in_date,
            hodConfirmed: !!r.first_hod_rm_check_in_date,
          }
        }
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const formattedRequests = (requests || []).map((req: any) => {
      const prof = req.user_profiles || {}
      const deptName = deptMap[prof.department_id] || "N/A"

      // Calculate days overdue: parse ISO date string without timezone issues
      let daysOverdue = 0
      const endDateStr: string = req.preferred_end_date || ""
      if (req.status === "hr_approved" && endDateStr) {
        const [year, month, day] = endDateStr.split("-").map(Number)
        const endDate = new Date(year, month - 1, day, 0, 0, 0, 0)
        const diff = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))
        daysOverdue = Math.max(0, diff)
      }

      // Look up confirmation status via user_id + leave_end_date
      const resumptionKey = `${req.user_id}::${endDateStr}`
      const confirmation = resumptionMap[resumptionKey] || { staffConfirmed: false, hodConfirmed: false }

      return {
        id: req.id,
        userId: req.user_id,
        staffName: `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || "Unknown",
        staffEmail: prof.email,
        department: deptName,
        departmentId: prof.department_id,
        leaveType: req.leave_type_key,
        startDate: req.preferred_start_date,
        endDate: req.preferred_end_date,
        requestedDays: req.requested_days,
        status: req.status,
        hrApprovedAt: req.hr_approved_at,
        createdAt: req.created_at,
        updatedAt: req.updated_at,
        hodReviewers: hodReviewersMap[req.id] || [],
        daysOverdue,
        staffConfirmed: confirmation.staffConfirmed,
        hodConfirmed: confirmation.hodConfirmed,
      }
    })

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
    return NextResponse.json({ error: String(err?.message || "Internal server error") }, { status: 500 })
  }
}
