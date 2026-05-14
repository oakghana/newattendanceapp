import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7)
    const yearPeriod = searchParams.get("year_period") || "2025/2026"
    const regionId = searchParams.get("region_id")

    // Parse month to get date range
    const startDate = new Date(month + "-01")
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = endDate.toISOString().split("T")[0]

    // Build query for leave requests
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
          department_id,
          region_id,
          departments (name),
          regions (name)
        )
      `)
      .eq("leave_year_period", yearPeriod)
      .or(`preferred_start_date.lte.${endDateStr},preferred_end_date.gte.${startDateStr}`)
      .order("created_at", { ascending: false })

    const { data: requests, error } = await query

    if (error) throw error

    // Filter by region if specified
    let filteredRequests = requests || []
    if (regionId) {
      filteredRequests = filteredRequests.filter((r: any) => r.user?.region_id === regionId)
    }

    // Format leave type for display
    const formatLeaveType = (key: string) => {
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

    // Format status for display
    const formatStatus = (status: string) => {
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

    // Generate CSV content
    const headers = [
      "Employee ID",
      "Staff Name",
      "Department",
      "Region",
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
      r.user?.regions?.name || "Unassigned",
      formatLeaveType(r.leave_type_key),
      r.preferred_start_date || "",
      r.preferred_end_date || "",
      r.requested_days || 0,
      r.adjusted_days || r.requested_days || 0,
      formatStatus(r.status),
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
    ])

    // Add summary row
    const totalRequested = filteredRequests.reduce((sum: number, r: any) => sum + (r.requested_days || 0), 0)
    const totalAdjusted = filteredRequests.reduce((sum: number, r: any) => sum + (r.adjusted_days || r.requested_days || 0), 0)
    rows.push([])
    rows.push(["SUMMARY", "", "", "", "", "", "", totalRequested, totalAdjusted, `Total Records: ${filteredRequests.length}`, ""])

    // Convert to CSV string
    const csvContent = [
      `Leave Report - ${new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
      `Leave Year: ${yearPeriod}`,
      `Region: ${regionId ? "Filtered" : "All Regions"}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n")

    // Return as downloadable CSV
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leave-report-${month}.csv"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error generating leave report:", error)
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 })
  }
}
