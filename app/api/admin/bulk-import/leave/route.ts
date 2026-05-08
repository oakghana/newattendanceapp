import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { computeLeaveDays } from "@/lib/leave-policy"
import { getNextQccReference } from "@/lib/reference-number"

const VALID_LEAVE_TYPES = new Set([
  "annual",
  "sick",
  "maternity",
  "paternity",
  "study_with_pay",
  "study_without_pay",
  "casual",
  "compassionate",
  "special_unpaid",
  "other",
])

function excelSerialToDateStr(serial: number): string | null {
  // Excel epoch: Dec 30, 1899. Accounts for Excel's leap-year bug (day 60).
  const ms = (serial - 25569) * 86400 * 1000
  if (!isFinite(ms)) return null
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseExcelDate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "number") {
    return excelSerialToDateStr(value)
  }
  const str = String(value).trim()
  // Accept YYYY-MM-DD or DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split("/")
    return `${y}-${m}-${d}`
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split("-")
    return `${y}-${m}-${d}`
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 })
    }

    const admin = await createAdminClient()
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: "Excel file contains no sheets" }, { status: 400 })
    }

    const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" })

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data rows found in file" }, { status: 400 })
    }

    const results = { success: 0, failed: 0, errors: [] as Array<{ row: number; error: string; field?: string }> }

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2 // 1-based + header row
      const row = rows[i]

      const employeeId = String(row["employee_id"] || row["Employee ID"] || row["EmployeeID"] || "").trim()
      const email = String(row["email"] || row["Email"] || row["corporate_email"] || "").trim().toLowerCase()
      const leaveType = String(row["leave_type"] || row["Leave Type"] || row["LeaveType"] || "").trim().toLowerCase()
      const startDate = parseExcelDate(row["start_date"] || row["Start Date"] || row["StartDate"])
      const endDate = parseExcelDate(row["end_date"] || row["End Date"] || row["EndDate"])
      const reason = String(row["reason"] || row["Reason"] || "").trim()
      const leaveYearPeriod = String(row["leave_year_period"] || row["Leave Year Period"] || "2026/2027").trim()

      // Validate required fields
      if (!employeeId && !email) {
        results.failed++
        results.errors.push({ row: rowNum, error: "employee_id or email is required", field: "employee_id/email" })
        continue
      }
      if (!leaveType || !VALID_LEAVE_TYPES.has(leaveType)) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: `Invalid leave_type "${leaveType}". Valid: ${Array.from(VALID_LEAVE_TYPES).join(", ")}`,
          field: "leave_type",
        })
        continue
      }
      if (!startDate) {
        results.failed++
        results.errors.push({ row: rowNum, error: "start_date is required (YYYY-MM-DD)", field: "start_date" })
        continue
      }
      if (!endDate) {
        results.failed++
        results.errors.push({ row: rowNum, error: "end_date is required (YYYY-MM-DD)", field: "end_date" })
        continue
      }
      if (startDate > endDate) {
        results.failed++
        results.errors.push({ row: rowNum, error: "start_date must be on or before end_date", field: "start_date" })
        continue
      }
      if (!reason || reason.length < 5) {
        results.failed++
        results.errors.push({ row: rowNum, error: "reason is required (min 5 characters)", field: "reason" })
        continue
      }

      // Resolve user
      let userId: string | null = null
      try {
        let userQuery = admin.from("user_profiles").select("id")
        if (employeeId) {
          const { data: byEmp } = await userQuery.eq("employee_id", employeeId).maybeSingle()
          if (byEmp) userId = byEmp.id
        }
        if (!userId && email) {
          const { data: byEmail } = await admin
            .from("user_profiles")
            .select("id")
            .ilike("email", email)
            .maybeSingle()
          if (byEmail) userId = byEmail.id
        }
      } catch {
        // handled below
      }

      if (!userId) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: `No staff found for employee_id="${employeeId}" / email="${email}"`,
          field: "employee_id/email",
        })
        continue
      }

      const days = computeLeaveDays(startDate, endDate)
      if (days <= 0) {
        results.failed++
        results.errors.push({ row: rowNum, error: "Date range results in 0 leave days", field: "start_date/end_date" })
        continue
      }

      let referenceNumber: string
      try {
        referenceNumber = await getNextQccReference(admin)
      } catch {
        referenceNumber = `QCC/HRD/SWL/V.2/${Date.now()}`
      }

      const payload = {
        user_id: userId,
        reference_number: referenceNumber,
        leave_type: leaveType,
        leave_year_period: leaveYearPeriod,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "pending",
        approved_by: null,
        approved_at: null,
        document_url: null,
      }

      const { error: insertError } = await admin.from("leave_requests").insert(payload)
      if (insertError) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: insertError.message || "Database insert failed",
        })
        continue
      }

      results.success++
    }

    return NextResponse.json(results)
  } catch (err: any) {
    console.error("[bulk-import/leave] Error:", err)
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
