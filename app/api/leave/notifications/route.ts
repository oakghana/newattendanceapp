import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

function canManageByScope(
  actorRole: string,
  actorDepartmentId: string,
  actorLocationId: string,
  requesterDepartmentId: string,
  requesterLocationId: string,
) {
  if (actorRole === "admin") return true
  if (actorRole === "regional_manager") {
    return Boolean(actorLocationId) && actorLocationId === requesterLocationId
  }
  if (actorRole === "department_head") {
    const sameDepartment = Boolean(actorDepartmentId) && actorDepartmentId === requesterDepartmentId
    const sameLocation = !actorLocationId || actorLocationId === requesterLocationId
    return sameDepartment && sameLocation
  }
  return false
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to check role
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const actorRole = normalizeRole((profile as any).role)
    const actorDepartmentId = String((profile as any).department_id || "")
    const actorLocationId = String((profile as any).assigned_location_id || "")

    const { data: notifications, error } = await admin
      .from("leave_notifications")
      .select(
        `
        id,
        leave_request_id,
        status,
        leave_requests (
          id,
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
      .order("created_at", { ascending: false })
      .limit(5000)

    if (error) throw error

    const requesterIds = Array.from(
      new Set((notifications || []).map((row: any) => String(row?.leave_requests?.user_id || "")).filter(Boolean)),
    )

    const { data: requesterProfiles } = requesterIds.length
      ? await admin
          .from("user_profiles")
          .select("id, department_id, assigned_location_id")
          .in("id", requesterIds)
      : ({ data: [] } as any)

    const requesterMap = new Map((requesterProfiles || []).map((row: any) => [String(row.id), row]))

    const scopedNotifications = (notifications || []).filter((notif: any) => {
      if (notif?.is_dismissed) return false
      const requesterId = String(notif?.leave_requests?.user_id || "")
      const requester = requesterMap.get(requesterId)
      const requesterDepartmentId = String((requester as any)?.department_id || "")
      const requesterLocationId = String((requester as any)?.assigned_location_id || "")

      if (actorRole === "admin") return true
      if (["regional_manager", "department_head"].includes(actorRole)) {
        return canManageByScope(
          actorRole,
          actorDepartmentId,
          actorLocationId,
          requesterDepartmentId,
          requesterLocationId,
        )
      }
      return requesterId === user.id
    })

    // Format the response
    const formattedNotifications = scopedNotifications.map((notif: any) => ({
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
      can_dismiss: actorRole !== "staff" || notif.leave_requests?.status !== "pending",
    }))

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
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, notificationId, reason } = await request.json()

    const { data: actorProfile } = await admin
      .from("user_profiles")
      .select("role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (!actorProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const actorRole = normalizeRole((actorProfile as any).role)
    const actorDepartmentId = String((actorProfile as any).department_id || "")
    const actorLocationId = String((actorProfile as any).assigned_location_id || "")

    const { data: notification } = await admin
      .from("leave_notifications")
      .select("id, leave_request_id")
      .eq("id", notificationId)
      .single()

    if (!notification?.leave_request_id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    const { data: leaveRequest } = await admin
      .from("leave_requests")
      .select("id, user_id, start_date, end_date")
      .eq("id", notification.leave_request_id)
      .single()

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    const { data: requesterProfile } = await admin
      .from("user_profiles")
      .select("department_id, assigned_location_id")
      .eq("id", leaveRequest.user_id)
      .maybeSingle()

    const requesterDepartmentId = String((requesterProfile as any)?.department_id || "")
    const requesterLocationId = String((requesterProfile as any)?.assigned_location_id || "")

    const canManage = canManageByScope(
      actorRole,
      actorDepartmentId,
      actorLocationId,
      requesterDepartmentId,
      requesterLocationId,
    )

    if (!canManage && String(leaveRequest.user_id) !== user.id) {
      return NextResponse.json({ error: "Permission denied for this request scope" }, { status: 403 })
    }

    if (action === "dismiss") {
      const { error: dismissErr } = await admin
        .from("leave_notifications")
        .update({ is_dismissed: true, status: "dismissed" })
        .eq("id", notificationId)

      if (dismissErr) throw dismissErr

      await admin
        .from("leave_requests")
        .update({
          status: "rejected",
          approved_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.leave_request_id)

      return NextResponse.json({ success: true, message: "Notification dismissed and leave request rejected" })
    }

    if (action === "approve" || action === "reject") {
      if (!["admin", "regional_manager", "department_head"].includes(actorRole)) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      const { error: updateError } = await admin
        .from("leave_requests")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          approved_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.leave_request_id)

      if (updateError) throw updateError

      await admin
        .from("leave_notifications")
        .update({ status: action === "approve" ? "approved" : "rejected", is_dismissed: false })
        .eq("id", notificationId)

      // If approved, update the user's leave status
      if (action === "approve") {
        await admin
          .from("user_profiles")
          .update({
            leave_status: "on_leave",
            leave_start_date: leaveRequest.start_date,
            leave_end_date: leaveRequest.end_date,
          })
          .eq("id", leaveRequest.user_id)
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
