import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { isUserAdmin } from "@/lib/admin-bypass"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch all approved payment advice memos for tracking and download
 * ADMINS: See ALL approved memos without RLS restriction
 * HR Executives: See all approved memos via admin client bypass
 */
export async function GET(request: NextRequest) {
  try {
    const userIsAdmin = await isUserAdmin()
    const supabase = await createClient()
    // Always use admin client - admins bypass RLS, HR execs need bypass for permissions
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") || ""

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
        status,
        forwarded_at,
        acknowledged_at,
        payment_amount,
        payment_currency
      `
      )
      .eq("status", "approved")
      .order("updated_at", { ascending: false })

    // Optionally filter by month
    if (month) {
      const startOfMonth = `${month}-01`
      const [year, mon] = month.split("-").map(Number)
      const endOfMonth = new Date(year, mon, 0).toISOString().slice(0, 10)
      query = query.gte("created_at", startOfMonth).lte("created_at", endOfMonth + "T23:59:59")
    }

    const { data: approvedMemos, error } = await query

    if (error) {
      console.error("[v0] Error fetching approved memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch approved memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: approvedMemos || [],
      count: approvedMemos?.length || 0,
    })
  } catch (err) {
    console.error("[v0] Unexpected error in approved-memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
