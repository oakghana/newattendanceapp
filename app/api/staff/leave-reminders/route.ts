import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { hasAppliedForYear } from "@/lib/yet-to-apply"

const REMINDER_TYPE = "annual_leave_reminder"

/** Unread annual-leave reminders for the signed-in staff member. */
export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ reminders: [] }, { status: 401 })

    const { data: rows, error } = await admin
      .from("staff_notifications")
      .select("id, message, sender_label, created_at, action_url, data")
      .eq("recipient_id", user.id)
      .eq("notification_type", REMINDER_TYPE)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(5)
    if (error) throw error
    if (!rows || rows.length === 0) return NextResponse.json({ reminders: [] })

    // A reminder is pointless once the staff member has applied, so retire it.
    if (await hasAppliedForYear(admin, user.id, (rows[0] as any)?.data?.year)) {
      await admin
        .from("staff_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", rows.map((row: any) => row.id))
      return NextResponse.json({ reminders: [] })
    }

    return NextResponse.json({ reminders: rows })
  } catch (error: any) {
    console.error("[v0] leave reminders GET error:", error)
    return NextResponse.json({ reminders: [] })
  }
}

/** Marks reminders as seen (Apply now / Remind me later). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : []
    if (ids.length === 0) return NextResponse.json({ success: true })

    const { error } = await admin
      .from("staff_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .eq("notification_type", REMINDER_TYPE)
      .in("id", ids)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] leave reminders POST error:", error)
    return NextResponse.json({ error: "Could not update reminders." }, { status: 500 })
  }
}
