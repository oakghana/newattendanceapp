import { authenticatedFetch } from "@/lib/auth/authenticated-fetch"
import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"

export const runtime = "nodejs"
export const maxDuration = 60

interface LeaveRequest {
  id: string
  staff_name: string
  staff_number: string
  leave_type_key: string
  preferred_start_date: string
  preferred_end_date: string
  requested_days: number
  status: string
  reason?: string
  created_at: string
  location?: string
  rank?: string
}

export async function POST(request: NextRequest) {
  try {
    // Get user info
    const userResponse = await authenticatedFetch("/api/auth/current-user")
    if (!userResponse.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userData = await userResponse.json()
    if (!userData.success || !userData.user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 })
    }

    const user = userData.user
    const userRole = String(user.role || "").toLowerCase().replace(/[\s-]+/g, "_")

    // Only HOD and Regional Manager can export
    const allowedRoles = ["department_head", "regional_manager"]
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { error: "Only HOD and Regional Manager can export leave requests" },
        { status: 403 }
      )
    }

    // Get body parameters
    const body = await request.json()
    const { staffIds, leaveYear } = body

    if (!leaveYear) {
      return NextResponse.json({ error: "Leave year is required" }, { status: 400 })
    }

    // Fetch leave requests from database
    const adminResponse = await authenticatedFetch("/api/admin/supabase-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-hod-leave-requests",
        userRole,
        userId: user.id,
        staffIds: staffIds || [],
        leaveYear,
      }),
    })

    if (!adminResponse.ok) {
      throw new Error("Failed to fetch leave requests")
    }

    const leaveData = await adminResponse.json()
    const leaveRequests: LeaveRequest[] = leaveData.requests || []

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Annual Leave Requests")

    // Define columns
    worksheet.columns = [
      { header: "Staff Name", key: "staff_name", width: 20 },
      { header: "Staff Number", key: "staff_number", width: 15 },
      { header: "Location", key: "location", width: 18 },
      { header: "Rank", key: "rank", width: 20 },
      { header: "Leave Type", key: "leave_type_key", width: 20 },
      { header: "Start Date", key: "preferred_start_date", width: 15 },
      { header: "End Date", key: "preferred_end_date", width: 15 },
      { header: "Requested Days", key: "requested_days", width: 15 },
      { header: "Status", key: "status", width: 12 },
      { header: "Reason", key: "reason", width: 30 },
      { header: "Submitted Date", key: "created_at", width: 15 },
    ]

    // Style header row
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF366092" } }
    headerRow.alignment = { horizontal: "center", vertical: "center" }

    // Add data rows
    leaveRequests.forEach((leave) => {
      worksheet.addRow({
        staff_name: leave.staff_name,
        staff_number: leave.staff_number,
        location: leave.location || "-",
        rank: leave.rank || "-",
        leave_type_key: leave.leave_type_key.replace(/_/g, " ").toUpperCase(),
        preferred_start_date: leave.preferred_start_date,
        preferred_end_date: leave.preferred_end_date,
        requested_days: leave.requested_days,
        status: leave.status.toUpperCase(),
        reason: leave.reason || "-",
        created_at: new Date(leave.created_at).toLocaleDateString(),
      })
    })

    // Format data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header

      row.alignment = { horizontal: "left", vertical: "center", wrapText: true }

      // Format status column with conditional coloring
      const statusCell = row.getCell("status")
      if (statusCell.value === "APPROVED") {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } }
      } else if (statusCell.value === "REJECTED") {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } }
      } else if (statusCell.value === "PENDING") {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }
      }
    })

    // Add summary section
    const summaryRow = worksheet.getRow(leaveRequests.length + 3)
    summaryRow.getCell("staff_name").value = "TOTAL RECORDS:"
    summaryRow.getCell("staff_name").font = { bold: true }
    summaryRow.getCell("staff_number").value = leaveRequests.length
    summaryRow.getCell("staff_number").font = { bold: true }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return file
    const filename = `Annual_Leave_Requests_${leaveYear}_${new Date().toISOString().split("T")[0]}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error exporting leave requests:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    )
  }
}
