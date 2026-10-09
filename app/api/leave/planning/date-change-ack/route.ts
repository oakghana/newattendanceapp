import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

/**
 * Staff reply to a date change made by a HOD / Regional HR Office / District
 * Officer. The reply is informational only: the supervisor's dates always
 * stand, so this route never touches the leave dates themselves.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const requestId = String(body?.leave_plan_request_id || "")
    const response = String(body?.response || "")
    const note = String(body?.note || "").trim().slice(0, 500)

    if (!requestId) return NextResponse.json({ error: "leave_plan_request_id is required." }, { status: 400 })
    if (response !== "acknowledged" && response !== "concern") {
      return NextResponse.json({ error: "response must be 'acknowledged' or 'concern'." }, { status: 400 })
    }
    if (response === "concern" && note.length < 5) {
      return NextResponse.json({ error: "Tell your supervisor briefly what the concern is." }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, date_change_ack_status")
      .eq("id", requestId)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing || String((existing as any).user_id) !== user.id) {
      return NextResponse.json({ error: "Leave request not found." }, { status: 404 })
    }
    if (!(existing as any).date_change_ack_status) {
      return NextResponse.json({ error: "No date change is waiting for your confirmation." }, { status: 409 })
    }

    const { error: updateError } = await admin
      .from("leave_plan_requests")
      .update({
        date_change_ack_status: response,
        date_change_ack_at: new Date().toISOString(),
        date_change_ack_note: response === "concern" ? note : null,
      })
      .eq("id", requestId)
    if (updateError) throw updateError

    return NextResponse.json({ success: true, status: response })
  } catch (error: any) {
    console.error("[v0] date-change-ack error:", error)
    return NextResponse.json({ error: String(error?.message || "Could not save your response.") }, { status: 500 })
  }
}
