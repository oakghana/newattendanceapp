import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    // Fetch all pending leave requests grouped by status
    const { data: requests, error } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, staff_full_name, staff_number, leave_type, start_date, end_date, requested_days, status")
      .in("status", ["pending_hod_review", "pending_hr_office", "pending_hr_approval"])
      .order("created_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({
      requests: requests || [],
      total: (requests || []).length,
    })
  } catch (err) {
    console.error("[v0] Error fetching pending requests:", err)
    return NextResponse.json(
      { error: "Failed to fetch pending requests" },
      { status: 500 }
    )
  }
}
