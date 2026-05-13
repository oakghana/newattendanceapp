import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    const userRole = searchParams.get("user_role")

    // Verify authorization
    if (!userId || !userRole) {
      return NextResponse.json(
        { error: "Missing user identification" },
        { status: 401 }
      )
    }

    const normalizedRole = String(userRole).toLowerCase().replace(/[-\s]+/g, "_")
    const isAuthorized = [
      "department_head",
      "regional_manager",
      "hr_officer",
      "manager_hr",
      "director_hr",
      "hr_director",
      "admin",
    ].includes(normalizedRole)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Only HOD/RM and HR can export annual leave" },
        { status: 403 }
      )
    }

    // Get annual leave requests with location data
    const { data: leaveRequests, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        entitlement_days,
        status,
        reason,
        created_at,
        submitted_at,
        hod_reviewed_at,
        hr_approved_at,
        user_profiles!inner(
          first_name,
          last_name,
          employee_id,
          email,
          phone,
          position,
          assigned_location_id,
          user_profiles_assigned_location_id_fkey:geofence_locations(
            name,
            address
          )
        )
      `
      )
      .eq("leave_type_key", "annual")
      .in("status", ["approved", "pending", "submitted"])
      .order("submitted_at", { ascending: false })

    if (leaveError) {
      console.error("[v0] Export error:", leaveError)
      return NextResponse.json(
        { error: "Failed to fetch leave requests" },
        { status: 500 }
      )
    }

    if (!leaveRequests || leaveRequests.length === 0) {
      return NextResponse.json(
        { error: "No annual leave requests found" },
        { status: 404 }
      )
    }

    // Build CSV data
    const headers = [
      "Employee ID",
      "Staff Name",
      "Email",
      "Phone",
      "Position",
      "Location",
      "Address",
      "Start Date",
      "End Date",
      "Days Requested",
      "Days Entitled",
      "Status",
      "Reason",
      "Submitted Date",
      "HOD Review Date",
      "HR Approval Date",
    ]

    const rows = leaveRequests
      .map((request: any) => {
        const profile = request.user_profiles
        const location = profile?.user_profiles_assigned_location_id_fkey?.[0]

        return [
          profile?.employee_id || "N/A",
          `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim(),
          profile?.email || "N/A",
          profile?.phone || "N/A",
          profile?.position || "N/A",
          location?.name || "Not Assigned",
          location?.address || "N/A",
          request.preferred_start_date || "N/A",
          request.preferred_end_date || "N/A",
          request.requested_days || 0,
          request.entitlement_days || 0,
          request.status || "pending",
          (request.reason || "").replace(/"/g, '""'), // Escape quotes in CSV
          request.submitted_at
            ? new Date(request.submitted_at).toLocaleDateString()
            : "N/A",
          request.hod_reviewed_at
            ? new Date(request.hod_reviewed_at).toLocaleDateString()
            : "Pending",
          request.hr_approved_at
            ? new Date(request.hr_approved_at).toLocaleDateString()
            : "Pending",
        ]
      })
      .map((row) => row.map((cell) => {
        const str = String(cell)
        // Escape quotes and wrap in quotes if contains comma or special chars
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(","))

    const csvContent = [headers.join(","), ...rows].join("\n")

    // Return as downloadable file
    const fileName = `Annual_Leave_Export_${new Date().toISOString().split("T")[0]}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error("[v0] Export API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    )
  }
}
