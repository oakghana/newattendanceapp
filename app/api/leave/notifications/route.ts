import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

const HOD_REVIEW_ROLES = new Set(["department_head", "regional_manager"])
const HR_REVIEW_ROLES = new Set(["hr_officer", "manager_hr", "director_hr", "hr_director", "loan_office"])

function canReviewLeave(role: string) {
  return role === "admin" || HOD_REVIEW_ROLES.has(role) || HR_REVIEW_ROLES.has(role)
}

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

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const actorRole = normalizeRole((profile as any)?.role)

    if (!canReviewLeave(actorRole) && actorRole !== "staff") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    let query = admin
      .from("leave_notifications")
      .select(
        `
        id,
        leave_request_id,
        recipient_id,
        sender_id,
        notification_type,
        status,
        created_at,
        approved_at,
        leave_requests (
          id,
          user_id,
          leave_type,
          start_date,
          end_date,
          reason,
          status,
          created_at,
          user:user_profiles!user_id (
            first_name,
            last_name,
            employee_id,
            role
          )
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500)

    if (actorRole !== "admin") {
      query = query.eq("recipient_id", user.id)
    }

    const { data: notifications, error } = await query
    if (error) throw error

    const formatted = (notifications || []).map((notif: any) => {
      const leave = notif.leave_requests
      const requestUser = leave?.user
      const staffName = requestUser
        ? `${requestUser.first_name || ""} ${requestUser.last_name || ""}`.trim()
        : "Staff"

      return {
        id: notif.id,
        leave_request_id: notif.leave_request_id,
        user_id: leave?.user_id,
        staff_name: staffName,
        employee_id: requestUser?.employee_id || null,
        leave_type: leave?.leave_type,
        start_date: leave?.start_date,
        end_date: leave?.end_date,
        reason: leave?.reason,
        status: notif.status || leave?.status || "pending",
        reviewer_stage: notif.notification_type || "leave_request",
        requester_role: String(requestUser?.role || "staff"),
        created_at: notif.created_at,
      }
    })

    return NextResponse.json(formatted)
  } catch (error) {
    console.error("Error fetching leave notifications:", error)
    return NextResponse.json({ error: "Failed to fetch leave notifications" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, notificationId, reason } = await request.json()

    const { data: actorProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const actorRole = normalizeRole((actorProfile as any)?.role)
    if (!canReviewLeave(actorRole)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { data: notification } = await admin
      .from("leave_notifications")
      .select("id, leave_request_id, recipient_id, notification_type, status")
      .eq("id", notificationId)
      .maybeSingle()

    if (!notification?.leave_request_id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    if (actorRole !== "admin" && String(notification.recipient_id || "") !== String(user.id)) {
      return NextResponse.json({ error: "Permission denied for this request" }, { status: 403 })
    }

    const { data: leaveRequest } = await admin
      .from("leave_requests")
      .select("id, user_id, start_date, end_date, status")
      .eq("id", notification.leave_request_id)
      .maybeSingle()

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    const rejectionReason = String(reason || "").trim()
    const nowIso = new Date().toISOString()

    if (action === "dismiss" || action === "reject") {
      if (!rejectionReason) {
        return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
      }

      const { error: updateLeaveError } = await admin
        .from("leave_requests")
        .update({
          status: "rejected",
          approved_by: user.id,
          updated_at: nowIso,
        })
        .eq("id", leaveRequest.id)

      if (updateLeaveError) throw updateLeaveError

      await admin
        .from("leave_notifications")
        .update({
          status: "rejected",
          action_taken: "rejected",
          approved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("leave_request_id", leaveRequest.id)

      await admin.from("staff_notifications").insert({
        recipient_id: leaveRequest.user_id,
        title: "Leave Request Rejected",
        message: `Your leave request from ${leaveRequest.start_date} to ${leaveRequest.end_date} was rejected. Reason: ${rejectionReason}`,
        type: "leave_rejected",
        data: {
          leave_request_id: leaveRequest.id,
          rejection_reason: rejectionReason,
        },
        is_read: false,
      })

      return NextResponse.json({ success: true, message: "Leave rejected" })
    }

    if (action !== "approve") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const isHodReview = HOD_REVIEW_ROLES.has(actorRole) || notification.notification_type === "leave_request_hod"
    const isHrReview = HR_REVIEW_ROLES.has(actorRole) || notification.notification_type === "leave_request_hr"

    if (isHodReview && !isHrReview) {
      await admin
        .from("leave_notifications")
        .update({
          status: "approved",
          action_taken: "approved",
          approved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", notification.id)

      const { data: hrProfiles } = await admin
        .from("user_profiles")
        .select("id")
        .in("role", ["hr_officer", "manager_hr", "director_hr", "hr_director"])
        .eq("is_active", true)

      const hrIds = Array.from(new Set((hrProfiles || []).map((row: any) => String(row.id)).filter(Boolean)))

      if (hrIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: "HOD approved. No HR recipients configured yet.",
        })
      }

      const hrRows = hrIds.map((hrId) => ({
        leave_request_id: leaveRequest.id,
        recipient_id: hrId,
        sender_id: user.id,
        notification_type: "leave_request_hr",
        message: `HOD approved leave request (${leaveRequest.start_date} to ${leaveRequest.end_date}). HR final decision required.`,
        status: "pending_hr",
      }))

      const { error: hrNotifError } = await admin.from("leave_notifications").insert(hrRows)
      if (hrNotifError) throw hrNotifError

      return NextResponse.json({ success: true, message: "HOD approved and escalated to HR" })
    }

    if (isHrReview || actorRole === "admin") {
      const { error: updateError } = await admin
        .from("leave_requests")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", leaveRequest.id)

      if (updateError) throw updateError

      await admin
        .from("leave_notifications")
        .update({
          status: "approved",
          action_taken: "approved",
          approved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("leave_request_id", leaveRequest.id)

      await admin
        .from("user_profiles")
        .update({
          leave_status: "on_leave",
          leave_start_date: leaveRequest.start_date,
          leave_end_date: leaveRequest.end_date,
        })
        .eq("id", leaveRequest.user_id)

      await admin.from("staff_notifications").insert({
        recipient_id: leaveRequest.user_id,
        title: "Leave Request Approved",
        message: `Your leave request from ${leaveRequest.start_date} to ${leaveRequest.end_date} has been approved by HR.`,
        type: "leave_approved",
        data: { leave_request_id: leaveRequest.id },
        is_read: false,
      })

      return NextResponse.json({ success: true, message: "Leave approved by HR" })
    }

    return NextResponse.json({ error: "Unsupported approval stage" }, { status: 400 })
  } catch (error) {
    console.error("Error processing leave notification:", error)
    return NextResponse.json({ error: "Failed to process leave notification" }, { status: 500 })
  }
}
