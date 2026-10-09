import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { sendWebPushToUsers } from "@/lib/web-push"
import { chunk, resolveYetToApply, type YetToApplyScope } from "@/lib/yet-to-apply"

export const REMINDER_NOTIFICATION_TYPE = "annual_leave_reminder"
const COOLDOWN_MS = 30 * 60 * 1000
const MAX_MESSAGE_LENGTH = 400

function senderLabelFor(scope: YetToApplyScope) {
  return scope === "regional" ? "Regional HR Office" : "Head of Department"
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const scope = String(body?.scope || "") as YetToApplyScope
    if (scope !== "regional" && scope !== "hod") {
      return NextResponse.json({ error: "scope must be 'regional' or 'hod'" }, { status: 400 })
    }

    const requestedIds: string[] | null = Array.isArray(body?.staff_ids)
      ? body.staff_ids.map(String).filter(Boolean)
      : null
    const customMessage = String(body?.message || "").trim().slice(0, MAX_MESSAGE_LENGTH)

    const admin = await createAdminClient()
    const resolution = await resolveYetToApply(admin, user.id, scope, body?.year)
    if (!resolution.ok) return NextResponse.json({ error: resolution.error }, { status: resolution.status })

    // Only staff who are genuinely still outstanding inside the sender's own
    // scope can be reminded; anything else in the payload is ignored.
    const pendingById = new Map<string, any>(resolution.pending.map((row) => [String(row.id), row]))
    const targets = requestedIds ? requestedIds.filter((id) => pendingById.has(id)) : Array.from(pendingById.keys())
    if (targets.length === 0) {
      return NextResponse.json({ error: "There are no staff to remind. Everyone selected has already applied." }, { status: 400 })
    }

    // Skip anyone this sender already reminded very recently to avoid spamming.
    const since = new Date(Date.now() - COOLDOWN_MS).toISOString()
    const recentlyReminded = new Set<string>()
    for (const part of chunk(targets)) {
      const { data: recent, error: recentError } = await admin
        .from("staff_notifications")
        .select("recipient_id")
        .eq("sender_id", user.id)
        .eq("notification_type", REMINDER_NOTIFICATION_TYPE)
        .gte("created_at", since)
        .in("recipient_id", part)
      if (recentError) throw recentError
      for (const row of recent || []) recentlyReminded.add(String(row.recipient_id))
    }
    const recipients = targets.filter((id) => !recentlyReminded.has(id))
    if (recipients.length === 0) {
      return NextResponse.json({
        sent: 0,
        skipped_recent: targets.length,
        message: "These staff were already reminded in the last 30 minutes.",
      })
    }

    const sender = resolution.senderProfile
    const senderName = `${sender.first_name || ""} ${sender.last_name || ""}`.trim() || senderLabelFor(scope)
    const senderLabel = senderLabelFor(scope)
    const year = resolution.year
    const message =
      customMessage ||
      `You have not yet submitted your ${year} annual leave request. Please submit it now so it can be reviewed and processed.`

    const now = new Date().toISOString()
    const rows = recipients.map((recipientId) => ({
      recipient_id: recipientId,
      sender_id: user.id,
      sender_role: String(sender.role || "").slice(0, 50) || "staff",
      sender_label: senderLabel.slice(0, 100),
      message,
      notification_type: REMINDER_NOTIFICATION_TYPE,
      is_read: false,
      created_at: now,
      action_url: "/dashboard/leave-management",
      data: { year, scope, sender_name: senderName, flash: true },
    }))

    let inserted = 0
    for (const part of chunk(rows, 100)) {
      const { error: insertError } = await admin.from("staff_notifications").insert(part)
      if (insertError) throw insertError
      inserted += part.length
    }

    let pushSent = 0
    try {
      const push = await sendWebPushToUsers(recipients, {
        title: `Annual leave reminder from ${senderLabel}`,
        body: message,
        url: "/dashboard/leave-management",
        tag: "annual-leave-reminder",
        kind: "leave-reminder",
        requireInteraction: true,
      })
      pushSent = push.sent
    } catch (pushError) {
      console.error("[v0] leave reminder push failed (in-app reminder still delivered):", pushError)
    }

    return NextResponse.json({
      sent: inserted,
      push_sent: pushSent,
      skipped_recent: targets.length - recipients.length,
    })
  } catch (error: any) {
    console.error("[v0] leave reminder error:", error)
    return NextResponse.json({ error: String(error?.message || "Could not send reminders") }, { status: 500 })
  }
}
