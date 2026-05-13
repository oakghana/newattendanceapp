import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { leave_plan_request_id, action, counter_start_date, counter_end_date, notes } = await request.json()

    // Validate required fields
    if (!leave_plan_request_id || !action) {
      return NextResponse.json(
        { error: "leave_plan_request_id and action are required" },
        { status: 400 }
      )
    }

    // Validate action
    if (!["accept", "counter_propose"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'counter_propose'" },
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

    // Get user profile for the staff member
    const { data: staffProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, department_name")
      .eq("user_id", user.id)
      .single()

    if (profileError || !staffProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    // Get the leave request
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("*")
      .eq("id", leave_plan_request_id)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      )
    }

    // Verify the request is in pending acceptance status and belongs to the staff member
    if (leaveRequest.status !== "hod_changes_pending_acceptance") {
      return NextResponse.json(
        { error: "This request is not awaiting your acknowledgment" },
        { status: 400 }
      )
    }

    if (leaveRequest.staff_user_id !== staffProfile.id) {
      return NextResponse.json(
        { error: "You don't have permission to acknowledge this request" },
        { status: 403 }
      )
    }

    // Get the notification record
    const { data: notification, error: notifError } = await supabase
      .from("hod_change_notifications")
      .select("*")
      .eq("leave_plan_request_id", leave_plan_request_id)
      .single()

    if (notifError || !notification) {
      return NextResponse.json(
        { error: "Change notification not found" },
        { status: 404 }
      )
    }

    // Process the staff response
    if (action === "accept") {
      // Staff accepted HOD changes - forward to HR Leave Office
      const { error: updateError } = await supabase
        .from("leave_plan_requests")
        .update({
          status: "hr_office_forwarded",
          staff_acknowledged_at: new Date().toISOString(),
          staff_acknowledgment_status: "accepted",
          preferred_start_date: leaveRequest.hod_proposed_start_date,
          preferred_end_date: leaveRequest.hod_proposed_end_date,
        })
        .eq("id", leave_plan_request_id)

      if (updateError) throw updateError

      // Update notification
      const { error: notifUpdateError } = await supabase
        .from("hod_change_notifications")
        .update({
          staff_response_status: "accepted",
          staff_responded_at: new Date().toISOString(),
        })
        .eq("leave_plan_request_id", leave_plan_request_id)

      if (notifUpdateError) throw notifUpdateError

      return NextResponse.json({
        success: true,
        message: "Changes accepted. Request forwarded to HR Leave Office.",
        status: "hr_office_forwarded",
      })
    }

    if (action === "counter_propose") {
      // Staff counter-proposed different dates - send back to HOD
      if (!counter_start_date || !counter_end_date) {
        return NextResponse.json(
          { error: "Counter dates are required when counter-proposing" },
          { status: 400 }
        )
      }

      const { error: updateError } = await supabase
        .from("leave_plan_requests")
        .update({
          status: "pending_hod_review", // Goes back to HOD for review
          staff_acknowledged_at: new Date().toISOString(),
          staff_acknowledgment_status: "counter_proposed",
          preferred_start_date: counter_start_date,
          preferred_end_date: counter_end_date,
        })
        .eq("id", leave_plan_request_id)

      if (updateError) throw updateError

      // Update notification
      const { error: notifUpdateError } = await supabase
        .from("hod_change_notifications")
        .update({
          staff_response_status: "counter_proposed",
          staff_counter_start: counter_start_date,
          staff_counter_end: counter_end_date,
          staff_response_notes: notes || null,
          staff_responded_at: new Date().toISOString(),
        })
        .eq("leave_plan_request_id", leave_plan_request_id)

      if (notifUpdateError) throw notifUpdateError

      return NextResponse.json({
        success: true,
        message: "Counter-proposal sent to HOD for review.",
        status: "pending_hod_review",
      })
    }
  } catch (error) {
    console.error("[v0] HOD acknowledgment error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Acknowledgment failed" },
      { status: 500 }
    )
  }
}
