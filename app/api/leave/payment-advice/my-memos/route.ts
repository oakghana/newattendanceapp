import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch payment advice memos submitted by the current HR LEAVE_OFFICE user
 * Used for Monthly Summary tab to prevent duplicate submissions
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get month filter from query params (format: YYYY-MM)
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month")

    // Build query to fetch memos SUBMITTED BY this HR Leave Office user
    let query = admin
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
        updated_at,
        status
      `
      )
      .eq("hr_leave_office_id", user.id) // Memos submitted BY this user
      .order("created_at", { ascending: false })

    // Filter by month if provided
    if (month) {
      const startOfMonth = `${month}-01`
      const [year, monthNum] = month.split("-").map(Number)
      const endOfMonth = new Date(year, monthNum, 0).toISOString().slice(0, 10)
      query = query.gte("created_at", startOfMonth).lte("created_at", `${endOfMonth}T23:59:59`)
    }

    const { data: memos, error } = await query

    if (error) {
      console.error("[v0] Error fetching submitted payment memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch your submitted payment advice memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: memos || [],
      count: memos?.length || 0,
    })
  } catch (err) {
    console.error("[v0] Unexpected error in my-memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
