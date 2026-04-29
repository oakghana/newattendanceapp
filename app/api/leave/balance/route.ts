import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_LEAVE_TYPES } from "@/lib/leave-policy"

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Detect active period from policy (fallback to current year)
    const currentYear = new Date().getFullYear()
    const activePeriod = `${currentYear}/${currentYear + 1}`

    // Fetch entitlements from policy catalog
    let entitlements: Record<string, { label: string; entitlement: number }> = {}
    try {
      const { data: policyRows } = await supabase
        .from("leave_policy_catalog")
        .select("leave_type_key, leave_type_label, entitlement_days, is_enabled, is_active_period")
        .eq("is_enabled", true)

      if (policyRows && policyRows.length > 0) {
        // Prefer the active period rows; fall back to any if none flagged active
        const activeRows = policyRows.filter((r: any) => r.is_active_period)
        const rows = activeRows.length > 0 ? activeRows : policyRows
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

    // Fetch user's leave_requests for this period (approved + pending count toward usage)
    const { data: requests } = await supabase
      .from("leave_requests")
      .select("leave_type, start_date, end_date, status")
      .eq("user_id", user.id)
      .in("status", ["approved", "pending", "active"])

    // Compute days used per type (business days approximation: count calendar days excl. weekends)
    const usageMap: Record<string, number> = {}
    for (const req of requests || []) {
      const key = String(req.leave_type || "annual").toLowerCase().trim()
      const days = countCalendarDays(req.start_date, req.end_date)
      usageMap[key] = (usageMap[key] || 0) + days
    }

    // Build the response array, ordered by entitlement descending
    const balances = Object.entries(entitlements).map(([key, { label, entitlement }]) => {
      const used = usageMap[key] || 0
      const remaining = Math.max(0, entitlement - used)
      return { key, label, entitlement, used, remaining }
    })

    balances.sort((a, b) => b.entitlement - a.entitlement)

    return NextResponse.json({ balances, period: activePeriod })
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
