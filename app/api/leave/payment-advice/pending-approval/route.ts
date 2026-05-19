import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch payment advice memos pending approval for the current HR Executive
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch memos where approval_status is pending or null
    // These are memos submitted by HR Leave Office waiting for HR Executive approval
    const { data: pendingMemos, error } = await supabase
      .from("leave_payment_memos")
      .select(
        `
        id,
        staff_id,
        staff_name,
        staff_number,
        memo_subject,
        memo_body,
        leave_period_start,
        leave_period_end,
        approved_days,
        hr_leave_office_id,
        hr_leave_office_name,
        created_at,
        approval_status,
        approved_by_id,
        approved_by_name,
        approved_at,
        rejection_reason
      `
      )
      .in("approval_status", [null, "pending", "submitted"])
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching pending memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: pendingMemos || [],
      count: pendingMemos?.length || 0,
    })
  } catch (err: any) {
    console.error("[v0] Error fetching pending memos:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}

/**
 * POST: Approve a payment advice memo
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { memoId, approved } = await request.json()

    if (!memoId || approved === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: memoId, approved" },
        { status: 400 }
      )
    }

    // Update memo approval status
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .update({
        approval_status: approved ? "approved" : "rejected",
        approved_by_id: user.id,
        approved_by_name: user.user_metadata?.full_name || user.email || "Unknown",
        approved_at: new Date().toISOString(),
      })
      .eq("id", memoId)
      .select()

    if (error) {
      console.error("[v0] Error updating memo approval:", error)
      return NextResponse.json(
        { error: "Failed to update memo", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Memo ${approved ? "approved" : "rejected"} successfully`,
      memo: data?.[0],
    })
  } catch (err: any) {
    console.error("[v0] Error approving memo:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
