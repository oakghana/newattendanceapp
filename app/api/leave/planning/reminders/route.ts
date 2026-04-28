import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function toIsoDate(d: Date) {
  return d.toISOString().split("T")[0]
}

export async function POST() {
  try {
    const supabase = await createClient()

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
