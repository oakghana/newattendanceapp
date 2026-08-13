import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/leave/staff-history?userId=<uid>
// Returns the current-year and previous-year leave records for a given staff member.
// Used by HR Leave Office to view a staff member's full leave history when reviewing a request.
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    // Derive current and previous leave year periods
    const now = new Date()
    const year = now.getFullYear()
    // Leave year runs Oct–Sep; if we are before October we are in the previous year's period
    const currentPeriod = now.getMonth() >= 9
      ? `${year}/${year + 1}`
      : `${year - 1}/${year}`
    const previousPeriodYear = parseInt(currentPeriod.split("/")[0]) - 1
    const previousPeriod = `${previousPeriodYear}/${previousPeriodYear + 1}`

    const { data: records, error } = await admin
      .from("leave_plan_requests")
      .select(`
        id,
        leave_type_key,
        status,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        requested_days,
        adjusted_days,
        reason,
        leave_year_period,
        created_at,
        hod_reviewed_at,
        manager_recommendation
      `)
      .eq("user_id", userId)
      .in("leave_year_period", [currentPeriod, previousPeriod])
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching staff leave history:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const current = (records || []).filter((r: any) => r.leave_year_period === currentPeriod)
    const previous = (records || []).filter((r: any) => r.leave_year_period === previousPeriod)

    // Compute quick stats for current period
    const approvedStatuses = ["approved", "hr_approved", "hod_approved", "manager_confirmed", "hr_office_forwarded", "completed"]
    const currentApproved = current.filter((r: any) => approvedStatuses.includes(String(r.status || "")))
    const daysUsedThisYear = currentApproved.reduce((sum: number, r: any) => {
      return sum + Number(r.adjusted_days || r.requested_days || 0)
    }, 0)

    const previousApproved = previous.filter((r: any) => approvedStatuses.includes(String(r.status || "")))
    const daysUsedLastYear = previousApproved.reduce((sum: number, r: any) => {
      return sum + Number(r.adjusted_days || r.requested_days || 0)
    }, 0)

    return NextResponse.json({
      success: true,
      currentPeriod,
      previousPeriod,
      current,
      previous,
      stats: {
        currentYear: {
          total: current.length,
          approved: currentApproved.length,
          daysUsed: daysUsedThisYear,
          pending: current.filter((r: any) => ["pending", "pending_manager_review", "submitted"].includes(String(r.status || ""))).length,
        },
        previousYear: {
          total: previous.length,
          approved: previousApproved.length,
          daysUsed: daysUsedLastYear,
        },
      },
    })
  } catch (err) {
    console.error("[v0] Unhandled error in staff-history:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
