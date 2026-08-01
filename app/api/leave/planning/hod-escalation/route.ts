import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

const CRON_KEY = process.env.CRON_API_KEY || "dev-key"

const ESCALATION_TIERS = [
  { min_days: 3,  label: "⏰ Reminder",  notify_hod: true,  notify_hr_office: false, notify_hr_exec: false },
  { min_days: 7,  label: "⚠️ Escalation", notify_hod: true,  notify_hr_office: true,  notify_hr_exec: false },
  { min_days: 10, label: "🚨 URGENT",     notify_hod: true,  notify_hr_office: true,  notify_hr_exec: true },
]

/** POST — cron trigger: escalate overdue HOD/RM endorsements. */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key")
  if (process.env.NODE_ENV === "production" && apiKey !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = await createAdminClient()
    const now = new Date()

    // Fetch all pending-HOD-endorsement leave plan requests
    const { data: pendingRequests, error } = await admin
      .from("leave_plan_requests")
      .select(`
        id, staff_name, leave_type_key, leave_year_period, created_at, submitted_at,
        user_id,
        status
      `)
      .in("status", ["pending_hod_review", "pending_manager_review"])
      .order("created_at", { ascending: true })

    if (error) throw error
    if (!pendingRequests || pendingRequests.length === 0) {
      return NextResponse.json({ success: true, escalated: 0 })
    }

    // Fetch HR Leave Office and HR Executive users for escalation targets
    const { data: hrStaff } = await admin
      .from("user_profiles")
      .select("id, role")
      .in("role", ["hr_leave_office", "director_hr", "manager_hr", "hr_executive"])
      .eq("is_active", true)

    const hrOfficeIds = (hrStaff || []).filter((u: any) => u.role === "hr_leave_office").map((u: any) => u.id)
    const hrExecIds = (hrStaff || []).filter((u: any) => ["director_hr", "manager_hr", "hr_executive"].includes(u.role)).map((u: any) => u.id)

    const notifications: any[] = []
    let escalated = 0

    for (const req of pendingRequests) {
      const submittedAt = new Date(req.submitted_at || req.created_at)
      const daysPending = Math.floor((now.getTime() - submittedAt.getTime()) / 86400000)

      const tier = [...ESCALATION_TIERS].reverse().find(t => daysPending >= t.min_days)
      if (!tier) continue

      // Find the HOD/manager linked to this staff
      const { data: hodLink } = await admin
        .from("hod_staff_linkages")
        .select("hod_id")
        .eq("staff_id", req.user_id)
        .limit(1)
        .maybeSingle()

      const hodId = hodLink?.hod_id
      const label = req.leave_type_key === "annual" ? "Annual Leave Plan" : "Leave Plan"
      const msg = `${tier.label}: ${req.staff_name}'s ${label} has been pending your endorsement for ${daysPending} day${daysPending !== 1 ? "s" : ""}. Please review and endorse in Leave Planning immediately.`

      if (tier.notify_hod && hodId) {
        notifications.push({
          recipient_id: hodId,
          type: "hod_endorsement_overdue",
          title: `${tier.label}: Pending Leave Plan Endorsement`,
          message: msg,
          data: { leave_plan_request_id: req.id, days_pending: daysPending, staff_name: req.staff_name },
          is_read: false,
        })
      }

      if (tier.notify_hr_office) {
        hrOfficeIds.forEach((hrId: string) => {
          notifications.push({
            recipient_id: hrId,
            type: "hod_endorsement_escalation",
            title: `⚠️ Escalation: ${req.staff_name} — ${daysPending}d Pending`,
            message: `HOD has not endorsed ${req.staff_name}'s ${label} after ${daysPending} days. Request: ${req.id?.slice(0, 8)}. Consider manual intervention or reminder call.`,
            data: { leave_plan_request_id: req.id, days_pending: daysPending, staff_name: req.staff_name, tier: "hr_office" },
            is_read: false,
          })
        })
      }

      if (tier.notify_hr_exec) {
        hrExecIds.forEach((hrId: string) => {
          notifications.push({
            recipient_id: hrId,
            type: "hod_endorsement_critical_escalation",
            title: `🚨 CRITICAL: ${req.staff_name} — ${daysPending}d Blocked`,
            message: `URGENT: ${req.staff_name}'s ${label} has been stuck for ${daysPending} days without HOD endorsement. HR Executive intervention required. Ref: ${req.id?.slice(0, 8)}`,
            data: { leave_plan_request_id: req.id, days_pending: daysPending, staff_name: req.staff_name, tier: "hr_exec" },
            is_read: false,
          })
        })
      }

      escalated++
    }

    if (notifications.length > 0) {
      const BATCH = 50
      for (let i = 0; i < notifications.length; i += BATCH) {
        await admin.from("staff_notifications").insert(notifications.slice(i, i + BATCH))
      }
    }

    return NextResponse.json({ success: true, escalated, notifications_sent: notifications.length })
  } catch (err) {
    console.error("[v0] HOD escalation error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
