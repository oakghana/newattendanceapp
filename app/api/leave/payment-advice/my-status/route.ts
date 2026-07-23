import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
)

export async function GET(req: Request) {
  try {
    // Get auth header
    const authHeader = req.headers.get("authorization") || ""
    const token = authHeader.replace("Bearer ", "")

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch payment advice memos for this staff member
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select(
        `id, 
         staff_id, 
         staff_name,
         leave_plan_request_id,
         status,
         created_at,
         updated_at,
         forwarded_at,
         acknowledged_at,
         approved_days,
         payment_amount,
         payment_currency,
         staff_category,
         leave_period_start,
         leave_period_end,
         leave_plan_requests!leave_plan_request_id (
           id,
           leave_type_key,
           leave_year_period
         )`
      )
      .eq("staff_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching payment advice status:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Format response
    const formattedMemos = (memos || []).map((memo: any) => ({
      id: memo.id,
      staffName: memo.staff_name,
      leaveType: memo.leave_plan_requests?.leave_type_key || "Leave",
      leaveYear: memo.leave_plan_requests?.leave_year_period || "N/A",
      staffCategory: memo.staff_category || "Staff",
      approvedDays: memo.approved_days || 0,
      paymentAmount: memo.payment_amount,
      paymentCurrency: memo.payment_currency || "GHS",
      status: memo.status,
      createdAt: memo.created_at,
      updatedAt: memo.updated_at,
      forwardedAt: memo.forwarded_at,
      acknowledgedAt: memo.acknowledged_at,
      leaveStartDate: memo.leave_period_start,
      leaveEndDate: memo.leave_period_end,
    }))

    return NextResponse.json({
      success: true,
      memos: formattedMemos,
      count: formattedMemos.length,
    })
  } catch (err: any) {
    console.error("[v0] Error in payment-advice/my-status:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
