import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to check role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    let query = supabase
      .from("leave_notifications")
      .select(
        `
        id,
        leave_request_id,
        leave_requests (
          user_id,
          leave_type,
          start_date,
          end_date,
          reason,
          status,
          user:user_profiles (
            first_name,
            last_name,
            employee_id
          )
        ),
        created_at,
        is_dismissed
      `
      )

    // Filter based on role
    if (profile.role === "admin") {
      // Admin sees all leave notifications
      query = query.eq("is_dismissed", false)
    } else if (profile.role === "regional_manager") {
      // Regional manager sees staff in their region
      query = query
        .eq("is_dismissed", false)
        .eq("leave_requests.status", "pending")
    } else if (profile.role === "department_head") {
      // Department head sees their department's staff
      const { data: deptStaff } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("department_id", profile.department_id)

      const staffIds = deptStaff?.map(s => s.id) || []
      query = query
        .eq("is_dismissed", false)
        .in("leave_requests.user_id", staffIds)
        .eq("leave_requests.status", "pending")
    } else {
      // Staff only sees their own notifications
      query = query
        .eq("leave_requests.user_id", user.id)
        .eq("is_dismissed", false)
    }

    const { data: notifications, error } = await query.order("created_at", { ascending: false })

    if (error) throw error

    // Format the response
    const formattedNotifications = notifications?.map(notif => ({
      id: notif.id,
      user_id: notif.leave_requests?.user_id,
      staff_name: notif.leave_requests?.user ? `${notif.leave_requests.user.first_name} ${notif.leave_requests.user.last_name}` : "Unknown",
      employee_id: notif.leave_requests?.user?.employee_id,
      leave_type: notif.leave_requests?.leave_type,
      start_date: notif.leave_requests?.start_date,
      end_date: notif.leave_requests?.end_date,
      reason: notif.leave_requests?.reason,
      status: notif.leave_requests?.status,
      created_at: notif.created_at,
      can_dismiss: profile.role !== "staff" || notif.leave_requests?.status !== "pending",
    })) || []

    return NextResponse.json(formattedNotifications)
  } catch (error) {
    console.error("Error fetching leave notifications:", error)
    return NextResponse.json(
      { error: "Failed to fetch leave notifications" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, notificationId, newStatus } = await request.json()

    if (action === "dismiss") {
      // Get the leave_request_id so we can reject the request too
      const { data: dismissNotif } = await supabase
        .from("leave_notifications")
        .select("leave_request_id")
        .eq("id", notificationId)
        .single()

      // Mark the notification as dismissed
      const { error: dismissErr } = await supabase
        .from("leave_notifications")
        .update({ is_dismissed: true })
        .eq("id", notificationId)

      if (dismissErr) throw dismissErr

      // Also reject the leave_request so its status is correctly reflected
      if (dismissNotif?.leave_request_id) {
        await supabase
          .from("leave_requests")
          .update({
            status: "rejected",
            approved_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", dismissNotif.leave_request_id)
      }

      return NextResponse.json({ success: true, message: "Notification dismissed and leave request rejected" })
    }

    if (action === "approve" || action === "reject") {
      // First get the leave_request_id from the notification
      const { data: notification } = await supabase
        .from("leave_notifications")
        .select("leave_request_id")
        .eq("id", notificationId)
        .single()

      if (!notification) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 })
      }

      // Check if user has permission to approve/reject
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (!["admin", "regional_manager", "department_head"].includes(profile?.role)) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      const { error: updateError } = await supabase
        .from("leave_requests")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          approved_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.leave_request_id)

      if (updateError) throw updateError

      // If approved, update the user's leave status
      if (action === "approve") {
        const { data: leaveRequest } = await supabase
          .from("leave_requests")
          .select("user_id, start_date, end_date")
          .eq("id", notification.leave_request_id)
          .single()

        if (leaveRequest) {
          await supabase
            .from("user_profiles")
            .update({
              leave_status: "on_leave",
              leave_start_date: leaveRequest.start_date,
              leave_end_date: leaveRequest.end_date,
            })
            .eq("id", leaveRequest.user_id)
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: `Leave ${action === "approve" ? "approved" : "rejected"}` 
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error processing leave notification:", error)
    return NextResponse.json(
      { error: "Failed to process leave notification" },
      { status: 500 }
    )
  }
}
