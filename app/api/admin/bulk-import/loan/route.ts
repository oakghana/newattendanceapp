import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { getNextQccReference } from "@/lib/reference-number"
import { notifyLoanHodApproved } from "@/lib/workflow-emails"

function genRequestNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `LN-${stamp}-${rand}`
}

function excelSerialToDateStr(serial: number): string | null {
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const date = new Date(`${str}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === str ? str : null
  }
  const slashDateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/)
  if (slashDateMatch) {
    const [, firstText, secondText, yearText] = slashDateMatch
    const first = Number(firstText)
    const second = Number(secondText)
    const year = Number(yearText)
    // Support both common Excel formats: DD/MM/YYYY and MM/DD/YYYY.
    // An unambiguous value (one side greater than 12) determines the format.
    const [day, month] = second > 12
      ? [second, first]
      : first > 12
        ? [first, second]
        : [first, second]
    const normalized = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const date = new Date(`${normalized}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : null
  }
  return null
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

function parseBoolean(value: unknown): boolean | null {
  if (!hasValue(value)) return null
  const normalized = String(value).trim().toLowerCase()
  if (["true", "yes", "1", "good", "approved"].includes(normalized)) return true
  if (["false", "no", "0", "bad", "rejected"].includes(normalized)) return false
  return null
}

function parseNormalizedStatus(value: unknown): string | null {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_")
  if (!status) return null
  const allowed = new Set([
    "hod_approved",
    "approved_director",
    "staff_receiving_funds",
    "partially_recovered",
    "payment_completed",
  ])
  return allowed.has(status) ? status : null
}

async function addTimeline(
  admin: any,
  loanRequestId: string,
  actorId: string,
  actorRole: string,
  actionKey: string,
  fromStatus: string | null,
  toStatus: string | null,
  note?: string | null,
) {
  await admin.from("loan_request_timeline").insert({
    loan_request_id: loanRequestId,
    actor_id: actorId,
    actor_role: actorRole,
    action_key: actionKey,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
  })
}

async function notifyStaffUsers(admin: any, userIds: string[], title: string, message: string, data: any = {}) {
  if (!userIds.length) return
  await admin.from("staff_notifications").insert(
    userIds.map((uid) => ({
      recipient_id: uid,
      title,
      message,
      type: "loan_update",
      data,
      is_read: false,
    })),
  )
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
    const importerId = user.id
    const importerRole = String(profile.role || "admin")
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
      const recoveryStartDateRaw = row["recovery_start_date"] || row["Recovery Start Date"] || row["Recovery Start"] || ""
      const recoveryStartDate = parseExcelDate(recoveryStartDateRaw)
      const mdApprovedAtRaw = row["md_approved_at"] || row["MD Approved At"] || row["md approval date"] || ""
      const mdApprovedAt = parseExcelDate(mdApprovedAtRaw)
      const fdScoreRaw = row["fd_score"] || row["FD Score"] || ""
      const fdScore = hasValue(fdScoreRaw) ? Number(fdScoreRaw) : null
      const fdGoodRaw = row["fd_good"] || row["FD Good"] || ""
      const fdGood = parseBoolean(fdGoodRaw)
      const fdNote = String(row["fd_note"] || row["FD Note"] || "").trim()
      const fdDocumentUrl = String(row["fd_document_url"] || row["FD Document URL"] || "").trim()
      const fdCheckedAtRaw = row["fd_checked_at"] || row["FD Checked At"] || ""
      const fdCheckedAt = parseExcelDate(fdCheckedAtRaw)
      const rowStatus = parseNormalizedStatus(row["status"] || row["Status"] || row["loan_status"] || row["Loan Status"])
      const rowRepaymentStatus = String(row["repayment_status"] || row["Repayment Status"] || "").trim().toLowerCase()
      const requestedRepaymentStatus = ["not_started", "active", "on_track", "overdue", "completed", "defaulted"].includes(rowRepaymentStatus)
        ? rowRepaymentStatus
        : null

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
      const dateFields = [
        ["disbursement_date", disbursementDateRaw, disbursementDate],
        ["recovery_start_date", recoveryStartDateRaw, recoveryStartDate],
        ["md_approved_at", mdApprovedAtRaw, mdApprovedAt],
        ["fd_checked_at", fdCheckedAtRaw, fdCheckedAt],
      ] as const
      const invalidDate = dateFields.find(([, raw, parsed]) => hasValue(raw) && !parsed)
      if (invalidDate) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: `Invalid date "${String(invalidDate[1])}". Use YYYY-MM-DD (for example, 2026-10-31).`,
          field: invalidDate[0],
        })
        continue
      }
      if (!disbursementDate) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: "disbursement_date is required for historical approved and disbursed loans.",
          field: "disbursement_date",
        })
        continue
      }
      if (hasValue(fdScoreRaw) && (!Number.isFinite(fdScore) || Number(fdScore) < 0 || Number(fdScore) > 100)) {
        results.failed++
        results.errors.push({ row: rowNum, error: "fd_score must be a number from 0 to 100", field: "fd_score" })
        continue
      }
      if (hasValue(fdGoodRaw) && fdGood === null) {
        results.failed++
        results.errors.push({ row: rowNum, error: 'fd_good must be Yes/No, True/False, or 1/0', field: "fd_good" })
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

      // Best-effort lookup of the staff member's HOD, kept for record-keeping only.
      // Bulk-imported loans are created directly as HOD Approved, so a missing HOD
      // linkage must never block the import — it just means hod_reviewer_id stays null.
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

      let referenceNumber: string
      try {
        referenceNumber = await getNextQccReference(admin)
      } catch {
        referenceNumber = `QCC/HRD/SWL/V.2/${Date.now()}`
      }

      const finalRequestedAmount = (loanType.fixed_amount && Number(loanType.fixed_amount) > 0)
        ? Number(loanType.fixed_amount)
        : (requestedAmount || null)

      const nowIso = new Date().toISOString()
      const importStatus = rowStatus || (disbursementDate ? "partially_recovered" : "approved_director")
      const effectiveRecoveryStartDate = recoveryStartDate || disbursementDate || null
      const effectiveMdApprovedAt = mdApprovedAt || disbursementDate || nowIso
      const effectiveRepaymentStatus = requestedRepaymentStatus || (importStatus === "payment_completed" ? "completed" : ((importStatus === "partially_recovered" || importStatus === "staff_receiving_funds") ? "active" : null))

      // Bulk-imported loans skip the pending_hod stage entirely: they are created
      // directly as a historical approved/disbursed record so they are visible
      // in the live loan tables and repayment views immediately.
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
        recovery_start_date: effectiveRecoveryStartDate,
        md_approved_at: effectiveMdApprovedAt,
        fd_score: fdScore,
        fd_good: fdGood === null ? (fdScore === null ? null : fdScore >= 39) : fdGood,
        fd_note: fdNote || null,
        fd_document_url: fdDocumentUrl || null,
        fd_checked_at: fdCheckedAt || null,
        repayment_status: effectiveRepaymentStatus,
        reason,
        supporting_document_url: null,
        committee_required: Boolean(loanType.requires_committee),
        requires_fd_check: loanType.requires_fd_check !== false,
        status: importStatus,
        hod_reviewer_id: hodReviewerId,
        // This marker is also used by memo generation to preserve the historical-import audit footnote.
        hod_review_note: importStatus === "payment_completed"
          ? "Bulk imported by Administrator — historical loan imported as fully cleared."
          : "Bulk imported by Administrator — historical approved/disbursed loan imported for repayment tracking.",
        hod_decision_at: nowIso,
        submitted_at: nowIso,
      }

      const { data: insertedLoan, error: insertError } = await admin
        .from("loan_requests")
        .insert(payload)
        .select("id, request_number")
        .single()

      if (insertError) {
        results.failed++
        const isDuplicate = insertError.code === "23505"
        results.errors.push({
          row: rowNum,
          error: isDuplicate
            ? "This staff member already has an active loan of this type for the same year. Do not re-upload it, or mark the existing loan repayment as completed before importing a replacement."
            : insertError.message || "Database insert failed",
        })
        continue
      }

      // Timeline audit trail: record both the (skipped) staff submission and the
      // immediate HOD-approved decision so the request history reads correctly.
      try {
        await addTimeline(admin, insertedLoan.id, importerId, importerRole, "staff_submit", null, "hod_approved", `Bulk imported by Administrator. Reason: ${reason}`)
        await addTimeline(admin, insertedLoan.id, importerId, importerRole, "hod_auto_approved", "hod_approved", importStatus, `Imported directly as ${importStatus.replace(/_/g, " ")}.`)
      } catch {
        // Timeline is best-effort; do not fail the import if it cannot be written.
      }

      if ((importStatus === "partially_recovered" || importStatus === "staff_receiving_funds" || importStatus === "payment_completed") && finalRequestedAmount) {
        const durationMonths = Number(recoveryMonths || loanType.default_recovery_months || 12)
        if (Number.isFinite(durationMonths) && durationMonths > 0) {
          try {
            await admin.rpc("generate_repayment_schedule", {
              p_loan_request_id: insertedLoan.id,
              p_start_date: effectiveRecoveryStartDate || disbursementDate || nowIso.slice(0, 10),
              p_duration_months: Math.trunc(durationMonths),
            })
            await admin
              .from("loan_requests")
              .update({
                repayment_plan_generated_at: nowIso,
                repayment_duration_months: Math.trunc(durationMonths),
                repayment_status: effectiveRepaymentStatus || "active",
              })
              .eq("id", insertedLoan.id)
          } catch (scheduleError) {
            console.warn("[bulk-import/loan] Repayment schedule generation failed:", scheduleError)
          }
        }
      }

      // Notify the staff member instantly so it shows on their dashboard, and
      // notify the Loan/HR Office queue so they see it awaiting review.
      try {
        await notifyStaffUsers(
          admin,
          [userId],
          "Loan Request Submitted on Your Behalf",
          `A ${loanType.loan_label} loan request (${insertedLoan.request_number}) has been imported for you by HR/Admin as a historical loan record.`,
          { request_id: insertedLoan.id },
        )
        await notifyLoanHodApproved(admin, {
          loanRequestId: insertedLoan.id,
          staffName: `${(userStaffNumber ? `${userStaffNumber} — ` : "")}${userEmail || employeeId || "Staff Member"}`,
          loanType: loanType.loan_label,
          requestNumber: insertedLoan.request_number,
          hodName: "Administrator (Bulk Import)",
          amount: finalRequestedAmount,
        })
      } catch {
        // Notifications/emails are best-effort; do not fail the import on delivery issues.
      }

      results.success++
    }

    return NextResponse.json(results)
  } catch (err: any) {
    console.error("[bulk-import/loan] Error:", err)
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}
