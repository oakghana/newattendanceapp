import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { calculateRequestedDays } from "@/lib/leave-planning"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { leave_plan_request_id, action, counter_start_date, counter_end_date } = await request.json()

    // Validate required fields
    if (!leave_plan_request_id || !action) {
      return NextResponse.json(
        { error: "leave_plan_request_id and action are required" },
        { status: 400 }
      )
    }

    // Validate action
    if (!["accept", "counter"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'counter'" },
        { status: 400 }
      )
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the leave request
    const { data: leaveRequest, error: leaveError } = await admin
      .from("leave_plan_requests")
      .select("*")
      .eq("id", leave_plan_request_id)
      .eq("user_id", user.id)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Validate status - must be awaiting staff acknowledgment
    if (leaveRequest.status !== "hod_changes_pending_acceptance") {
      return NextResponse.json(
        { error: "Leave request is not awaiting your acknowledgment of HOD changes" },
        { status: 400 }
      )
    }

    if (action === "accept") {
      // Staff accepts HOD proposed changes → forward directly to HR Leave Office
      const updatePayload = {
        status: "hr_office_forwarded",
        staff_accepted_hod_changes: true,
        staff_acceptance_date: new Date().toISOString(),
        preferred_start_date: leaveRequest.hod_proposed_start_date,
        preferred_end_date: leaveRequest.hod_proposed_end_date,
        requested_days: calculateRequestedDays(
          leaveRequest.hod_proposed_start_date,
          leaveRequest.hod_proposed_end_date
        ),
      }

      const { error: updateError } = await admin
        .from("leave_plan_requests")
        .update(updatePayload)
        .eq("id", leave_plan_request_id)

      if (updateError) {
        console.error("[v0] Failed to update leave request on acceptance:", updateError)
        return NextResponse.json({ error: "Failed to process acceptance" }, { status: 500 })
      }

      // Update notification status
      await admin
        .from("hod_change_notifications")
        .update({ staff_response_status: "accepted" })
        .eq("leave_plan_request_id", leave_plan_request_id)

      return NextResponse.json({ success: true, message: "Changes accepted. Request forwarded to HR Leave Office." })
    } else if (action === "counter") {
      // Staff proposes counter dates → send back to HOD for negotiation
      if (!counter_start_date || !counter_end_date) {
        return NextResponse.json(
          { error: "Counter dates are required" },
          { status: 400 }
        )
      }

      const counterDays = calculateRequestedDays(counter_start_date, counter_end_date)
      if (counterDays <= 0) {
        return NextResponse.json({ error: "Invalid counter date range" }, { status: 400 })
      }

      const updatePayload = {
        status: "pending_hod_review",
        preferred_start_date: counter_start_date,
        preferred_end_date: counter_end_date,
        requested_days: counterDays,
        staff_counter_proposed: true,
        staff_counter_dates_start: counter_start_date,
        staff_counter_dates_end: counter_end_date,
        staff_counter_proposed_date: new Date().toISOString(),
      }

      const { error: updateError } = await admin
        .from("leave_plan_requests")
        .update(updatePayload)
        .eq("id", leave_plan_request_id)

      if (updateError) {
        console.error("[v0] Failed to update leave request on counter:", updateError)
        return NextResponse.json({ error: "Failed to process counter proposal" }, { status: 500 })
      }

      // Update notification status
      await admin
        .from("hod_change_notifications")
        .update({ staff_response_status: "counter_proposed" })
        .eq("leave_plan_request_id", leave_plan_request_id)

      return NextResponse.json({ 
        success: true, 
        message: "Counter proposal sent to HOD for review. Please await their response." 
      })
    }
  } catch (error) {
    console.error("[v0] HOD acknowledgment error:", error)
    return NextResponse.json({ error: "Failed to process acknowledgment" }, { status: 500 })
  }
}
