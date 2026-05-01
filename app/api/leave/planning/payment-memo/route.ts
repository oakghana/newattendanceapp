import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * POST /api/leave/planning/payment-memo
 * HR Leave Office creates a payment memo for accounts
 */
export async function POST(request: NextRequest) {
  try {
    const user = await supabase.auth.getUser()
    if (!user.data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.data.user.id)
      .single()

    const userRole = String(profile?.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    if (!["admin", "hr_leave_office"].includes(userRole)) {
      return NextResponse.json(
        { error: "Only HR Leave Office staff can create payment memos" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      leave_plan_request_id,
      memo_subject,
      memo_body,
      payment_amount,
      payment_currency = "GHS",
    } = body

    if (!leave_plan_request_id || !memo_subject || !memo_body) {
      return NextResponse.json(
        { error: "leave_plan_request_id, memo_subject, and memo_body are required" },
        { status: 400 }
      )
    }

    // Fetch the leave request to get staff details
    const { data: leaveRequest, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select(
        `id, user_id, preferred_start_date, preferred_end_date, 
         adjusted_start_date, adjusted_end_date, adjusted_days, 
         requested_days, leave_type_key`
      )
      .eq("id", leave_plan_request_id)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Get staff details
    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, staff_number")
      .eq("id", (leaveRequest as any).user_id)
      .single()

    // Get HR officer details
    const { data: hrOfficer } = await admin
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", user.data.user.id)
      .single()

    const hrOfficerName = [
      String(hrOfficer?.first_name || ""),
      String(hrOfficer?.last_name || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "HR Leave Office"

    const staffName = [
      String(staffProfile?.first_name || ""),
      String(staffProfile?.last_name || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Staff Member"

    const staffNumber = String(staffProfile?.staff_number || "—")

    // Create payment memo record
    const { data: paymentMemo, error: memoError } = await admin
      .from("leave_payment_memos")
      .insert({
        leave_plan_request_id,
        hr_leave_office_id: user.data.user.id,
        hr_leave_office_name: hrOfficerName,
        memo_subject: memo_subject.trim(),
        memo_body: memo_body.trim(),
        payment_amount: payment_amount ? Number(payment_amount) : null,
        payment_currency,
        staff_id: (leaveRequest as any).user_id,
        staff_name: staffName,
        staff_number: staffNumber,
        leave_period_start: (leaveRequest as any).adjusted_start_date || (leaveRequest as any).preferred_start_date,
        leave_period_end: (leaveRequest as any).adjusted_end_date || (leaveRequest as any).preferred_end_date,
        approved_days: (leaveRequest as any).adjusted_days || (leaveRequest as any).requested_days,
        status: "draft",
      })
      .select()
      .single()

    if (memoError) {
      console.error("[payment-memo] insert error:", memoError)
      throw memoError
    }

    // Log the activity
    await admin
      .from("leave_office_work_log")
      .insert({
        hr_leave_office_id: user.data.user.id,
        hr_leave_office_name: hrOfficerName,
        leave_plan_request_id,
        activity_type: "payment_memo_drafted",
        description: `Payment memo drafted for ${staffName} (${staffNumber}) - Amount: GHc ${payment_amount}`,
        adjustment_details: {
          payment_amount,
          payment_currency,
        },
      })
      .catch(() => {})

    return NextResponse.json({
      success: true,
      payment_memo: paymentMemo,
      message: "Payment memo created successfully",
    })
  } catch (error) {
    console.error("[payment-memo] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create payment memo" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/leave/planning/payment-memo/[id]
 * Update payment memo status (draft → ready for review → forwarded)
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await supabase.auth.getUser()
    if (!user.data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.data.user.id)
      .single()

    const userRole = String(profile?.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    if (!["admin", "hr_leave_office"].includes(userRole)) {
      return NextResponse.json(
        { error: "Only HR Leave Office staff can update payment memos" },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const memoId = url.pathname.split("/").pop()

    const body = await request.json()
    const { status, memo_subject, memo_body } = body

    if (!memoId) {
      return NextResponse.json({ error: "Memo ID is required" }, { status: 400 })
    }

    const validStatuses = ["draft", "ready_for_review", "reviewed_by_hr", "forwarded_to_accounts", "acknowledged_by_accounts"]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    const updateData: Record<string, any> = {}
    if (status) updateData.status = status
    if (memo_subject) updateData.memo_subject = memo_subject.trim()
    if (memo_body) updateData.memo_body = memo_body.trim()

    if (status === "forwarded_to_accounts") {
      updateData.forwarded_at = new Date().toISOString()
    }

    const { data: updatedMemo, error: updateError } = await admin
      .from("leave_payment_memos")
      .update(updateData)
      .eq("id", memoId)
      .select()
      .single()

    if (updateError) {
      console.error("[payment-memo-put] update error:", updateError)
      throw updateError
    }

    // Log the activity if status changed to forwarded
    if (status === "forwarded_to_accounts") {
      await admin
        .from("leave_office_work_log")
        .insert({
          hr_leave_office_id: user.data.user.id,
          hr_leave_office_name: String((profile as any)?.first_name || "") + " " + String((profile as any)?.last_name || ""),
          leave_plan_request_id: updatedMemo.leave_plan_request_id,
          activity_type: "payment_memo_forwarded",
          description: `Payment memo forwarded to Accounts for ${updatedMemo.staff_name} (${updatedMemo.staff_number})`,
        })
        .catch(() => {})
    }

    return NextResponse.json({
      success: true,
      payment_memo: updatedMemo,
      message: `Payment memo updated to ${status}`,
    })
  } catch (error) {
    console.error("[payment-memo-put] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payment memo" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/leave/planning/payment-memo
 * Get all payment memos for HR Leave Office
 */
export async function GET(request: NextRequest) {
  try {
    const user = await supabase.auth.getUser()
    if (!user.data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.data.user.id)
      .single()

    const userRole = String(profile?.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    if (!["admin", "hr_leave_office"].includes(userRole)) {
      return NextResponse.json(
        { error: "Only HR Leave Office staff can view payment memos" },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const pageStr = url.searchParams.get("page") || "1"
    const limitStr = url.searchParams.get("limit") || "20"
    const page = Math.max(1, Number(pageStr))
    const limit = Math.min(100, Number(limitStr))
    const offset = (page - 1) * limit

    let query = admin
      .from("leave_payment_memos")
      .select("*", { count: "exact" })

    if (status) {
      query = query.eq("status", status)
    }

    const { data: memos, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      payment_memos: memos || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error("[payment-memo-get] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payment memos" },
      { status: 500 }
    )
  }
}
