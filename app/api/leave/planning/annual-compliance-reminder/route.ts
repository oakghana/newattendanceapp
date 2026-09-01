import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const CRON_KEY = process.env.CRON_API_KEY || "dev-key"

function getActiveLeaveYearPeriod(ref: Date = new Date()) {
  const year = ref.getFullYear()
  return ref.getMonth() >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

/** Days before Oct 1 to start the compliance window. */
const COMPLIANCE_WINDOW_DAYS = 14

function isInComplianceWindow(today: Date = new Date()): boolean {
  const year = today.getFullYear()
  const sep1 = new Date(year, 9, 1) // Oct 1
  const windowStart = new Date(sep1)
  windowStart.setDate(windowStart.getDate() - COMPLIANCE_WINDOW_DAYS)
  return today >= windowStart && today < sep1
}

function daysUntilSep1(today: Date = new Date()): number {
  const sep1 = new Date(today.getFullYear(), 9, 1)
  return Math.max(0, Math.ceil((sep1.getTime() - today.getTime()) / 86400000))
}

/** GET — check current user's compliance status (for UI banner). */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const today = new Date()
    const inWindow = isInComplianceWindow(today)
    const daysLeft = daysUntilSep1(today)
    const currentPeriod = getActiveLeaveYearPeriod(today)

    if (!inWindow) {
      return NextResponse.json({ in_window: false, days_until_oct1: daysLeft, current_period: currentPeriod, has_submission: null })
    }

    // Check if the user already submitted an annual leave plan for the current cycle
    const { data: existing } = await supabase
      .from("leave_plan_requests")
      .select("id, status, created_at")
      .eq("user_id", user.id)
      .eq("leave_type_key", "annual")
      .eq("leave_year_period", currentPeriod)
      .not("status", "in", '("rejected","hr_rejected","cancelled")')
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      in_window: true,
      days_until_oct1: daysLeft,
      current_period: currentPeriod,
      has_submission: !!existing,
      submission: existing ?? null,
    })
  } catch (err) {
    console.error("[v0] Annual compliance GET error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

/** POST — cron trigger: send daily reminders to non-compliant staff. */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key")
  if (process.env.NODE_ENV === "production" && apiKey !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const today = new Date()
    if (!isInComplianceWindow(today)) {
      return NextResponse.json({ success: true, skipped: true, reason: "Outside compliance window" })
    }

    const daysLeft = daysUntilSep1(today)
    const currentPeriod = getActiveLeaveYearPeriod(today)
    const admin = await createAdminClient()

    // Find all active staff
    const { data: allStaff } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, role")
      .eq("is_active", true)
      .in("role", ["staff", "senior_staff", "department_head", "regional_manager", "loan_office", "accounts_loan_office"])

    if (!allStaff || allStaff.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "No eligible staff" })
    }

    // Find staff who already submitted for this period
    const { data: submitted } = await admin
      .from("leave_plan_requests")
      .select("user_id")
      .eq("leave_type_key", "annual")
      .eq("leave_year_period", currentPeriod)
      .not("status", "in", '("rejected","hr_rejected","cancelled")')

    const submittedUserIds = new Set((submitted || []).map((r: any) => r.user_id))

    const needReminder = allStaff.filter((s: any) => !submittedUserIds.has(s.id))
    if (needReminder.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "All staff compliant" })
    }

    const urgency = daysLeft <= 3 ? "🚨 URGENT" : daysLeft <= 7 ? "⚠️ REMINDER" : "📋 NOTICE"

    const notifications = needReminder.map((s: any) => ({
      recipient_id: s.id,
      type: "annual_leave_compliance_reminder",
      title: `${urgency}: Annual Leave Plan Required`,
      message: `📅 You have ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left to submit your Annual Leave Plan for ${currentPeriod}. Submissions close on 1st October. Your leave grant payment processing depends on an approved plan — submit now via Leave Planning.`,
      data: { leave_year_period: currentPeriod, days_until_deadline: daysLeft, deadline: "October 1" },
      is_read: false,
    }))

    const BATCH = 50
    let totalSent = 0
    for (let i = 0; i < notifications.length; i += BATCH) {
      const { error } = await admin.from("staff_notifications").insert(notifications.slice(i, i + BATCH))
      if (!error) totalSent += Math.min(BATCH, notifications.length - i)
    }

    return NextResponse.json({ success: true, sent: totalSent, days_until_deadline: daysLeft, period: currentPeriod })
  } catch (err) {
    console.error("[v0] Annual compliance POST error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
