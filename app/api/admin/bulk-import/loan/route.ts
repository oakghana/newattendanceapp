import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { getNextQccReference } from "@/lib/reference-number"

function genRequestNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `LN-${stamp}-${rand}`
}

function parseExcelDate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value)
    if (!date) return null
    const mm = String(date.m).padStart(2, "0")
    const dd = String(date.d).padStart(2, "0")
    return `${date.y}-${mm}-${dd}`
  }
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split("/")
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

    // Pre-fetch all active loan types for lookup
    const { data: loanTypesData } = await admin
      .from("loan_types")
      .select("id, loan_key, loan_label, requires_committee, requires_fd_check, fixed_amount, default_recovery_months, loan_terms")
      .eq("is_active", true)

    const loanTypeMap = new Map<string, any>()
    for (const lt of loanTypesData || []) {
      loanTypeMap.set(String(lt.loan_key).toLowerCase(), lt)
    }

    const results = { success: 0, failed: 0, errors: [] as Array<{ row: number; error: string; field?: string }> }

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const row = rows[i]

      const employeeId = String(row["employee_id"] || row["Employee ID"] || row["EmployeeID"] || "").trim()
      const email = String(row["email"] || row["Email"] || row["corporate_email"] || "").trim().toLowerCase()
      const loanTypeKey = String(row["loan_type_key"] || row["Loan Type Key"] || row["LoanTypeKey"] || "").trim().toLowerCase()
      const requestedAmountRaw = row["requested_amount"] || row["Requested Amount"] || row["RequestedAmount"] || ""
      const requestedAmount = requestedAmountRaw !== "" ? Number(requestedAmountRaw) : null
      const reason = String(row["reason"] || row["Reason"] || "").trim()
      const recoveryMonthsRaw = row["recovery_months"] || row["Recovery Months"] || ""
      const recoveryMonths = recoveryMonthsRaw !== "" ? Number(recoveryMonthsRaw) : null
      const disbursementDateRaw = row["disbursement_date"] || row["Disbursement Date"] || ""
      const disbursementDate = parseExcelDate(disbursementDateRaw)

      // Validate required fields
      if (!employeeId && !email) {
        results.failed++
        results.errors.push({ row: rowNum, error: "employee_id or email is required", field: "employee_id/email" })
        continue
      }
      if (!loanTypeKey) {
        results.failed++
        results.errors.push({ row: rowNum, error: "loan_type_key is required", field: "loan_type_key" })
        continue
      }
      if (!reason || reason.length < 5) {
        results.failed++
        results.errors.push({ row: rowNum, error: "reason is required (min 5 characters)", field: "reason" })
        continue
      }

      // Look up loan type
      const loanType = loanTypeMap.get(loanTypeKey)
      if (!loanType) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: `Loan type "${loanTypeKey}" not found. Available: ${Array.from(loanTypeMap.keys()).join(", ")}`,
          field: "loan_type_key",
        })
        continue
      }

      // Resolve user
      let userId: string | null = null
      let userDeptId: string | null = null
      let userEmail: string | null = null
      let userStaffNumber: string | null = null
      let userRank: string | null = null

      try {
        if (employeeId) {
          const { data: byEmp } = await admin
            .from("user_profiles")
            .select("id, department_id, email, employee_id, position")
            .eq("employee_id", employeeId)
            .maybeSingle()
          if (byEmp) {
            userId = byEmp.id
            userDeptId = byEmp.department_id
            userEmail = byEmp.email
            userStaffNumber = byEmp.employee_id
            userRank = byEmp.position
          }
        }
        if (!userId && email) {
          const { data: byEmail } = await admin
            .from("user_profiles")
            .select("id, department_id, email, employee_id, position")
            .ilike("email", email)
            .maybeSingle()
          if (byEmail) {
            userId = byEmail.id
            userDeptId = byEmail.department_id
            userEmail = byEmail.email
            userStaffNumber = byEmail.employee_id
            userRank = byEmail.position
          }
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

      // Find HOD reviewer for the user
      let hodReviewerId: string | null = null
      if (userDeptId) {
        try {
          const { data: hodRows } = await admin
            .from("user_profiles")
            .select("id")
            .eq("department_id", userDeptId)
            .eq("role", "department_head")
            .eq("is_active", true)
            .limit(1)
          if (hodRows && hodRows.length > 0) hodReviewerId = hodRows[0].id
        } catch {
          // fallback: no HOD
        }
      }

      if (!hodReviewerId) {
        // Try loan_hod_linkages
        try {
          const { data: linkage } = await admin
            .from("loan_hod_linkages")
            .select("hod_user_id")
            .eq("staff_user_id", userId)
            .limit(1)
            .maybeSingle()
          if ((linkage as any)?.hod_user_id) hodReviewerId = (linkage as any).hod_user_id
        } catch {
          // ignore
        }
      }

      if (!hodReviewerId) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: `No HOD reviewer found for staff "${employeeId || email}". Assign a department_head to their department first.`,
          field: "employee_id",
        })
        continue
      }

      let referenceNumber: string
      try {
        referenceNumber = await getNextQccReference(admin)
      } catch {
        referenceNumber = `QCC/HRD/SWL/V.2/${Date.now()}`
      }

      const finalRequestedAmount = (loanType.fixed_amount && Number(loanType.fixed_amount) > 0)
        ? Number(loanType.fixed_amount)
        : (requestedAmount || null)

      const payload = {
        request_number: genRequestNumber(),
        reference_number: referenceNumber,
        user_id: userId,
        department_id: userDeptId || null,
        corporate_email: userEmail || null,
        staff_number: userStaffNumber || null,
        staff_rank: userRank || null,
        loan_type_key: loanType.loan_key,
        loan_type_label: loanType.loan_label,
        fixed_amount: loanType.fixed_amount || null,
        requested_amount: finalRequestedAmount,
        hr_note: loanType.loan_terms || null,
        recovery_months: recoveryMonths || loanType.default_recovery_months || null,
        disbursement_date: disbursementDate || null,
        reason,
        supporting_document_url: null,
        committee_required: Boolean(loanType.requires_committee),
        requires_fd_check: loanType.requires_fd_check !== false,
        status: "pending_hod",
        hod_reviewer_id: hodReviewerId,
        submitted_at: new Date().toISOString(),
      }

      const { error: insertError } = await admin.from("loan_requests").insert(payload)
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
    console.error("[bulk-import/loan] Error:", err)
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
