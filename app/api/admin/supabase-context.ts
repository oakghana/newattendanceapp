import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userRole, userId, staffIds, leaveYear } = body

    if (action === "fetch-hod-leave-requests") {
      // Create admin client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Missing Supabase credentials")
      }

      const admin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      })

      const normalizedRole = String(userRole).toLowerCase().replace(/[\s-]+/g, "_")

      // Only HOD and Regional Manager can access
      if (!["department_head", "regional_manager"].includes(normalizedRole)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      // Build query to fetch leave requests
      let query = admin
        .from("leave_plan_requests")
        .select(
          `
          id,
          user_id,
          leave_type_key,
          preferred_start_date,
          preferred_end_date,
          requested_days,
          status,
          reason,
          created_at,
          user:user_profiles!left (
            first_name,
            last_name,
            staff_number,
            location,
            rank
          )
        `
        )
        .eq("leave_type_key", "annual")
        .eq("is_archived", false)

      // Filter by leave year if provided
      if (leaveYear) {
        query = query.eq("leave_year_period", leaveYear)
      }

      // Filter by specific staff if provided
      if (staffIds && staffIds.length > 0) {
        query = query.in("user_id", staffIds)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching leave requests:", error)
        throw error
      }

      // Format data for export
      const requests = (data || []).map((leave: any) => ({
        id: leave.id,
        staff_name: `${leave.user?.first_name || ""} ${leave.user?.last_name || ""}`.trim(),
        staff_number: leave.user?.staff_number || "-",
        location: leave.user?.location || "-",
        rank: leave.user?.rank || "-",
        leave_type_key: leave.leave_type_key,
        preferred_start_date: leave.preferred_start_date,
        preferred_end_date: leave.preferred_end_date,
        requested_days: leave.requested_days,
        status: leave.status,
        reason: leave.reason,
        created_at: leave.created_at,
      }))

      return NextResponse.json({ requests, success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Admin context error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}
