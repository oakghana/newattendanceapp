import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { notifyLeaveResumeReminder } from "@/lib/workflow-emails"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const body = await request.json()
    const { staff_id, staff_name } = body

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is HR/Leave Office
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (!["admin", "hr", "hr_office", "hr_officer", "hr_leave_office", "manager_hr", "director_hr"].includes(userRole)) {
      return NextResponse.json({ error: "Only HR staff can send reminders" }, { status: 403 })
    }

    // Get staff's upcoming leave
    const { data: leave } = await admin
      .from("leave_plan_requests")
      .select("id, leave_type_key, adjusted_end_date, preferred_end_date")
      .eq("user_id", staff_id)
      .eq("status", "hr_approved")
      .eq("is_archived", false)
      .order("adjusted_end_date", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!leave) {
      return NextResponse.json({ error: "No active approved leave found for this staff" }, { status: 404 })
    }

    const endDate = String(leave?.adjusted_end_date || leave?.preferred_end_date || "")
    const resumeDate = new Date(endDate)
    resumeDate.setDate(resumeDate.getDate() + 1)

    // Send notification
    try {
      await notifyLeaveResumeReminder(admin, {
        leavePlanRequestId: String(leave.id),
        staffUserId: staff_id,
        staffName: staff_name,
        leaveType: String(leave.leave_type_key || "Annual Leave"),
        endDate,
        resumeDate: resumeDate.toISOString().split("T")[0],
        daysLeft: Math.max(0, Math.floor((resumeDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
      })
    } catch (emailError) {
      console.error("[v0] Email notification failed, but continuing:", emailError)
    }

    // Create notification record
    const { error: notifError } = await admin
      .from("staff_notifications")
      .insert({
        recipient_id: staff_id,
        type: "leave_resume_manual_reminder",
        title: "Return to Work Reminder",
        message: `Reminder: Your approved leave ends on ${endDate}. You are expected to resume on ${resumeDate.toISOString().split("T")[0]}.`,
        data: {
          leave_id: leave.id,
          leave_type: leave.leave_type_key,
          end_date: endDate,
          resume_date: resumeDate.toISOString().split("T")[0],
          sent_by: user.id,
        },
        is_read: false,
      })
    if (notifError) console.error("[v0] Notification creation failed:", notifError) // Ignore if fails

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${staff_name}`,
    })
  } catch (error) {
    console.error("[leave/send-reminder] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminder" },
      { status: 500 },
    )
  }
}
