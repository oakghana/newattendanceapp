import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_LEAVE_TYPES, getLeaveYearPeriods } from "@/lib/leave-policy"
import { isHrDepartment } from "@/lib/leave-planning"

function isSchemaMissing(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "").toLowerCase()
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    code === "PGRST108" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("relationship")
  )
}

function fallbackPolicy() {
  return {
    activePeriod: "2026/2027",
    periods: getLeaveYearPeriods(2026, 10),
    leaveTypes: DEFAULT_LEAVE_TYPES,
    readOnly: true,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("leave_policy_catalog")
      .select("leave_year_period, leave_type_key, leave_type_label, entitlement_days, is_enabled, is_active_period, sort_order")
      .order("leave_year_period", { ascending: true })
      .order("sort_order", { ascending: true })

    if (error) {
      if (isSchemaMissing(error)) {
        return NextResponse.json(fallbackPolicy())
      }
      throw error
    }

    const rows = data || []
    if (rows.length === 0) {
      return NextResponse.json(fallbackPolicy())
    }

    const periods = getLeaveYearPeriods(2026, 10)
    const activePeriodFromDb = rows.find((r: any) => r.is_active_period)?.leave_year_period || "2026/2027"
    const periodMap = new Map(periods.map((p) => [p.value, { ...p, active: p.value === activePeriodFromDb }]))

    const leaveTypes = rows
      .filter((r: any) => r.leave_year_period === activePeriodFromDb && r.is_enabled)
      .map((r: any) => ({
        leaveTypeKey: r.leave_type_key,
        leaveTypeLabel: r.leave_type_label,
        entitlementDays: r.entitlement_days,
        leaveYearPeriod: r.leave_year_period,
        isEnabled: r.is_enabled,
      }))

    return NextResponse.json({
      activePeriod: activePeriodFromDb,
      periods: Array.from(periodMap.values()),
      leaveTypes,
      readOnly: false,
    })
  } catch (error) {
    console.error("[v0] Leave policy GET error:", error)
    return NextResponse.json({ error: "Failed to load leave policy" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const canManagePolicy =
      profile.role === "admin" ||
      (profile.role === "department_head" &&
        isHrDepartment((profile as any)?.departments?.name, (profile as any)?.departments?.code))

    if (!canManagePolicy) {
      return NextResponse.json({ error: "Only Admin and HR Head of Department can update leave policy." }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (action === "upsert_leave_type") {
      const { leaveYearPeriod, leaveTypeKey, leaveTypeLabel, entitlementDays, isEnabled, sortOrder } = body

      if (!leaveYearPeriod || !leaveTypeKey || !leaveTypeLabel || typeof entitlementDays !== "number") {
        return NextResponse.json({ error: "Missing required leave type policy fields." }, { status: 400 })
      }

      const { error } = await supabase
        .from("leave_policy_catalog")
        .upsert({
          leave_year_period: leaveYearPeriod,
          leave_type_key: String(leaveTypeKey).toLowerCase().trim(),
          leave_type_label: String(leaveTypeLabel).trim(),
          entitlement_days: entitlementDays,
          is_enabled: isEnabled !== false,
          sort_order: typeof sortOrder === "number" ? sortOrder : 100,
          updated_at: new Date().toISOString(),
          created_by: user.id,
        })

      if (error) {
        if (isSchemaMissing(error)) {
          return NextResponse.json(
            {
              error: "Leave policy schema missing. Run migration script 039_leave_policy_catalog.sql.",
              needsMigration: true,
            },
            { status: 503 },
          )
        }
        throw error
      }

      return NextResponse.json({ success: true })
    }

    if (action === "set_active_period") {
      const { leaveYearPeriod } = body
      if (!leaveYearPeriod) {
        return NextResponse.json({ error: "leaveYearPeriod is required." }, { status: 400 })
      }

      // Business rule requested by user: only 2026/2027 is currently active.
      if (leaveYearPeriod !== "2026/2027") {
        return NextResponse.json(
          { error: "Only 2026/2027 can be active for now. Future periods are record-only." },
          { status: 400 },
        )
      }

      const { error: resetError } = await supabase
        .from("leave_policy_catalog")
        .update({ is_active_period: false, updated_at: new Date().toISOString() })
        .neq("leave_year_period", "")

      if (resetError) throw resetError

      const { error: activateError } = await supabase
        .from("leave_policy_catalog")
        .update({ is_active_period: true, updated_at: new Date().toISOString() })
        .eq("leave_year_period", leaveYearPeriod)

      if (activateError) throw activateError

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    console.error("[v0] Leave policy POST error:", error)
    return NextResponse.json({ error: "Failed to update leave policy" }, { status: 500 })
  }
}
