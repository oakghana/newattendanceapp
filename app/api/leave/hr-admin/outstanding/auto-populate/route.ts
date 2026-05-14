import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/leave/hr-admin/outstanding/auto-populate
 * 
 * Auto-populates outstanding leave balances for staff who didn't use all their
 * annual leave days when a leave year period ends.
 * 
 * Body:
 *   - from_year_period: e.g. "2024/2025" (the year that just ended)
 *   - to_year_period: e.g. "2025/2026" (the new year to carry over into)
 *   - region_id?: optional filter by Cocoa Board region
 *   - dry_run?: if true, only returns what WOULD be created without actually inserting
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const body = await req.json()

    const {
      from_year_period,
      to_year_period,
      region_id,
      dry_run = false,
    } = body

    if (!from_year_period || !to_year_period) {
      return NextResponse.json(
        { error: "from_year_period and to_year_period are required" },
        { status: 400 }
      )
    }

    // 1. Get leave policy for annual leave (to know max carryover allowed)
    const { data: policyData } = await supabase
      .from("leave_policy_catalog")
      .select("entitlement_days, max_carryover_days, allow_carryover")
      .eq("leave_type_key", "annual")
      .eq("leave_year_period", from_year_period)
      .eq("is_enabled", true)
      .single()

    const defaultEntitlement = policyData?.entitlement_days || 21
    const maxCarryover = policyData?.max_carryover_days || 5
    const allowCarryover = policyData?.allow_carryover !== false

    if (!allowCarryover) {
      return NextResponse.json(
        { error: "Carryover is not allowed for annual leave in this period", success: false },
        { status: 400 }
      )
    }

    // 2. Fetch all staff (optionally filtered by region)
    let staffQuery = supabase
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, region_id, regions(name)")
      .eq("is_active", true)

    if (region_id && region_id !== "all") {
      staffQuery = staffQuery.eq("region_id", region_id)
    }

    const { data: staffList, error: staffError } = await staffQuery

    if (staffError) {
      console.error("[v0] Error fetching staff:", staffError)
      return NextResponse.json({ error: "Failed to fetch staff list" }, { status: 500 })
    }

    // 3. For each staff member, calculate their unused annual leave days
    // By checking approved leave requests for annual leave in from_year_period
    const results: {
      user_id: string
      staff_name: string
      employee_id: string
      region_name: string
      entitlement: number
      used: number
      unused: number
      carryover: number
      status: "created" | "updated" | "skipped" | "no_unused"
    }[] = []

    for (const staff of staffList || []) {
      // Get total approved annual leave days for this staff in the from_year_period
      const { data: leaveRequests } = await supabase
        .from("leave_plan_requests")
        .select("adjusted_days, requested_days")
        .eq("user_id", staff.id)
        .eq("leave_type_key", "annual")
        .eq("leave_year_period", from_year_period)
        .in("status", ["approved", "hr_approved", "completed"])

      const usedDays = (leaveRequests || []).reduce((sum, req) => {
        return sum + (req.adjusted_days || req.requested_days || 0)
      }, 0)

      // Check if they already have an outstanding balance record for from_year_period
      const { data: existingBalance } = await supabase
        .from("outstanding_leave_balances")
        .select("*")
        .eq("user_id", staff.id)
        .eq("leave_year_period", from_year_period)
        .single()

      // Determine entitlement (from existing balance or default)
      const entitlement = existingBalance?.entitlement_days || defaultEntitlement
      const unused = Math.max(0, entitlement - usedDays)
      const carryover = Math.min(unused, maxCarryover)

      const staffName = `${staff.first_name || ""} ${staff.last_name || ""}`.trim() || "Unknown"
      const regionName = (staff.regions as any)?.name || "Unassigned"

      if (carryover <= 0) {
        results.push({
          user_id: staff.id,
          staff_name: staffName,
          employee_id: staff.employee_id || "N/A",
          region_name: regionName,
          entitlement,
          used: usedDays,
          unused,
          carryover: 0,
          status: "no_unused",
        })
        continue
      }

      // Check if they already have an outstanding balance for the TO year period
      const { data: existingToBalance } = await supabase
        .from("outstanding_leave_balances")
        .select("id")
        .eq("user_id", staff.id)
        .eq("leave_year_period", to_year_period)
        .single()

      if (!dry_run) {
        if (existingToBalance) {
          // Update existing record - add carryover to opening_balance
          await supabase
            .from("outstanding_leave_balances")
            .update({
              opening_balance: carryover,
              carryover_to_next_year: carryover,
              updated_at: new Date().toISOString(),
              notes: `Auto-populated from ${from_year_period}. Original unused: ${unused} days, capped at max carryover: ${maxCarryover} days.`,
            })
            .eq("id", existingToBalance.id)

          results.push({
            user_id: staff.id,
            staff_name: staffName,
            employee_id: staff.employee_id || "N/A",
            region_name: regionName,
            entitlement,
            used: usedDays,
            unused,
            carryover,
            status: "updated",
          })
        } else {
          // Insert new record for to_year_period
          await supabase.from("outstanding_leave_balances").insert({
            user_id: staff.id,
            leave_year_period: to_year_period,
            entitlement_days: defaultEntitlement,
            opening_balance: carryover,
            used_this_period: 0,
            carryover_to_next_year: carryover,
            max_carryover_allowed: maxCarryover,
            notes: `Auto-populated from ${from_year_period}. Original unused: ${unused} days, capped at max carryover: ${maxCarryover} days.`,
          })

          results.push({
            user_id: staff.id,
            staff_name: staffName,
            employee_id: staff.employee_id || "N/A",
            region_name: regionName,
            entitlement,
            used: usedDays,
            unused,
            carryover,
            status: "created",
          })
        }
      } else {
        // Dry run - just report what would happen
        results.push({
          user_id: staff.id,
          staff_name: staffName,
          employee_id: staff.employee_id || "N/A",
          region_name: regionName,
          entitlement,
          used: usedDays,
          unused,
          carryover,
          status: existingToBalance ? "updated" : "created",
        })
      }
    }

    const summary = {
      total_staff: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      no_unused: results.filter((r) => r.status === "no_unused").length,
      total_carryover_days: results.reduce((sum, r) => sum + r.carryover, 0),
    }

    return NextResponse.json({
      success: true,
      dry_run,
      from_year_period,
      to_year_period,
      max_carryover_allowed: maxCarryover,
      summary,
      results,
    })
  } catch (err) {
    console.error("[v0] Auto-populate outstanding leave error:", err)
    return NextResponse.json(
      { error: "Failed to auto-populate outstanding leave", success: false },
      { status: 500 }
    )
  }
}
