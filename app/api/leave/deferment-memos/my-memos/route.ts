import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET: Fetch approved deferment memos for the current staff member
 * These are memos that have been approved by HR and generated
 * Staff can view their approved deferment notifications/memos
 */
export async function GET() {
  try {
    const supabase = await createAdminClient()
    
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch approved deferment requests for this staff member
    const { data: defermentMemos, error: deferErr } = await supabase
      .from("leave_deferment_requests")
      .select(`
        id,
        user_id,
        original_leave_period_start,
        original_leave_period_end,
        requested_deferment_year,
        deferment_start_date,
        deferment_end_date,
        reason,
        status,
        hr_office_decision,
        hr_office_reviewed_at,
        created_at,
        updated_at
      `)
      .eq("user_id", user.id)
      .eq("hr_office_decision", "approved")
      .order("updated_at", { ascending: false })

    if (deferErr) {
      console.error("[v0] Error fetching deferment memos:", deferErr)
      return NextResponse.json(
        { error: "Failed to fetch deferment memos" },
        { status: 500 }
      )
    }

    // Map to memo format for display — guard all date fields against null
    const memos = defermentMemos?.map((memo: any) => ({
      id: memo.id,
      type: "deferment",
      staff_id: memo.user_id,
      original_leave_period_start: memo.original_leave_period_start || null,
      original_leave_period_end: memo.original_leave_period_end || null,
      requested_deferment_year: memo.requested_deferment_year || null,
      deferment_start_date: memo.deferment_start_date || null,
      deferment_end_date: memo.deferment_end_date || null,
      reason: memo.reason || null,
      hr_office_decision: memo.hr_office_decision,
      hr_office_reviewed_at: memo.hr_office_reviewed_at || memo.updated_at,
      created_at: memo.created_at,
      updated_at: memo.updated_at,
    })) || []

    return NextResponse.json({
      memos,
      count: memos.length,
    })
  } catch (error) {
    console.error("[v0] Error in GET deferment memos:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
