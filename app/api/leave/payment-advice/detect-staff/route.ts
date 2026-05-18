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
      status: "approved",
    })

    // Query staff on annual leave for this month
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
        status,
        user_profiles!inner(
          id,
          full_name,
          employee_id,
          department_name,
          position
        )
      `
      )
      .eq("leave_type_key", "annual")
      .eq("status", "approved")
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

    const formatted = (staffOnLeave || []).map((record: any) => ({
      id: record.id,
      full_name: record.user_profiles?.full_name || "Unknown",
      employee_id: record.user_profiles?.employee_id || "N/A",
      department_name: record.user_profiles?.department_name || "N/A",
      position: record.user_profiles?.position || "N/A",
      staff_category: record.staff_category || "Junior",
      start_date: record.preferred_start_date,
      end_date: record.preferred_end_date,
      leave_type: record.leave_type_key,
    }))

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
