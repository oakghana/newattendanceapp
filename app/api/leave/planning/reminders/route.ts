import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { annualLeaveProcessingReminderAt, annualLeaveProcessingOpensAt } from "@/lib/annual-leave-processing"

function toIsoDate(d: Date) {
  return d.toISOString().split("T")[0]
}

export async function POST() {
  try {
    const supabase = await createClient()

    const admin = await createAdminClient()
    const today = new Date()
    const { data: annualRequests } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, preferred_start_date, preferred_end_date, workflow_route, status")
      .in("leave_type_key", ["annual", "annual_leave"])
      .in("status", ["pending_hod_review", "pending_regional_hr_review", "pending_regional_hr_office_review", "pending_hr_leave_processing", "hr_office_forwarded", "hod_approved"])
    const promptDate = toIsoDate(today)
    const dueForPrompt = (annualRequests || []).filter((request: any) => {
      const reminderAt = annualLeaveProcessingReminderAt(request.preferred_start_date)
      return Boolean(reminderAt && toIsoDate(reminderAt) === promptDate)
    })
    if (dueForPrompt.length) {
      const { data: reviewers } = await admin.from("user_profiles").select("id, role, region_id").eq("is_active", true).in("role", ["hr", "hr_office", "hr_leave_office", "regional_hr", "regional_hr_office", "regional_hr_leave_office", "regional_leave_office"])
      const notifications: any[] = []
      for (const request of dueForPrompt) {
        const regional = String(request.workflow_route || "").toLowerCase() === "regional"
        const eligible = (reviewers || []).filter((reviewer: any) => regional ? String(reviewer.role || "").toLowerCase().includes("regional") : !String(reviewer.role || "").toLowerCase().includes("regional"))
        for (const reviewer of eligible) notifications.push({ recipient_id: reviewer.id, type: "annual_leave_processing_prompt", title: "Annual Leave Processing Opens Soon", message: `Annual leave beginning ${request.preferred_start_date} becomes available for ${regional ? "Regional HR" : "HR Leave Office"} processing in two weeks. Please prepare to review and process the request.`, data: { leave_plan_request_id: request.id, start_date: request.preferred_start_date, processing_opens: toIsoDate(annualLeaveProcessingOpensAt(request.preferred_start_date) || new Date("invalid")) }, is_read: false })
      }
      if (notifications.length) await admin.from("staff_notifications").insert(notifications)
    }

    const target = new Date()
    target.setDate(target.getDate() + 7)
    const targetDate = toIsoDate(target)

    const { data: rows, error } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, preferred_start_date, preferred_end_date")
      .eq("status", "hr_approved")
      .eq("preferred_start_date", targetDate)
      .is("reminder_sent_at", null)

    if (error) {
      throw error
    }

    const items = rows || []
    if (items.length === 0) {
      return NextResponse.json({ success: true, remindersSent: 0 })
    }

    const notifPayload = items.map((item: any) => ({
      recipient_id: item.user_id,
      type: "leave_plan_weekly_reminder",
      title: "Leave Starts In One Week",
      message: `Your approved leave starts on ${item.preferred_start_date}. Prepare for handover and confirm readiness.`,
      data: {
        leave_plan_request_id: item.id,
        start_date: item.preferred_start_date,
        end_date: item.preferred_end_date,
      },
      is_read: false,
    }))

    const { error: notifError } = await supabase.from("staff_notifications").insert(notifPayload)
    if (notifError) {
      throw notifError
    }

    const ids = items.map((x: any) => x.id)
    const { error: updateError } = await supabase
      .from("leave_plan_requests")
      .update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("id", ids)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, remindersSent: items.length })
  } catch (error) {
    console.error("[v0] Leave planning reminder dispatch error:", error)
    return NextResponse.json({ error: "Failed to send leave reminders." }, { status: 500 })
  }
}
