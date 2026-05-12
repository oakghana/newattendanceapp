import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { notifyLeaveResumeReminder } from "@/lib/workflow-emails"

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, days: number) {
  const next = new Date(d)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function parseDateOnly(value: string) {
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

async function isAuthorized(request: NextRequest, admin: any) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, source: "cron" as const }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return { ok: false, source: "none" as const }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const role = normalizeRole((profile as any)?.role)
  const allowed = new Set([
    "admin",
    "hr",
    "hr_office",
    "hr_officer",
    "leave_admin",
    "manager_hr",
    "director_hr",
    "hr_director",
  ])

  return { ok: allowed.has(role), source: "user" as const }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const auth = await isAuthorized(request, admin)
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const today = startOfDay(new Date())
    const targetResumeDate = addDays(today, 5)
    const targetResumeDateText = dateOnly(targetResumeDate)

    const { data: approvedRows, error: approvedError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, leave_type_key, adjusted_end_date, preferred_end_date, status, is_archived")
      .eq("status", "hr_approved")
      .eq("is_archived", false)

    if (approvedError) throw approvedError

    const candidates = (approvedRows || []).flatMap((row: any) => {
      const endDateText = String(row?.adjusted_end_date || row?.preferred_end_date || "")
      const endDate = parseDateOnly(endDateText)
      if (!endDate) return []
      const resumeDate = addDays(endDate, 1)
      if (dateOnly(resumeDate) !== targetResumeDateText) return []
      return [{
        id: String(row.id),
        user_id: String(row.user_id || ""),
        leave_type_key: String(row.leave_type_key || "annual"),
        end_date: endDateText,
        resume_date: targetResumeDateText,
      }]
    })

    if (!candidates.length) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, target_resume_date: targetResumeDateText, source: auth.source })
    }

    const userIds = Array.from(new Set(candidates.map((c: any) => c.user_id).filter(Boolean)))
    const { data: users } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id")
      .in("id", userIds)

    const userMap = new Map((users || []).map((u: any) => [String(u.id), u]))

    const { data: sentTodayRows } = await admin
      .from("staff_notifications")
      .select("id, data, created_at")
      .eq("type", "leave_resume_reminder_5days")
      .gte("created_at", today.toISOString())

    const sentTodayKeys = new Set(
      (sentTodayRows || []).map((row: any) => {
        const reqId = String(row?.data?.leave_plan_request_id || "")
        const resumeDate = String(row?.data?.resume_date || "")
        return `${reqId}:${resumeDate}`
      }),
    )

    let sent = 0
    let skipped = 0

    for (const item of candidates) {
      const dedupeKey = `${item.id}:${item.resume_date}`
      if (sentTodayKeys.has(dedupeKey)) {
        skipped += 1
        continue
      }

      const profile = userMap.get(item.user_id)
      const staffName = [
        String((profile as any)?.first_name || "").trim(),
        String((profile as any)?.last_name || "").trim(),
      ].filter(Boolean).join(" ") || String((profile as any)?.employee_id || "Staff")

      await notifyLeaveResumeReminder(admin, {
        leavePlanRequestId: item.id,
        staffUserId: item.user_id,
        staffName,
        leaveType: item.leave_type_key,
        endDate: item.end_date,
        resumeDate: item.resume_date,
        daysLeft: 5,
      })

      await admin.from("staff_notifications").insert({
        recipient_id: item.user_id,
        type: "leave_resume_reminder_5days",
        title: "Resume Reminder: 5 Days Left",
        message: `Your approved leave ends on ${item.end_date}. You are expected to resume on ${item.resume_date}.`,
        data: {
          leave_plan_request_id: item.id,
          resume_date: item.resume_date,
          leave_end_date: item.end_date,
          days_left: 5,
        },
        is_read: false,
      }).then(() => {}).catch(() => {})

      sent += 1
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      target_resume_date: targetResumeDateText,
      source: auth.source,
    })
  } catch (error) {
    console.error("[leave/reminders/resume-five-days] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send leave resume reminders" },
      { status: 500 },
    )
  }
}
