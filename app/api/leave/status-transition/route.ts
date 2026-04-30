import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * This API automatically handles leave status transitions:
 * - When a leave notification's start date arrives, automatically set user to "on_leave"
 * - When a leave notification's end date passes, automatically set user back to "at_post"
 * - Only applies to approved leave notifications
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action, leave_notification_id } = body

    if (!action || !leave_notification_id) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // Get the leave notification details
    const { data: leaveNotif } = await supabase
      .from("leave_notifications")
      .select("user_id, start_date, end_date, status")
      .eq("id", leave_notification_id)
      .single()

    if (!leaveNotif) {
      return NextResponse.json({ error: "Leave notification not found" }, { status: 404 })
    }

    if (leaveNotif.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved leave can be actioned" },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().split("T")[0]

    if (action === "activate_leave") {
      // Check if start date has arrived
      if (today < leaveNotif.start_date) {
        return NextResponse.json(
          { error: "Leave has not yet started" },
          { status: 400 }
        )
      }

      // Update user status to on_leave
      const { error } = await supabase
        .from("user_profiles")
        .update({
          leave_status: "on_leave",
          leave_start_date: leaveNotif.start_date,
          leave_end_date: leaveNotif.end_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leaveNotif.user_id)

      if (error) throw error

      // Log the action
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "leave_status_activated",
        table_name: "user_profiles",
        record_id: leaveNotif.user_id,
        new_values: {
          leave_status: "on_leave",
          leave_start_date: leaveNotif.start_date,
          leave_end_date: leaveNotif.end_date,
          notification_id: leave_notification_id,
        },
      })

      return NextResponse.json({
        success: true,
        message: "Leave status activated",
      })
    }

    if (action === "restore_status") {
      // Check if leave period has ended
      if (today <= leaveNotif.end_date) {
        return NextResponse.json(
          { error: "Leave period has not yet ended" },
          { status: 400 }
        )
      }

      // Update user status back to at_post
      const { error } = await supabase
        .from("user_profiles")
        .update({
          leave_status: "at_post",
          leave_start_date: null,
          leave_end_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leaveNotif.user_id)

      if (error) throw error

      // Log the action
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "leave_status_restored",
        table_name: "user_profiles",
        record_id: leaveNotif.user_id,
        new_values: {
          leave_status: "at_post",
          left_leave_on: today,
          notification_id: leave_notification_id,
        },
      })

      return NextResponse.json({
        success: true,
        message: "Staff returned to at_post status",
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error handling leave status:", error)
    return NextResponse.json(
      { error: "Failed to update leave status" },
      { status: 500 }
    )
  }
}

/**
 * Scheduled job endpoint to auto-transition leave statuses
 * Should be called periodically via a cron job or scheduled task
 */
export async function GET(request: NextRequest) {
  // Add authentication via API key header for scheduled tasks
  const apiKey = request.headers.get("x-api-key")
  const expectedKey = process.env.CRON_API_KEY || "dev-key"

  if (process.env.NODE_ENV === "production" && apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    const today = new Date().toISOString().split("T")[0]
    const inactivityDays = Math.max(1, Number(process.env.LEAVE_SUPERVISOR_INACTIVITY_DAYS || 5))

    // Find approved leave notifications that should be activated (start date today)
    const { data: toActivate } = await supabase
      .from("leave_notifications")
      .select("id, user_id, start_date, end_date")
      .eq("status", "approved")
      .eq("start_date", today)
      .eq("is_auto_transitioned", false)

    // Find leave notifications that should be restored (end date was yesterday)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayDate = yesterday.toISOString().split("T")[0]

    const { data: toRestore } = await supabase
      .from("leave_notifications")
      .select("id, user_id, start_date, end_date")
      .eq("status", "approved")
      .eq("end_date", yesterdayDate)
      .eq("is_auto_transitioned", false)

    let activatedCount = 0
    let restoredCount = 0
    let autoApprovedCount = 0

    // Activate leave for users whose leave starts today
    if (toActivate && toActivate.length > 0) {
      for (const notif of toActivate) {
        await supabase
          .from("user_profiles")
          .update({
            leave_status: "on_leave",
            leave_start_date: notif.start_date,
            leave_end_date: notif.end_date,
            updated_at: new Date().toISOString(),
          })
          .eq("id", notif.user_id)

        await supabase
          .from("leave_notifications")
          .update({ is_auto_transitioned: true })
          .eq("id", notif.id)

        activatedCount++
      }
    }

    // Restore status for users whose leave ended
    if (toRestore && toRestore.length > 0) {
      for (const notif of toRestore) {
        await supabase
          .from("user_profiles")
          .update({
            leave_status: "at_post",
            leave_start_date: null,
            leave_end_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", notif.user_id)

        await supabase
          .from("leave_notifications")
          .update({ is_auto_transitioned: true })
          .eq("id", notif.id)

        restoredCount++
      }
    }

    const staleCutoff = new Date()
    staleCutoff.setDate(staleCutoff.getDate() - inactivityDays)

    const { data: staleRequests } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("status", "pending")
      .lte("created_at", staleCutoff.toISOString())
      .limit(1000)

    if (staleRequests && staleRequests.length > 0) {
      const staleIds = staleRequests.map((request) => request.id)
      const approvedAt = new Date().toISOString()

      await supabase
        .from("leave_requests")
        .update({ status: "approved", approved_at: approvedAt, updated_at: approvedAt })
        .in("id", staleIds)
        .eq("status", "pending")

      await supabase
        .from("leave_notifications")
        .update({ status: "approved", approved_at: approvedAt })
        .in("leave_request_id", staleIds)
        .eq("status", "pending")

      autoApprovedCount = staleIds.length
    }

    return NextResponse.json({
      success: true,
      message: "Leave status auto-transitions completed",
      activated: activatedCount,
      restored: restoredCount,
      autoApproved: autoApprovedCount,
      inactivityDays,
      totalProcessed: activatedCount + restoredCount + autoApprovedCount,
    })
  } catch (error) {
    console.error("Error in auto-transition job:", error)
    return NextResponse.json(
      { error: "Failed to process leave transitions" },
      { status: 500 }
    )
  }
}
