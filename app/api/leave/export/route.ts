import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, first_name, last_name")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String((profile as any).role || "").toLowerCase().trim()
    const isAuthorized = ["admin", "hr", "hr_leave_office_admin", "hr_officer"].includes(role)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Only HR staff can export leave requests" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { status_filter, date_from, date_to } = body

    // Build query
    let query = admin
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        requested_days,
        adjusted_days,
        status,
        reason,
        user_profiles(first_name, last_name, employee_id, departments(name))
      `
      )

    // Apply filters
    if (status_filter && status_filter !== "all") {
      query = query.eq("status", status_filter)
    }

    if (date_from) {
      query = query.gte("created_at", date_from)
    }

    if (date_to) {
      query = query.lte("created_at", date_to)
    }

    query = query.order("created_at", { ascending: false })

    const { data: leaves, error: fetchError } = await query

    if (fetchError) {
      console.error("[v0] Error fetching leaves for export:", fetchError)
      return NextResponse.json({ error: "Failed to fetch leave requests" }, { status: 500 })
    }

    // Generate CSV
    const csvHeaders = [
      "Staff Number",
      "Staff Name",
      "Department",
      "Leave Type",
      "Requested Start Date",
      "Requested End Date",
      "Requested Days",
      "Adjusted Start Date",
      "Adjusted End Date",
      "Adjusted Days",
      "Status",
      "Reason",
    ]

    const csvRows = (leaves || []).map((leave: any) => {
      const user = leave.user_profiles
      const dept = user?.departments?.name || "N/A"
      const staffName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim()
      const staffNumber = user?.employee_id || "N/A"

      return [
        staffNumber,
        staffName,
        dept,
        leave.leave_type_key || "N/A",
        leave.requested_start_date || "",
        leave.requested_end_date || "",
        leave.requested_days || "",
        leave.adjusted_start_date || "",
        leave.adjusted_end_date || "",
        leave.adjusted_days || "",
        leave.status || "",
        `"${(leave.reason || "").replace(/"/g, '""')}"`, // Escape quotes in CSV
      ]
    })

    const csv = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n")

    // Return CSV as file download
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leave-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  } catch (err) {
    console.error("[v0] Error exporting leaves:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
