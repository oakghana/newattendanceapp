import { NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { canDoLoanOffice, canDoHrOffice, normalizeRole } from "@/lib/loan-workflow"

// ── POST /api/loan/import ────────────────────────────────────────────────────
// Body: { rows: ImportRow[] }
// Each ImportRow must have staff_number (or employee_id), loan_type_key, amount,
// monthly_deduction, disbursement_date, recovery_months, expected_completion_date
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportRow {
  staff_number: string
  loan_type_key: string
  loan_type_label?: string
  amount: number
  monthly_deduction?: number
  disbursement_date?: string        // ISO date YYYY-MM-DD
  recovery_start_date?: string      // ISO date YYYY-MM-DD
  recovery_months?: number
  expected_completion_date?: string // ISO date YYYY-MM-DD — HR can override
  notes?: string
}

export interface ImportResult {
  success: ImportRow & { user_id: string; request_number: string }[]
  failed: { row: ImportRow; reason: string }[]
  duplicates: { row: ImportRow; existing_request_number: string }[]
  total: number
  inserted: number
  failedCount: number
  duplicateCount: number
}

function genRequestNumber() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `IMP-${ts}-${rand}`
}

function calcExpectedCompletion(disbursementDate: string | undefined, recoveryStartDate: string | undefined, recoveryMonths: number | undefined): string | null {
  const base = recoveryStartDate || disbursementDate
  if (!base || !recoveryMonths) return null
  const d = new Date(base)
  d.setMonth(d.getMonth() + Number(recoveryMonths))
  return d.toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  const { user, client } = await createClientAndGetUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await client
    .from("user_profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .single()

  const role = normalizeRole(profile?.role || "")
  if (!canDoLoanOffice(role) && !canDoHrOffice(role)) {
    return NextResponse.json({ error: "Access denied. Only Loan Office or HR Office staff may import loans." }, { status: 403 })
  }

  const body = await request.json()
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : []

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 })
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── 1. Fetch all staff numbers in one query for validation
  const staffNumbers = [...new Set(rows.map((r) => String(r.staff_number || "").trim()).filter(Boolean))]

  const { data: staffProfiles } = await admin
    .from("user_profiles")
    .select("id, employee_id, first_name, last_name, department_id")
    .in("employee_id", staffNumbers)

  const staffMap: Record<string, { id: string; name: string; department_id: string }> = {}
  for (const p of staffProfiles || []) {
    staffMap[String(p.employee_id)] = {
      id: p.id,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      department_id: p.department_id,
    }
  }

  // ── 2. Fetch loan types
  const { data: loanTypes } = await admin.from("loan_types").select("loan_key, loan_label")
  const loanTypeMap: Record<string, string> = {}
  for (const lt of loanTypes || []) loanTypeMap[lt.loan_key] = lt.loan_label

  // ── 3. Detect existing active loans for duplicate prevention
  const { data: existingLoans } = await admin
    .from("loan_requests")
    .select("id, user_id, loan_type_key, request_number, status")
    .in("status", ["imported", "active_loan", "staff_receiving_funds", "partially_recovered", "awaiting_hr_terms", "awaiting_committee", "approved_director"])
    .in("user_id", Object.values(staffMap).map((s) => s.id))

  // Build duplicate key: user_id + loan_type_key
  const existingKeys = new Set<string>()
  const existingByKey: Record<string, string> = {}
  for (const l of existingLoans || []) {
    const key = `${l.user_id}|${l.loan_type_key}`
    existingKeys.add(key)
    existingByKey[key] = l.request_number
  }

  // ── 4. Process each row
  const toInsert: Record<string, unknown>[] = []
  const failed: ImportResult["failed"] = []
  const duplicates: ImportResult["duplicates"] = []
  const successRows: ImportResult["success"] = []

  for (const row of rows) {
    const staffNo = String(row.staff_number || "").trim()
    const loanTypeKey = String(row.loan_type_key || "").trim()
    const amount = Number(row.amount)

    // Validate staff
    if (!staffNo) { failed.push({ row, reason: "Staff number is required" }); continue }
    const staff = staffMap[staffNo]
    if (!staff) { failed.push({ row, reason: `No staff found with number ${staffNo}` }); continue }

    // Validate loan type
    if (!loanTypeKey) { failed.push({ row, reason: "Loan type key is required" }); continue }

    // Validate amount
    if (isNaN(amount) || amount <= 0) { failed.push({ row, reason: `Invalid amount: ${row.amount}` }); continue }

    // Check duplicates
    const dupKey = `${staff.id}|${loanTypeKey}`
    if (existingKeys.has(dupKey)) {
      duplicates.push({ row, existing_request_number: existingByKey[dupKey] || "unknown" })
      continue
    }

    // Calculate expected completion if not provided
    const expectedCompletion =
      row.expected_completion_date ||
      calcExpectedCompletion(row.disbursement_date, row.recovery_start_date, row.recovery_months)

    const reqNo = genRequestNumber()
    const now = new Date().toISOString()

    toInsert.push({
      request_number:          reqNo,
      user_id:                 staff.id,
      staff_number:            staffNo,
      staff_full_name:         staff.name,
      department_id:           staff.department_id,
      loan_type_key:           loanTypeKey,
      loan_type_label:         row.loan_type_label || loanTypeMap[loanTypeKey] || loanTypeKey,
      fixed_amount:            amount,
      requested_amount:        amount,
      monthly_deduction:       row.monthly_deduction ? Number(row.monthly_deduction) : null,
      disbursement_date:       row.disbursement_date || null,
      recovery_start_date:     row.recovery_start_date || null,
      recovery_months:         row.recovery_months ? Number(row.recovery_months) : null,
      expected_completion_date: expectedCompletion,
      notes:                   row.notes || null,
      status:                  "imported",
      imported_by:             user.id,
      imported_at:             now,
      created_at:              now,
      submitted_at:            now,
      is_imported:             true,
    })

    successRows.push({ ...row, user_id: staff.id, request_number: reqNo })
    existingKeys.add(dupKey) // prevent intra-batch duplicates
  }

  // ── 5. Bulk insert
  if (toInsert.length > 0) {
    const { error: insertError } = await admin.from("loan_requests").insert(toInsert)
    if (insertError) {
      return NextResponse.json({ error: `Database insert failed: ${insertError.message}` }, { status: 500 })
    }
  }

  const result: ImportResult = {
    success:       successRows,
    failed,
    duplicates,
    total:         rows.length,
    inserted:      successRows.length,
    failedCount:   failed.length,
    duplicateCount: duplicates.length,
  }

  return NextResponse.json(result)
}

// ── GET /api/loan/import?action=imported ─────────────────────────────────────
// Returns all imported loans with completion tracking info
export async function GET(request: Request) {
  const { user, client } = await createClientAndGetUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const role = normalizeRole(profile?.role || "")
  if (!canDoLoanOffice(role) && !canDoHrOffice(role)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("loan_requests")
    .select(`
      id, request_number, user_id, staff_number, staff_full_name,
      staff_location_name, loan_type_key, loan_type_label,
      fixed_amount, requested_amount, monthly_deduction,
      disbursement_date, recovery_start_date, recovery_months,
      expected_completion_date, status, imported_at, imported_by, notes,
      departments!department_id(name)
    `)
    .eq("is_imported", true)
    .order("imported_at", { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ loans: data || [] })
}
