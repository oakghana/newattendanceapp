import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { DEFAULT_LEAVE_TYPES } from "@/lib/leave-policy"

const LEADERSHIP_ROLES = new Set(["manager_hr", "director_hr", "hr_leave_office", "admin", "hr_director"])

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

function getDefaultLeaveYearPeriod(referenceDate: Date = new Date()) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  // Leave cycle runs October -> September.
  if (month >= 9) return `${year}/${year + 1}`
  return `${year - 1}/${year}`
}

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const normalizedRole = normalizeRole((profile as any)?.role)
    const showLeadershipMetrics = LEADERSHIP_ROLES.has(normalizedRole)

    // Detect active period from policy (fallback to October-based cycle)
    let activePeriod = getDefaultLeaveYearPeriod()

    // Fetch entitlements from policy catalog
    let entitlements: Record<string, { label: string; entitlement: number }> = {}
    try {
      const { data: policyRows } = await supabase
        .from("leave_policy_catalog")
        .select("leave_type_key, leave_type_label, entitlement_days, is_enabled, is_active_period, leave_year_period")
        .eq("is_enabled", true)

      if (policyRows && policyRows.length > 0) {
        // Prefer the active period rows; fall back to any if none flagged active.
        const activeRows = policyRows.filter((r: any) => r.is_active_period)
        const rows = activeRows.length > 0 ? activeRows : policyRows
        if (activeRows.length > 0) {
          activePeriod = String(activeRows[0]?.leave_year_period || activePeriod)
        }
        rows.forEach((r: any) => {
          entitlements[r.leave_type_key] = {
            label: r.leave_type_label,
            entitlement: Number(r.entitlement_days || 0),
          }
        })
      }
    } catch {
      // Policy table may not exist — use defaults
    }

    // Fill any missing types from defaults
    if (Object.keys(entitlements).length === 0) {
      DEFAULT_LEAVE_TYPES.forEach((t) => {
        entitlements[t.leaveTypeKey] = { label: t.leaveTypeLabel, entitlement: t.entitlementDays }
      })
    }

    // V2 source of truth: leave planning requests finalized by HR approver.
    const { data: v2ApprovedRequests } = await admin
      .from("leave_plan_requests")
      .select(
        "leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, requested_days, adjusted_days, status",
      )
      .eq("user_id", user.id)
      .eq("status", "hr_approved")

    // Legacy fallback source for older leave module records.
    const { data: legacyApprovedRequests } = await admin
      .from("leave_requests")
      .select("leave_type, start_date, end_date, status")
      .eq("user_id", user.id)
      .in("status", ["approved", "active"])

    // Compute days used per type.
    const usageMap: Record<string, number> = {}

    for (const req of v2ApprovedRequests || []) {
      const key = String((req as any).leave_type_key || "annual").toLowerCase().trim()
      const adjustedDays = Number((req as any).adjusted_days || 0)
      const start = String((req as any).adjusted_start_date || (req as any).preferred_start_date || "")
      const end = String((req as any).adjusted_end_date || (req as any).preferred_end_date || "")
      const requestedDays = Number((req as any).requested_days || 0)

      const days =
        adjustedDays > 0 ? adjustedDays : requestedDays > 0 ? requestedDays : countCalendarDays(start, end)

      usageMap[key] = (usageMap[key] || 0) + days
    }

    for (const req of legacyApprovedRequests || []) {
      const key = String(req.leave_type || "annual").toLowerCase().trim()
      const days = countCalendarDays(req.start_date, req.end_date)
      usageMap[key] = (usageMap[key] || 0) + days
    }

    // Leadership metrics: count how many staff are currently on each leave type.
    const activeStaffCountByType: Record<string, number> = {}
    if (showLeadershipMetrics) {
      const today = new Date().toISOString().slice(0, 10)
      const uniqueByType: Record<string, Set<string>> = {}

      const { data: activeV2 } = await admin
        .from("leave_plan_requests")
        .select("id, user_id, leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, status, is_archived")
        .eq("status", "hr_approved")
        .eq("is_archived", false)
        .lte("preferred_start_date", today)
        .gte("preferred_end_date", today)

      for (const req of activeV2 || []) {
        const key = String((req as any).leave_type_key || "annual").toLowerCase().trim()
        const start = String((req as any).adjusted_start_date || (req as any).preferred_start_date || "")
        const end = String((req as any).adjusted_end_date || (req as any).preferred_end_date || "")
        if (!isDateWithinRange(today, start, end)) continue
        if (!uniqueByType[key]) uniqueByType[key] = new Set()
        uniqueByType[key].add(String((req as any).user_id || (req as any).id || "unknown"))
      }

      const { data: activeLegacy } = await admin
        .from("leave_requests")
        .select("id, user_id, leave_type, start_date, end_date, status")
        .in("status", ["approved", "active"])
        .lte("start_date", today)
        .gte("end_date", today)

      for (const req of activeLegacy || []) {
        const key = String((req as any).leave_type || "annual").toLowerCase().trim()
        const start = String((req as any).start_date || "")
        const end = String((req as any).end_date || "")
        if (!isDateWithinRange(today, start, end)) continue
        if (!uniqueByType[key]) uniqueByType[key] = new Set()
        uniqueByType[key].add(String((req as any).user_id || (req as any).id || "unknown"))
      }

      Object.entries(uniqueByType).forEach(([key, set]) => {
        activeStaffCountByType[key] = set.size
      })
    }

    // Build the response array, ordered by entitlement descending
    const balances = Object.entries(entitlements).map(([key, { label, entitlement }]) => {
      const used = usageMap[key] || 0
      const remaining = Math.max(0, entitlement - used)
      return {
        key,
        label,
        entitlement,
        used,
        remaining,
        active_staff_count: activeStaffCountByType[key] || 0,
      }
    })

    balances.sort((a, b) => b.entitlement - a.entitlement)

    const totalActiveStaff = showLeadershipMetrics
      ? Object.values(activeStaffCountByType).reduce((sum, count) => sum + count, 0)
      : 0

    return NextResponse.json({ balances, period: activePeriod, showLeadershipMetrics, totalActiveStaff })
  } catch (err) {
    console.error("[leave/balance]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** Count calendar days (inclusive) between two ISO date strings. */
function countCalendarDays(start: string, end: string): number {
  try {
    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
  } catch {
    return 0
  }
}

function isDateWithinRange(dateText: string, startText: string, endText: string) {
  const d = new Date(`${dateText}T00:00:00`)
  const s = new Date(`${startText}T00:00:00`)
  const e = new Date(`${endText}T00:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false
  return d >= s && d <= e
}
