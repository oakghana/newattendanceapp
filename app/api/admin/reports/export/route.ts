import { type NextRequest, NextResponse } from "next/server"
import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import "jspdf-autotable"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => reject(new Error("Export timeout")), 60000) // 60 second timeout
    })

    const exportPromise = async (): Promise<Response> => {
      const { supabase, user, authError } = await createClientAndGetUser()

      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // Check admin role
      const { data: profile } = await supabase.from("user_profiles").select("role, assigned_location_id").eq("id", user.id).single()

      const normalizedRole = normalizeAppRole(profile?.role)
      if (!profile || !["admin", "regional_manager", "department_head", "managing_director", "regional_hr", "director_hr", "manager_hr"].includes(normalizedRole)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }

      const adminClient = await createAdminClient()
      const { format, filters } = await request.json()
      const { startDate, endDate, locationId, regionId, districtId, reportType } = filters

      let attendanceQuery = supabase.from("attendance_records").select("*")

      if (startDate) {
        attendanceQuery = attendanceQuery.gte("check_in_time", `${startDate}T00:00:00`)
      }
      if (endDate) {
        attendanceQuery = attendanceQuery.lte("check_in_time", `${endDate}T23:59:59`)
      }
      if (locationId) {
        attendanceQuery = attendanceQuery.eq("check_in_location_id", locationId)
      } else if (regionId && ["admin", "department_head", "director_hr", "manager_hr"].includes(normalizedRole)) {
        const { data: mappings } = await adminClient.from("region_location_mappings").select("district_location_id").eq("regional_location_id", regionId)
        const { data: children } = await adminClient.from("geofence_locations").select("id").eq("parent_location_id", regionId).eq("is_active", true)
        const scopedIds = [regionId, ...(mappings || []).map((row) => row.district_location_id), ...(children || []).map((row) => row.id)].filter((id, index, all) => id && all.indexOf(id) === index)
        attendanceQuery = attendanceQuery.in("check_in_location_id", scopedIds)
      } else if ((normalizedRole === "regional_manager" || normalizedRole === "regional_hr") && profile.assigned_location_id) {
        const { data: mappings } = await adminClient.from("region_location_mappings").select("district_location_id").eq("regional_location_id", profile.assigned_location_id)
        const { data: children } = await adminClient.from("geofence_locations").select("id").eq("parent_location_id", profile.assigned_location_id).eq("is_active", true)
        const scopedIds = [profile.assigned_location_id, ...(mappings || []).map((row) => row.district_location_id), ...(children || []).map((row) => row.id)].filter(Boolean)
        attendanceQuery = normalizedRole === "regional_hr"
          ? attendanceQuery.eq("check_in_location_id", profile.assigned_location_id)
          : attendanceQuery.in("check_in_location_id", [...new Set(scopedIds)])
      }

      const { data: attendanceRecords, error: attendanceError } = await attendanceQuery.order("check_in_time", {
        ascending: false,
      })

      if (attendanceError) {
        console.error("Attendance fetch error:", attendanceError)
        return NextResponse.json({ error: attendanceError.message }, { status: 500 })
      }

      if (!attendanceRecords || attendanceRecords.length === 0) {
        return NextResponse.json({ error: "No attendance records found" }, { status: 404 })
      }

      const userIds = [...new Set(attendanceRecords.map((record) => record.user_id))]
      const locationIds = [...new Set(attendanceRecords.map((record) => record.check_in_location_id).filter(Boolean))]

      // Fetch user profiles
      const { data: userProfiles } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, department_id")
        .in("id", userIds)

      // Fetch departments
      const departmentIds = [...new Set(userProfiles?.map((profile) => profile.department_id).filter(Boolean) || [])]
      const { data: departments } = await supabase.from("departments").select("id, name").in("id", departmentIds)

      // Fetch locations
      const { data: locations } = await supabase
        .from("geofence_locations")
        .select("id, name, address, district_id")
        .in("id", locationIds)

      const userProfileMap = new Map(userProfiles?.map((profile) => [profile.id, profile]) || [])
      const departmentMap = new Map(departments?.map((dept) => [dept.id, dept]) || [])
      const locationMap = new Map(locations?.map((loc) => [loc.id, loc]) || [])
      const districtIds = [...new Set((locations || []).map((location) => location.district_id).filter(Boolean))]
      const { data: districts } = districtIds.length ? await adminClient.from("districts").select("id, name").in("id", districtIds) : { data: [] }
      const districtMap = new Map((districts || []).map((district) => [district.id, district]))

      const incompleteRecords = attendanceRecords.filter((record) => {
        const profile = userProfileMap.get(record.user_id)
        const location = locationMap.get(record.check_in_location_id)
        return !profile?.employee_id || !profile.first_name || !profile.last_name || !location?.name || !record.check_in_time || !record.status
      })
      if (incompleteRecords.length > 0) {
        return NextResponse.json({
          error: "Export stopped because some attendance records are missing authoritative staff, location, date, or status data.",
          incompleteRecordCount: incompleteRecords.length,
          recordIds: incompleteRecords.slice(0, 20).map((record) => record.id),
        }, { status: 422 })
      }

      const exportData = attendanceRecords.map((record) => {
        const userProfile = userProfileMap.get(record.user_id)
        const department = userProfile ? departmentMap.get(userProfile.department_id) : null
        const location = locationMap.get(record.check_in_location_id)

        return {
          "Employee ID": userProfile?.employee_id || "N/A",
          Name: userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : "N/A",
          Department: department?.name || "N/A",
          District: districtMap.get(location?.district_id)?.name || "Unassigned district",
          Location: location?.name || "Unassigned location",
          "Check In": new Date(record.check_in_time).toLocaleString(),
          "Check Out": record.check_out_time ? new Date(record.check_out_time).toLocaleString() : "Not checked out",
          Status: record.status,
          "Work Hours": record.work_hours || "0",
          Date: new Date(record.check_in_time).toLocaleDateString(),
          Comment: record.notes || "",
          Reason: record.early_checkout_reason || "",
        }
      })

      if (format === "excel") {
        try {
          const worksheet = XLSX.utils.json_to_sheet(exportData)
          const workbook = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report")

          const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })

          return new NextResponse(excelBuffer, {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="attendance-report-${new Date().toISOString().split("T")[0]}.xlsx"`,
              "Content-Length": excelBuffer.byteLength.toString(),
            },
          })
        } catch (excelError) {
          console.error("Excel generation error:", excelError)
          return NextResponse.json({ error: "Failed to generate Excel file" }, { status: 500 })
        }
      } else if (format === "pdf") {
        try {
          const doc = new jsPDF()

          // Add title
          doc.setFontSize(16)
          doc.text("QCC Attendance Report", 20, 20)
          doc.setFontSize(10)
          doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30)

          // Add table
          const tableData = exportData.map((row) => Object.values(row))
          const tableHeaders = Object.keys(exportData[0] || {})

          doc.autoTable({
            head: [tableHeaders],
            body: tableData,
            startY: 40,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [41, 128, 185] },
          })

          const pdfBuffer = doc.output("arraybuffer")

          return new NextResponse(pdfBuffer, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="attendance-report-${new Date().toISOString().split("T")[0]}.pdf"`,
              "Content-Length": pdfBuffer.byteLength.toString(),
            },
          })
        } catch (pdfError) {
          console.error("PDF generation error:", pdfError)
          return NextResponse.json({ error: "Failed to generate PDF file" }, { status: 500 })
        }
      } else if (format === "csv") {
        try {
          const csvHeaders = Object.keys(exportData[0] || {})
          const csvRows = exportData.map((row) =>
            csvHeaders
              .map((header) => {
                const value = row[header] || ""
                // Escape quotes and wrap in quotes if contains comma, quote, or newline
                if (typeof value === "string" && (value.includes(",") || value.includes('"') || value.includes("\n"))) {
                  return `"${value.replace(/"/g, '""')}"`
                }
                return value
              })
              .join(","),
          )

          const csvContent = [csvHeaders.join(","), ...csvRows].join("\n")
          const csvBuffer = Buffer.from(csvContent, "utf-8")

          return new NextResponse(csvBuffer, {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="attendance-report-${new Date().toISOString().split("T")[0]}.csv"`,
              "Content-Length": csvBuffer.byteLength.toString(),
            },
          })
        } catch (csvError) {
          console.error("CSV generation error:", csvError)
          return NextResponse.json({ error: "Failed to generate CSV file" }, { status: 500 })
        }
      }

      return NextResponse.json({ error: "Invalid format. Supported formats: excel, pdf, csv" }, { status: 400 })
    }

    return await Promise.race([exportPromise(), timeoutPromise])
  } catch (error) {
    console.error("Export error:", error)
    if (error instanceof Error && error.message === "Export timeout") {
      return NextResponse.json(
        { error: "Export request timed out. Please try with a smaller date range." },
        { status: 408 },
      )
    }
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 })
  }
}
