import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch approved payment advice memos for the currently authenticated staff member
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch all approved payment advice memos for this staff member
    const { data: memos, error } = await admin
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
      .eq("staff_id", user.id)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching staff payment memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch your payment advice memos", details: error.message },
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
