import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET: Fetch approved recall memos for the current staff member
 * These are memos that have been approved by HR and generated
 * Staff can view their approved recall notifications/memos
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

    // Fetch approved recall memos for this staff member
    const { data: recallMemos, error: recallErr } = await supabase
      .from("leave_recall_requests")
      .select(`
        id,
        staff_user_id,
        recall_date,
        recall_reason,
        status,
        created_at,
        updated_at
      `)
      .eq("staff_user_id", user.id)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })

    if (recallErr) {
      console.error("[v0] Error fetching recall memos:", recallErr)
      return NextResponse.json(
        { error: "Failed to fetch recall memos" },
        { status: 500 }
      )
    }

    // Map to memo format for display
    const memos = recallMemos?.map((memo: any) => ({
      id: memo.id,
      type: "recall",
      staff_id: memo.staff_user_id,
      title: "Recall Approved",
      description: `Your leave has been recalled effective ${new Date(memo.recall_date).toLocaleDateString()}`,
      status: memo.status,
      reason: memo.recall_reason,
      recall_date: memo.recall_date,
      created_at: memo.created_at,
      updated_at: memo.updated_at,
    })) || []

    return NextResponse.json({
      memos,
      count: memos.length,
    })
  } catch (error) {
    console.error("[v0] Error in GET recall memos:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
