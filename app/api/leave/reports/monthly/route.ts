import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Hardcoded Cocoa Board regions — same list as the UI
const COCOA_REGIONS: Record<string, string> = {
  all:            "All Regions / Locations",
  greater_accra:  "Greater Accra",
  ashanti:        "Ashanti Region",
  western_north:  "Western North",
  western_south:  "Western South",
  central:        "Central Region",
  volta:          "Volta Region",
  brong_ahafo:    "Brong Ahafo Region",
  tema_port:      "Tema Port",
  kaase_port:     "Kaase Port",
  takoradi_port:  "Takoradi Port",
}

function getDateRange(params: URLSearchParams): { startDate: string; endDate: string; periodLabel: string } {
  const period = params.get("period") || "monthly"

  if (period === "weekly") {
    const weekStart = params.get("week_start") || new Date().toISOString().split("T")[0]
    const start = new Date(weekStart)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
      periodLabel: `Week of ${start.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}`,
    }
  }

  if (period === "quarterly") {
    const quarter = params.get("quarter") || "Q1 2025"
    const [q, yr] = quarter.split(" ")
    const year = parseInt(yr, 10)
    const qMap: Record<string, { start: number; end: number }> = {
      Q1: { start: 0, end: 2 },
      Q2: { start: 3, end: 5 },
      Q3: { start: 6, end: 8 },
      Q4: { start: 9, end: 11 },
    }
    const { start: sm, end: em } = qMap[q] || qMap["Q1"]
    const startDate = new Date(year, sm, 1)
    const endDate = new Date(year, em + 1, 0)
    return {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      periodLabel: `${quarter} (${startDate.toLocaleDateString("en-US", { month: "short" })} – ${endDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`,
    }
  }

  // Default: monthly
  const month = params.get("month") || new Date().toISOString().slice(0, 7)
  const startDate = new Date(month + "-01")
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    periodLabel: startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  }
}

function formatLeaveType(key: string): string {
  const types: Record<string, string> = {
    annual: "Annual Leave",
    sick: "Sick Leave",
    casual: "Casual Leave",
    maternity: "Maternity Leave",
    paternity: "Paternity Leave",
    study: "Study Leave",
    compassionate: "Compassionate Leave",
  }
  return types[key] || key
}

function formatStatus(status: string): string {
  const statuses: Record<string, string> = {
    pending_hod_review: "Pending HOD Review",
    pending_manager_review: "Pending Manager Review",
    hod_approved: "HOD Approved",
    hod_rejected: "HOD Rejected",
    hod_changes_requested: "HOD Changes Requested",
    hr_office_forwarded: "HR Office Forwarded",
    pending_hr_approval: "Pending HR Approval",
    hr_approved: "HR Approved",
    hr_rejected: "HR Rejected",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
  }
  return statuses[status] || status
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)

    const period     = searchParams.get("period") || "monthly"
    const yearPeriod = searchParams.get("year_period") || "2025/2026"
    const regionKey  = searchParams.get("region") || "all"
    const regionName = COCOA_REGIONS[regionKey] || "All Regions / Locations"

    const { startDate, endDate, periodLabel } = getDateRange(searchParams)

    // Fetch leave requests within the date range
    let query = supabase
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        leave_type_key,
        leave_year_period,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        adjusted_days,
        status,
        created_at,
        user:user_profiles!leave_plan_requests_user_id_fkey (
          employee_id,
          first_name,
          last_name,
          region_id,
          departments (name),
          regions (name)
        )
      `)
      .eq("leave_year_period", yearPeriod)
      .lte("preferred_start_date", endDate)
      .gte("preferred_end_date", startDate)
      .order("preferred_start_date", { ascending: true })

    const { data: requests, error } = await query
    if (error) throw error

    // Filter by Cocoa region key (stored in user profile region slug or region name)
    let filteredRequests = requests || []
    if (regionKey !== "all") {
      filteredRequests = filteredRequests.filter((r: any) => {
        const regionDbName = (r.user?.regions?.name || "").toLowerCase().replace(/\s+/g, "_")
        const regionDbId   = (r.user?.region_id || "")
        return (
          regionDbName.includes(regionKey.replace(/_port$/, "").replace(/_/g, " ")) ||
          regionDbId === regionKey ||
          regionDbName === regionKey
        )
      })
    }

    // Build CSV rows
    const headers = [
      "Employee ID",
      "Staff Name",
      "Department",
      "Cocoa Region / Location",
      "Leave Type",
      "Start Date",
      "End Date",
      "Requested Days",
      "Adjusted Days",
      "Status",
      "Created Date",
    ]

    const rows = filteredRequests.map((r: any) => [
      r.user?.employee_id || "N/A",
      `${r.user?.first_name || ""} ${r.user?.last_name || ""}`.trim() || "Unknown",
      r.user?.departments?.name || "Unassigned",
      regionKey !== "all" ? regionName : (r.user?.regions?.name || "Unassigned"),
      formatLeaveType(r.leave_type_key),
      r.preferred_start_date || "",
      r.preferred_end_date || "",
      r.requested_days || 0,
      r.adjusted_days || r.requested_days || 0,
      formatStatus(r.status),
      r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "",
    ])

    // Summary footer row
    const totalRequested = filteredRequests.reduce((s: number, r: any) => s + (r.requested_days || 0), 0)
    const totalAdjusted  = filteredRequests.reduce((s: number, r: any) => s + (r.adjusted_days || r.requested_days || 0), 0)
    rows.push([])
    rows.push([
      "TOTAL", "", "", "", "", "", "",
      totalRequested, totalAdjusted,
      `${filteredRequests.length} record(s)`, "",
    ])

    const csvHeader = [
      `QCC Leave Report — ${period.charAt(0).toUpperCase() + period.slice(1)}`,
      `Period: ${periodLabel}`,
      `Leave Year: ${yearPeriod}`,
      `Region / Location: ${regionName}`,
      `Generated: ${new Date().toLocaleString("en-GB")}`,
      "",
    ].join("\n")

    const csvContent = [
      csvHeader,
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n")

    const filename = `leave-${period}-report-${regionKey}-${startDate}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error generating leave report:", error)
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 })
  }
}
