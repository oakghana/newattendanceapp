import { createClient } from "@/lib/supabase/server"
import { createLeaveResumptionTrackingForLeaveRequest } from "@/lib/leave-resumption-service"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { notification_id, action, reason } = await request.json()

    if (!["approve", "dismiss"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // Get the notification and leave request
    const { data: notification, error: notificationError } = await supabase
      .from("leave_notifications")
      .select("*, leave_requests(*)")
      .eq("id", notification_id)
      .single()

    if (notificationError || !notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    // Verify user has permission to approve (admin, regional_manager, or department_head)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    if (!["admin", "regional_manager", "department_head"].includes(profile?.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const leaveRequest = notification.leave_requests
    const staffProfile = await supabase
      .from("user_profiles")
      .select("department_id")
      .eq("id", leaveRequest.user_id)
      .single()

    // Regional managers can only approve requests for their region
    if (
      profile?.role === "regional_manager" &&
      profile?.department_id !== staffProfile.data?.department_id
    ) {
      return NextResponse.json({ error: "Insufficient permissions for this request" }, { status: 403 })
    }

    // Department heads can only approve requests for their department
    if (
      profile?.role === "department_head" &&
      profile?.department_id !== staffProfile.data?.department_id
    ) {
      return NextResponse.json({ error: "Insufficient permissions for this request" }, { status: 403 })
    }

    const newStatus = action === "approve" ? "approved" : "dismissed"
    const leaveStatus = action === "approve" ? "on_leave" : "at_post"

    // Update notification status
    const { error: updateNotificationError } = await supabase
      .from("leave_notifications")
      .update({
        status: newStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        dismissal_reason: action === "dismiss" ? reason : null,
      })
      .eq("id", notification_id)

    if (updateNotificationError) {
      return NextResponse.json({ error: updateNotificationError.message }, { status: 400 })
    }

    // Update leave request status
    const { error: updateLeaveError } = await supabase
      .from("leave_requests")
      .update({ status: newStatus })
      .eq("id", leaveRequest.id)

    if (updateLeaveError) {
      return NextResponse.json({ error: updateLeaveError.message }, { status: 400 })
    }

    // Update leave status in user_profiles (only if approved)
    if (action === "approve") {
      await supabase.from("leave_status").upsert({
        user_id: leaveRequest.user_id,
        status: "on_leave",
        start_date: leaveRequest.start_date,
        end_date: leaveRequest.end_date,
        leave_request_id: leaveRequest.id,
      })

      await createLeaveResumptionTrackingForLeaveRequest({
        id: leaveRequest.id,
        user_id: leaveRequest.user_id,
        end_date: leaveRequest.end_date,
      })
    } else {
      // Set status back to at_post if dismissed
      await supabase
        .from("leave_status")
        .update({ status: "at_post" })
        .eq("user_id", leaveRequest.user_id)
        .eq("leave_request_id", leaveRequest.id)
    }

    // Create notification for the staff member about the decision
    await supabase.from("notifications").insert({
      user_id: leaveRequest.user_id,
      title: `Leave Request ${newStatus === "approved" ? "Approved" : "Dismissed"}`,
      message: `Your leave request from ${new Date(leaveRequest.start_date).toLocaleDateString()} to ${new Date(leaveRequest.end_date).toLocaleDateString()} has been ${newStatus}.${action === "dismiss" ? ` Reason: ${reason}` : ""}`,
      type: "leave_update",
      link: "/dashboard/leave-management",
    })

    return NextResponse.json(
      {
        message: `Leave request ${newStatus} successfully`,
        notification: { ...notification, status: newStatus },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Error processing leave notification:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
