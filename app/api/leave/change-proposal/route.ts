import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error: missing Supabase credentials" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { leave_request_id, proposed_start_date, proposed_end_date, reason, action_type, user_id, user_role, response_text } = body

    // Validate required fields
    if (!leave_request_id || !action_type || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields: leave_request_id, action_type, user_id" },
        { status: 400 }
      )
    }

    // Validate date formats
    if ((proposed_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(proposed_start_date)) ||
        (proposed_end_date && !/^\d{4}-\d{2}-\d{2}$/.test(proposed_end_date))) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      )
    }

    // Get the leave request details
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, start_date, end_date, status, employee_id")
      .eq("id", leave_request_id)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Insert into leave_change_proposals table
    const { data: proposal, error: insertError } = await supabase
      .from("leave_change_proposals")
      .insert({
        leave_request_id,
        original_start_date: leaveRequest.start_date,
        original_end_date: leaveRequest.end_date,
        proposed_start_date: proposed_start_date || leaveRequest.start_date,
        proposed_end_date: proposed_end_date || leaveRequest.end_date,
        proposed_by_user_id: user_id,
        proposed_by_role: user_role || "unknown",
        proposal_reason: reason || null,
        action_type: action_type, // "propose_change", "acknowledge_accept", "acknowledge_reject", "counter_propose"
        staff_response_text: action_type === "counter_propose" ? response_text : null,
        status: action_type === "acknowledge_accept" ? "accepted" : action_type === "acknowledge_reject" ? "rejected" : "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Leave change proposal insert error:", insertError)
      return NextResponse.json({ error: "Failed to create change proposal" }, { status: 500 })
    }

    return NextResponse.json(
      {
        success: true,
        data: proposal,
        message: `Change proposal ${action_type === "acknowledge_accept" ? "accepted" : action_type === "acknowledge_reject" ? "rejected" : "created"} successfully`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[v0] Leave change proposal API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error: missing Supabase credentials" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const leaveRequestId = searchParams.get("leave_request_id")
    const userId = searchParams.get("user_id")

    if (!leaveRequestId && !userId) {
      return NextResponse.json(
        { error: "Provide either leave_request_id or user_id" },
        { status: 400 }
      )
    }

    let query = supabase.from("leave_change_proposals").select("*")

    if (leaveRequestId) {
      query = query.eq("leave_request_id", leaveRequestId)
    }
    if (userId) {
      query = query.eq("proposed_by_user_id", userId)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Fetch proposals error:", error)
      return NextResponse.json({ error: "Failed to fetch proposals" }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Leave change proposal GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
