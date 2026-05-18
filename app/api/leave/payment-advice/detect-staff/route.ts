import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { month } = await request.json()

    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      )
    }

    // Parse month boundaries
    const [year, monthNum] = month.split("-")
    const monthStart = `${year}-${monthNum}-01`
    const monthEnd = new Date(parseInt(year), parseInt(monthNum), 0)
      .toISOString()
      .split("T")[0]

    console.log("[v0] Detect Staff Query:", {
      month,
      monthStart,
      monthEnd,
      leaveTypeKey: "annual",
      statuses: ["approved", "hr_approved", "hod_approved"],
    })

    // Query staff on annual leave for this month
    // Status can be: approved, hr_approved, hod_approved (all are approved states)
    const { data: staffOnLeave, error } = await supabase
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        staff_category,
        preferred_start_date,
        preferred_end_date,
        leave_type_key,
        status
      `
      )
      .eq("leave_type_key", "annual")
      .in("status", ["approved", "hr_approved", "hod_approved"])
      .lte("preferred_start_date", monthEnd)
      .gte("preferred_end_date", monthStart)

    if (error) {
      console.error("[v0] Error querying staff:", error)
      return NextResponse.json(
        { error: "Failed to query staff", details: error.message },
        { status: 500 }
      )
    }

    console.log("[v0] Staff Found:", staffOnLeave?.length || 0)

    const formatted = (staffOnLeave || []).map((record: any) => {
      const profile = profileMap.get(record.user_id)
      const staffCategory = deriveStaffCategory(record, profile)

      return {
        id: record.id,
        full_name: profile?.full_name || "Unknown",
        employee_id: profile?.employee_id || "N/A",
        department_name: profile?.department_name || "N/A",
        position: profile?.position || "N/A",
        staff_category: staffCategory,
        start_date: record.preferred_start_date,
        end_date: record.preferred_end_date,
        leave_type: record.leave_type_key,
      }
    })

    return NextResponse.json({
      success: true,
      staff: formatted,
      count: formatted.length,
    })
  } catch (err) {
    console.error("[v0] Error in detect-staff API:", err)
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    )
  }
}
