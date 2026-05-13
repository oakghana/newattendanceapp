import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { leaveRequestId, action, counterStartDate, counterEndDate, reason } = await request.json()

    if (!leaveRequestId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["accept", "counter"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be 'accept' or 'counter'" }, { status: 400 })
    }

    // Get the current leave request
    const { data: leaveRequest, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select("*")
      .eq("id", leaveRequestId)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Check if there are pending HOD changes
    if (!leaveRequest.hod_decision || leaveRequest.hod_decision !== "pending_staff_response") {
      return NextResponse.json(
        { error: "No pending HOD changes to respond to" },
        { status: 400 }
      )
    }

    if (action === "accept") {
      // Staff accepts HOD's suggested dates
      const { error: updateError } = await admin
        .from("leave_plan_requests")
        .update({
          preferred_start_date: leaveRequest.adjusted_start_date,
          preferred_end_date: leaveRequest.adjusted_end_date,
          hod_decision: "accepted_by_staff",
          updated_at: new Date().toISOString(),
          reason: reason || leaveRequest.reason,
        })
        .eq("id", leaveRequestId)

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to accept changes: ${updateError.message}` },
          { status: 500 }
        )
      }

      // Create notification
      await admin.from("leave_notifications").insert({
        leave_request_id: leaveRequestId,
        recipient_id: leaveRequest.hod_reviewer_id,
        sender_id: leaveRequest.user_id,
        notification_type: "staff_accepted_hod_changes",
        message: `Staff has accepted your suggested leave date changes`,
        status: "pending",
      })

      return NextResponse.json({
        success: true,
        message: "Leave date changes accepted",
      })
    } else {
      // Staff provides counter-offer dates
      if (!counterStartDate || !counterEndDate) {
        return NextResponse.json(
          { error: "Counter-offer requires start and end dates" },
          { status: 400 }
        )
      }

      const { error: updateError } = await admin
        .from("leave_plan_requests")
        .update({
          adjusted_start_date: counterStartDate,
          adjusted_end_date: counterEndDate,
          hod_decision: "pending_hod_counter_approval",
          adjustment_reason: reason || "Staff counter-offer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", leaveRequestId)

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to submit counter-offer: ${updateError.message}` },
          { status: 500 }
        )
      }

      // Create notification for HOD
      await admin.from("leave_notifications").insert({
        leave_request_id: leaveRequestId,
        recipient_id: leaveRequest.hod_reviewer_id,
        sender_id: leaveRequest.user_id,
        notification_type: "staff_counter_offer",
        message: `Staff has submitted a counter-offer for leave dates. Start: ${counterStartDate}, End: ${counterEndDate}`,
        status: "pending",
      })

      return NextResponse.json({
        success: true,
        message: "Counter-offer submitted for HOD approval",
        counterDates: {
          start: counterStartDate,
          end: counterEndDate,
        },
      })
    }
  } catch (error) {
    console.error("[v0] Error responding to HOD changes:", error)
    return NextResponse.json(
      { error: "Failed to process response" },
      { status: 500 }
    )
  }
}
