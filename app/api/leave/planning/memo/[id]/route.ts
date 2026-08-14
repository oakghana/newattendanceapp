import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import fs from "fs"
import path from "path"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrApproverRole, isHrLeaveOfficeRole, isManagerRole, isStaffRole, calculateWorkingDays } from "@/lib/leave-planning"
import { resolveEntitlementFromProfile } from "@/lib/annual-leave-entitlement"
import { isHrRecordsRole } from "@/lib/hr-workflow"
import { calculateAnnualLeaveMemoDates, extractAlreadyEnjoyedDays, getNextWorkingDay } from "@/lib/annual-leave-calculator"

export const runtime = "nodejs"

function fmtName(profile?: any): string {
  const direct = String(profile?.full_name || profile?.display_name || "").trim()
  if (direct) return direct
  const first = String(profile?.first_name || "").trim()
  const middle = String(profile?.middle_name || profile?.other_name || "").trim()
  const last = String(profile?.last_name || profile?.surname || "").trim()
  return [first, middle, last].filter(Boolean).join(" ")
}

function fmtDate(value?: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-GH", { day: "2-digit", month: "long", year: "numeric" })
}

function ordinalSuffix(n: number): string {
  const v = n % 100
  const s = ["th", "st", "nd", "rd"]
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

function fmtFormalDate(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return fmtDate(value)
  return `${ordinalSuffix(date.getDate())} ${MONTH_NAMES[date.getMonth()]}, ${date.getFullYear()}`
}

function fmtFormalDateWithWeekday(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return fmtDate(value)
  return `${DAY_NAMES[date.getDay()]}, ${ordinalSuffix(date.getDate())} ${MONTH_NAMES[date.getMonth()]}, ${date.getFullYear()}`
}

function normalizeRole(r: string | null | undefined): string {
  return String(r || "")
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "_")
}

function leaveTypeLabel(key: string): string {
  const map: Record<string, string> = {
    annual: "Annual Leave",
    sick: "Sick Leave",
    maternity: "Maternity Leave",
    paternity: "Paternity Leave",
    study: "Study Leave",
    compassionate: "Compassionate Leave",
    part_leave: "Part Leave",
    no_pay: "Leave Without Pay",
    casual: "Casual Leave",
    leave_of_absence: "Leave of Absence",
  }
  return map[key] || String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function renderMemoTemplate(template: string, data: Record<string, any>) {
  const rendered = String(template || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
      const value = data[key]
      return value === null || value === undefined ? "" : String(value)
    })
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "")
  return rendered.replace(/[ \t]+\n/g, "\n").trim()
}

function leaveReferenceCode(leaveTypeKey: string) {
  const map: Record<string, string> = {
    annual: "AL",
    sick: "SL",
    maternity: "MAT",
    paternity: "PAT",
    study: "STL",
    compassionate: "CL",
    part_leave: "PL",
    no_pay: "LWP",
    casual: "CSL",
    leave_of_absence: "LOA",
  }
  return map[String(leaveTypeKey || "").toLowerCase()] || "LV"
}

const MEMO_WATERMARK_TEXT = "QCC-LOANLEAVE-APP"

function applySignatureSideWatermark(doc: jsPDF, sigY: number, marginLeft: number) {
  if (sigY <= 0) return
  const targetPage = doc.getNumberOfPages()
  doc.setPage(targetPage)
  doc.setTextColor(200, 200, 200)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text(MEMO_WATERMARK_TEXT, marginLeft + 2, sigY + 8, { angle: -15 })
}

function pickBestSignature(rows: any[]): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const active = rows.filter((row) => row?.is_active !== false)
  const pool = active.length > 0 ? active : rows

  const score = (row: any) => {
    const mode = String(row?.signature_mode || "").toLowerCase()
    const hasImage = (mode === "draw" || mode === "upload") && String(row?.signature_data_url || "").trim().length > 0
    const hasTyped = mode === "typed" && String(row?.signature_text || "").trim().length > 0
    const stage = String(row?.approval_stage || "").toLowerCase()
    const stageBoost = stage === "hr_approver" ? 50 : stage === "director_hr" ? 40 : stage === "manager_hr" ? 30 : 0
    return (hasImage ? 100 : hasTyped ? 10 : 0) + stageBoost
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] || null
}

/** Returns the official subject heading per leave type (no "RE:" prefix).
 *  NOTE: draftSubject is intentionally ignored — stale database values from old
 *  records contain wrong leave-type text (e.g. casual leave stored with an
 *  annual leave subject). The generated subject is always authoritative.
 */
function getMemoSubject(leaveTypeKey: string, leavePeriod: string, draftSubject?: string | null): string {
  // Use current year (2026) for annual leave memos instead of the leave period start year
  const currentYear = new Date().getFullYear()
  const yearPart = String(currentYear)
  const map: Record<string, string> = {
    annual:           `ANNUAL LEAVE ADVICE FOR ${yearPart}`,
    casual:           "RE: CASUAL LEAVE",
    sick:             "RE: SICK LEAVE",
    maternity:        "RE: MATERNITY LEAVE",
    paternity:        "RE: PATERNITY LEAVE",
    study:            "RE: STUDY LEAVE",
    compassionate:    "RE: COMPASSIONATE LEAVE",
    part_leave:       "RE: PART LEAVE",
    no_pay:           "RE: LEAVE WITHOUT PAY",
    leave_of_absence: "RE: LEAVE OF ABSENCE",
  }
  return map[String(leaveTypeKey || "annual").toLowerCase()] || `${leaveTypeLabel(leaveTypeKey).toUpperCase()} ADVICE FOR ${yearPart}`
}

/**
 * Builds the body paragraphs for each leave type when no memo_draft_body exists.
 * Returns { paragraphs: string[], closing: string, useTable: boolean } where
 * useTable=true means annual leave table format should be rendered by the PDF layer.
 */
function buildBuiltinBody(lr: any, effectiveStart: string, effectiveEnd: string, effectiveDays: number, returnDateIso: string, holidays: string[] = []): {
  paragraphs: string[]
  closing: string
  useTable: boolean
  tableEntitlement?: number
  tableTravellingDays?: number
} {
  const leaveType = String(lr.leave_type_key || "annual").toLowerCase()
  const submittedFormal = fmtFormalDate(lr.submitted_at || lr.created_at)
  const startFormal = fmtFormalDate(effectiveStart)
  const endFormal = fmtFormalDate(effectiveEnd)
  const returnFormal = fmtFormalDateWithWeekday(returnDateIso)
  // Use current year for annual leave period, not the stored leave_year_period which may be outdated
  const currentYear = new Date().getFullYear()
  const yearPart = leaveType === "annual" ? String(currentYear) : String(lr.leave_year_period || `${currentYear}/${currentYear + 1}`)
  const calYear = yearPart.split("/")[0]
  const travellingDays = Number(lr.travelling_days_added || 0)
  
  // Use HR executor's final dates/days if set (they may have modified before signing);
  // otherwise fall back to HR office adjusted dates, then original requested dates.
  // CRITICAL: entitlement_days is NEVER used for memo generation — only for HR office reference during calculations.
  const finalStartDate = lr.hr_approved_start_date || lr.adjusted_start_date || lr.preferred_start_date
  const finalEndDate = lr.hr_approved_end_date || lr.adjusted_end_date || lr.preferred_end_date
  const baseLeaveDays = lr.hr_approved_days !== null && lr.hr_approved_days !== undefined
    ? Number(lr.hr_approved_days)
    : (Number(lr.adjusted_days) || Number(lr.requested_days) || 0)

  // Note: effectiveStart, effectiveEnd, effectiveDays are parameters passed to buildBuiltinBody()
  // They're already set by the caller with finalStartDate, finalEndDate, and baseLeaveDays

  const adjustmentParagraph = lr.adjustment_reason
    ? `Adjustment Details: ${String(lr.adjustment_reason).trim()}`
    : ""

  switch (leaveType) {
    case "annual":
    case "annual_leave": {
      const yearRange = `January to December ${calYear}`
      // Compute actual working days between the granted leave dates (excl. weekends & public holidays)
      // This is the authoritative figure — never use the stored entitlement_days lookup value.
      const computedWorkingDays = calculateWorkingDays(effectiveStart, effectiveEnd, holidays).workingDays
      // Use the stored adjusted_days if it was explicitly set by HR office (may include travel adjustments),
      // otherwise fall back to the computed working-days figure so the table never shows a stale entitlement.
  const actualBaseDays = baseLeaveDays > 0 ? baseLeaveDays : computedWorkingDays
      const baseEntitlement = Number(lr.entitlement_days || lr.leave_entitlement_days || actualBaseDays)
      const outstandingDays = Math.max(0, Number(
        lr.outstanding_leave_days_added
          ?? lr.outstanding_leave_days
          ?? (lr.adjustment_breakdown as any)?.outstanding_days
          ?? 0,
      ))
  const entitlementForDisplay = baseEntitlement + outstandingDays
      return {
        useTable: true,
        paragraphs: [
          `In accordance with COCOBOD's vacation leave policy, we wish to inform you that approval has been granted for you to proceed on your annual leave in respect of the year ${yearRange}.`,
          "Your leave details are shown below.",
        ],
        closing: "We wish you a pleasant and relaxing vacation.",
        tableEntitlement: entitlementForDisplay,
        tableTravellingDays: travellingDays,
      }
    }

    case "casual":
      return {
        useTable: false,  // NEVER use table for casual leave
        paragraphs: [
          `We acknowledge receipt of your letter dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has given approval for you to proceed on ${effectiveDays} working day(s) casual leave with effect from ${startFormal} to ${endFormal}.`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "part_leave":
      return {
        useTable: false,  // NEVER use table for part leave
        paragraphs: [
          `We acknowledge receipt of your letter dated ${submittedFormal} in connection with the above-mentioned subject and wish to inform you that approval has been given for you to proceed on ${effectiveDays} working day(s) part leave with effect from ${startFormal} to ${endFormal}.`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "leave_of_absence": {
      const months = Math.max(1, Math.round(effectiveDays / 22))
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your application for leave of absence for a period of ${months} (${months}) month${months === 1 ? "" : "s"} with effect from ${startFormal} to ${endFormal}.`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }
    }

    case "maternity":
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your maternity leave with effect from ${startFormal} to ${endFormal} (${effectiveDays} working days).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "paternity":
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your paternity leave with effect from ${startFormal} to ${endFormal} (${effectiveDays} working days).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "sick":
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your sick leave with effect from ${startFormal} to ${endFormal} (${effectiveDays} day(s)).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "study":
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your study leave with effect from ${startFormal} to ${endFormal} (${effectiveDays} day(s)).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "compassionate":
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your compassionate leave with effect from ${startFormal} to ${endFormal} (${effectiveDays} day(s)).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "no_pay":
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has approved your leave without pay with effect from ${startFormal} to ${endFormal} (${effectiveDays} day(s)).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    default:
      return {
        useTable: false,
        paragraphs: [
          `We refer to your application dated ${submittedFormal} on the above subject and wish to inform you that Management has approved your ${leaveTypeLabel(leaveType).toLowerCase()} with effect from ${startFormal} to ${endFormal} (${effectiveDays} day(s)).`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const params = await context.params
    const leaveId = params.id

    // Token-based verification (memo_token stored on the request)
    const token = request.nextUrl.searchParams.get("token") || ""

    // Determine the current user. When a valid memo token is provided we allow
    // access without an active browser session (supports new-tab downloads).
    let user: any = null
    const {
      data: { user: sessionUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (!authError && sessionUser) {
      user = sessionUser
    }

    // If no session but a token was supplied, validate the token against the
    // leave request before proceeding so we can serve the PDF unauthenticated.
    if (!user && token) {
      const { data: tokenCheck } = await admin
        .from("leave_plan_requests")
        .select("user_id, memo_token, status")
        .eq("id", leaveId)
        .single()

      if (!tokenCheck) {
        return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
      }
      const storedToken = String((tokenCheck as any).memo_token || "")
      if (!storedToken || token !== storedToken) {
        return NextResponse.json({ error: "Invalid or expired memo token." }, { status: 401 })
      }
      // Use a synthetic user object that identifies the applicant
      user = { id: (tokenCheck as any).user_id }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [{ data: currentProfile }, { data: leaveRequest, error: leaveError }] = await Promise.all([
      admin
        .from("user_profiles")
        .select("id, role, department_id, departments(name, code), first_name, last_name, position")
        .eq("id", user.id)
        .single(),
      admin
        .from("leave_plan_requests")
        .select("*")
        .eq("id", leaveId)
        .single(),
    ])

    if (!currentProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }
    if (leaveError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

  const leaveWorkflowRoute = String((leaveRequest as any).workflow_route || "").toLowerCase()
  const isRegionalLeave = leaveWorkflowRoute === "regional" || leaveWorkflowRoute === "regional_hr"

  // HR Records may assign the official memo reference after approval. Generate
  // the memo now using the deterministic fallback reference when it is absent.
  
  // Load the latest carryover balance because older requests may not have the
    // HR-entered outstanding days copied onto leave_plan_requests yet.
    const { data: outstandingBalance } = await admin
      .from("outstanding_leave_balances")
      .select("carryover_to_next_year, leave_year_period, created_at")
      .eq("user_id", (leaveRequest as any).user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((leaveRequest as any).outstanding_leave_days_added == null && outstandingBalance) {
      ;(leaveRequest as any).outstanding_leave_days_added = Number(outstandingBalance.carryover_to_next_year || 0)
    }

    // CRITICAL: Also fetch the related leave_payment_memo to get the SELECTED SIGNER data
    // The selectedSigner is stored in leave_payment_memos.memo_body, NOT leave_plan_requests
    const { data: paymentMemo } = await admin
      .from("leave_payment_memos")
      .select("id, memo_body, status")
      .eq("leave_plan_request_id", leaveId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const role = normalizeRole((currentProfile as any).role)
    const deptName = (currentProfile as any)?.departments?.name || null
    const deptCode = (currentProfile as any)?.departments?.code || null

    // Try to parse memo_body from PAYMENT MEMO to get preferred approver data (selectedSigner)
    // This is where the selected HR Executive signer info is stored
    let memoBodyApprover: any = null
    let selectedSignerFromMemo: any = null
    try {
      if (paymentMemo?.memo_body) {
        const memoBodies = typeof paymentMemo.memo_body === 'string' 
          ? JSON.parse(paymentMemo.memo_body)
          : paymentMemo.memo_body
        
        // Check for selectedSigner first (from submit-memo)
        if (memoBodies?.selectedSigner) {
          selectedSignerFromMemo = memoBodies.selectedSigner
          console.log("[v0] Found selectedSigner from payment memo:", selectedSignerFromMemo)
        }
        
        // Check for approver (added during approve-secure)
        if (memoBodies?.approver) {
          memoBodyApprover = memoBodies.approver
          console.log("[v0] Found approver from payment memo:", memoBodyApprover)
        }
        
        // Check if it's an array
        if (Array.isArray(memoBodies)) {
          const lastMemo = memoBodies[memoBodies.length - 1]
          if (lastMemo?.selectedSigner) selectedSignerFromMemo = lastMemo.selectedSigner
          if (lastMemo?.approver) memoBodyApprover = lastMemo.approver
        }
      }
    } catch (parseErr) {
      console.warn("[v0] Failed to parse payment memo_body:", parseErr)
    }

    // Access control: applicant, HR approver, HR leave office, HOD, admin, loan_office, secretary
    const isApplicant = (leaveRequest as any).user_id === user.id
    const isRegionalHr = ["regional_hr", "regional_hr_officer", "regional_hr_office", "regional_hr_leave_office", "regional_leave_office"].includes(role)
    const isHrRecords = isHrRecordsRole(role)
    const canAccess =
      isApplicant ||
      role === "admin" ||
      role === "secretary" ||
      role === "loan_office" || role === "hr_loan_office" || role === "accounts_loan_office" ||
      role === "hr_executive" ||
      role === "accounts_executive" ||
      isHrApproverRole(role, deptName, deptCode) ||
      isHrLeaveOfficeRole(role) ||
      isRegionalHr ||
      isHrRecords ||
      isManagerRole(role) ||
      (leaveRequest as any).hod_reviewer_id === user.id ||
      (leaveRequest as any).hr_office_reviewer_id === user.id ||
      (leaveRequest as any).hr_approver_id === user.id

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify token if provided (already pre-validated above when no session exists)
    if (token) {
      const storedToken = String((leaveRequest as any).memo_token || "")
      if (!storedToken || token !== storedToken) {
        return NextResponse.json({ error: "Invalid or expired memo token." }, { status: 401 })
      }
    } else if (!isHrApproverRole(role, deptName, deptCode) && !isHrLeaveOfficeRole(role) && !isRegionalHr && !isHrRecords && role !== "admin" && role !== "hr_executive" && role !== "accounts_executive" && role !== "secretary") {
      // No token provided — allow the applicant or loan_office to download their own memo, or HOD/manager.
      if (!isApplicant && role !== "loan_office" && role !== "hr_loan_office" && role !== "accounts_loan_office" && !isManagerRole(role)) {
        return NextResponse.json({ error: "A valid memo token is required." }, { status: 401 })
      }
    }

    const finalizedMemoStatuses = new Set(["approved", "hr_approved", "regional_manager_approved"])
    const isFinalApproval = finalizedMemoStatuses.has(String((leaveRequest as any).status || "").toLowerCase())

    if (!isFinalApproval) {
      return NextResponse.json(
        { error: "Leave memo is only available after final approval." },
        { status: 400 },
      )
    }

    // Resolve applicant profile
    const { data: applicantProfile } = await admin
      .from("user_profiles")
      .select("*, departments(name, code)")
      .eq("id", (leaveRequest as any).user_id)
      .single()

    // Annual entitlement is based on the applicant profile; travel days stay separate.
  if (leaveRequest && String((leaveRequest as any).leave_type_key || "annual").toLowerCase() === "annual" && applicantProfile) {
  const annualEntitlement = resolveEntitlementFromProfile(applicantProfile as any)
  const savedEntitlement = Number((leaveRequest as any).entitlement_days || 0)
  const outstandingDays = Number((leaveRequest as any).outstanding_leave_days_added ?? (leaveRequest as any).outstanding_leave_days ?? 0)
  ;(leaveRequest as any).entitlement_days = Math.max(annualEntitlement.annualLeaveDays, savedEntitlement) + Math.max(0, outstandingDays)
  }

    // Resolve HOD profile (THRO)
    let hodProfile: any = null
    const hodId = String((leaveRequest as any).hod_reviewer_id || "")
    if (hodId) {
      const { data } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position, role")
        .eq("id", hodId)
        .maybeSingle()
      hodProfile = data
    }
    if (!hodProfile) {
      const { data: linkage } = await admin
        .from("loan_hod_linkages")
        .select("hod_user_id")
        .eq("staff_user_id", (leaveRequest as any).user_id)
        .limit(1)
        .maybeSingle()
      if ((linkage as any)?.hod_user_id) {
        const { data } = await admin
          .from("user_profiles")
          .select("id, first_name, last_name, position, role")
          .eq("id", (linkage as any).hod_user_id)
          .maybeSingle()
        hodProfile = data
      }
    }

    // Resolve HR approver profile + signature
    // PRIORITY for leave approval memos: leave_plan_requests.hr_approver_id
    // PRIORITY for payment advice memos: selectedSigner from payment memo memo_body
    
    let signerToUse: any = null
    
    // For payment advice memos: use selectedSigner from memo_body (highest priority)
    if (paymentMemo && selectedSignerFromMemo) {
      signerToUse = selectedSignerFromMemo
    }
    // For leave approval memos: use hr_approver_id from leave_plan_requests
    else if (!paymentMemo) {
      const regionalManagerId = String((leaveRequest as any).regional_manager_id || "")
      const hrApproverId = String((leaveRequest as any).hr_approver_id || "")
      if (regionalManagerId) {
        signerToUse = {
          id: regionalManagerId,
          name: (leaveRequest as any).regional_manager_name,
          signature_data_url: (leaveRequest as any).regional_manager_signature_data_url,
          signature_text: (leaveRequest as any).regional_manager_signature_text,
          position: "REGIONAL MANAGER",
        }
      } else if (hrApproverId) {
        signerToUse = { id: hrApproverId }
      }
    }
    // Last resort: use memoBodyApprover if available
    else if (memoBodyApprover) {
      signerToUse = memoBodyApprover
    }
    
    let hrApproverId = signerToUse?.id || ""
    let hrApproverProfile: any = null
    let hrSignatureData: any = null
    

    
    if (hrApproverId) {
      const [{ data: hrProf }, { data: hrSigRows }] = await Promise.all([
        admin
          .from("user_profiles")
          .select("id, first_name, last_name, position, role")
          .eq("id", hrApproverId)
          .maybeSingle(),
        admin
          .from("approval_signature_registry")
          .select("workflow_domain, approval_stage, signature_mode, signature_text, signature_data_url, is_active, updated_at")
          .eq("user_id", hrApproverId)
          .order("updated_at", { ascending: false }),
      ])
      hrApproverProfile = hrProf
      hrSignatureData = pickBestSignature(hrSigRows || [])
      

    }

    // Fetch public holidays for working-days calculation
    let holidayDatesForMemo: string[] = []
    try {
      const { data: holidayRows } = await admin
        .from("public_holidays")
        .select("holiday_date")
      if (holidayRows) {
        holidayDatesForMemo = holidayRows.map((h: any) => String(h.holiday_date).slice(0, 10))
      }
    } catch {
      // proceed without holidays — weekends still excluded
    }

    // Load QCC logo
    let logoBase64: string | null = null
    try {
      const possibleLogoPaths = [
        path.join(process.cwd(), "public", "images", "qcc-logo.png"),
        path.join(process.cwd(), "newattendanceapp", "public", "images", "qcc-logo.png"),
        path.join(process.cwd(), "public", "qcc-logo.png"),
      ]

      const resolvedLogoPath = possibleLogoPaths.find((candidate) => fs.existsSync(candidate))
      if (resolvedLogoPath) {
        logoBase64 = fs.readFileSync(resolvedLogoPath).toString("base64")
      }
    } catch {
      // continue without logo
    }

    // ─── Build memo content ───────────────────────────────────────────
    const lr = leaveRequest as any
    const ap = applicantProfile as any

    // Compute effective dates/days for memo generation
    // Use HR executor's final dates/days if set; otherwise fall back to HR office dates, then requested dates
    const effectiveStart = lr.hr_approved_start_date || lr.adjusted_start_date || lr.preferred_start_date
    // The approved/adjusted leave range is authoritative. Day adjustments
    // affect entitlement only and must never extend the leave period.
    const effectiveEnd = lr.hr_approved_end_date || lr.adjusted_end_date || lr.preferred_end_date
    const effectiveDays = lr.hr_approved_days !== null && lr.hr_approved_days !== undefined
      ? Number(lr.hr_approved_days)
      : (Number(lr.adjusted_days) || Number(lr.requested_days) || 0)

    const leaveTypeKey = String(lr.leave_type_key || "annual").toLowerCase()
    let adjustedEffectiveEnd = effectiveEnd
    let annualMemoDates: ReturnType<typeof calculateAnnualLeaveMemoDates> | null = null
    if (leaveTypeKey === "annual") {
      const explicitDeduction = (lr.prior_leave_days_deducted != null || lr.holiday_days_deducted != null)
        ? Number(lr.prior_leave_days_deducted || 0) + Number(lr.holiday_days_deducted || 0)
        : extractAlreadyEnjoyedDays(lr.adjustment_reason || lr.memo_draft_body)
      const memoOutstandingDays = Math.max(0, Number(
        lr.outstanding_leave_days_added
          ?? lr.outstanding_leave_days
          ?? (lr.adjustment_breakdown as any)?.outstanding_days
          ?? 0,
      ))
      annualMemoDates = calculateAnnualLeaveMemoDates({
        startDate: effectiveStart,
        entitlementDays: Number(lr.entitlement_days || lr.leave_entitlement_days || effectiveDays) + memoOutstandingDays,
        // Annual granted days are recalculated from the resolved entitlement,
        // deductions, and travel days; never trust stale stored 22/24-day totals.
        grantedDays: null,
        daysAlreadyEnjoyed: explicitDeduction ?? 0,
        travellingDays: Number(lr.travelling_days_added || 2),
      })
      adjustedEffectiveEnd = annualMemoDates.endDate.toISOString().slice(0, 10)
    }

    // Return-to-work date is the next working day after the calculated end.
    const returnDate = annualMemoDates?.resumptionDate || getNextWorkingDay(adjustedEffectiveEnd)
    const returnDateIso = returnDate.toISOString()

    const leaveLabel   = leaveTypeLabel(leaveTypeKey)

    const rawDraftSubject = String(lr.memo_draft_subject || "").trim()
    const rawDraftBody = String(lr.memo_draft_body || "").trim()
    const looksLikeInterimWorkflowMemo = /leave request received|workflow review|current stage\s*:/i.test(`${rawDraftSubject}\n${rawDraftBody}`)
    const safeDraftSubject = looksLikeInterimWorkflowMemo ? "" : rawDraftSubject
    const safeDraftBody = looksLikeInterimWorkflowMemo ? "" : rawDraftBody

    // Subject (use memo_draft_subject override if present, else per-type heading)
    const subject = getMemoSubject(leaveTypeKey, String(lr.leave_year_period || "2026/2027"), safeDraftSubject)

    // Body paragraphs
    const templateData = {
      leave_type: leaveLabel,
      leave_start_date: fmtFormalDate(effectiveStart),
      leave_end_date: fmtFormalDate(adjustedEffectiveEnd),
      approved_days: String(effectiveDays),
      submitted_date: fmtFormalDate(lr.submitted_at || lr.created_at),
      return_to_work_date: fmtFormalDateWithWeekday(returnDateIso),
    }
    const draftBody = renderMemoTemplate(safeDraftBody, templateData)

    let paragraphs: string[]
    let closingLine: string
    let useTable = false
    let tableEntitlement = 0
    let tableTravellingDays = 0

    // Always use the authoritative builtin body for every leave type.
    // Stored draftBody values are stale and may contain wrong leave-type content
    // (e.g. a casual leave record with annual leave body text from old data entry).
    {
      const built = buildBuiltinBody(lr, effectiveStart, adjustedEffectiveEnd, effectiveDays, returnDateIso, holidayDatesForMemo)
      paragraphs          = built.paragraphs
      closingLine         = built.closing
      // HARD SAFETY GUARD: table format is EXCLUSIVELY for annual leave.
      // Even if buildBuiltinBody returns useTable=true for another type, we override it.
      useTable            = leaveTypeKey === "annual" ? built.useTable : false
      tableEntitlement    = built.tableEntitlement    ?? 0
      tableTravellingDays = built.tableTravellingDays ?? 0
    }

    // ─── Generate PDF ────────────────────────────────────────────────
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageWidth    = doc.internal.pageSize.getWidth()
    const pageHeight   = doc.internal.pageSize.getHeight()
    const marginLeft   = 24
    const marginRight  = 20
    const contentWidth = pageWidth - marginLeft - marginRight

    // ── Letterhead ───────────────────────────���──────────────────────
    if (logoBase64) {
      try {
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", marginLeft, 10, 26, 26)
      } catch { /* skip */ }
    }

    // Company name block (centred)
    doc.setTextColor(0, 0, 0)
    doc.setFont("times", "bold")
    doc.setFontSize(16)
    doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, 18, { align: "center" })
    doc.setFontSize(13)
    doc.text("(COCOBOD)", pageWidth / 2, 26, { align: "center" })

    // P.O. Box block (top-right)
    doc.setFont("times", "italic")
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)
    const rightX = pageWidth - marginRight
    doc.text("P.O. Box M54", rightX, 19, { align: "right" })
    doc.text("Accra", rightX, 24, { align: "right" })
    doc.text("Ghana", rightX, 29, { align: "right" })

    // Green divider line
    doc.setDrawColor(44, 98, 22)
    doc.setLineWidth(0.7)
    doc.line(marginLeft, 43, pageWidth - marginRight, 43)
    doc.setLineWidth(0.2)
    doc.setDrawColor(200, 200, 200)

    let y = 51

    // Ref No + Date row (modern styling)
    doc.setTextColor(0, 0, 0)
    doc.setFont("times", "normal")
    doc.setFontSize(9)
    const approvalDate = lr.hr_approved_at || lr.created_at
    // The memo is not unlocked until HR Records enters the official reference.
    const refNum = String(lr.memo_reference || "").trim()
    if (!refNum) {
      return NextResponse.json({
        error: "Memo reference pending HR Records. Preview and download will be available after HR Records assigns the official reference.",
        code: "MEMO_REFERENCE_REQUIRED",
      }, { status: 409 })
    }
    doc.text(`Our Ref No:  ${refNum}`, marginLeft, y)
    doc.text(`Date:  ${fmtFormalDate(approvalDate)}`, pageWidth - marginRight, y, { align: "right" })
    y += 10

    // ── Recipient block (modern styling) ──────────────────────────────────────────────
    const applicantFullName = fmtName(ap).toUpperCase() || "REQUESTING STAFF"
    const staffNo           = String(ap?.employee_id || ap?.staff_number || "")
    const applicantPosition = String(ap?.position || "STAFF").toUpperCase()
    const applicantDept     = String((ap?.departments as any)?.name || "").toUpperCase()

    doc.setFont("times", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(0, 0, 0)
    doc.text(staffNo ? `${applicantFullName}  (S/NO.:  ${staffNo})` : applicantFullName, marginLeft, y)
    y += 5.5
    doc.setFont("times", "normal")
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)  // Slightly muted for secondary info
    doc.text(applicantPosition, marginLeft, y)
    y += 5.5
    if (applicantDept) { 
      doc.text(applicantDept, marginLeft, y)
      y += 5.5
    }
    y += 4

    // ── THRO block ───────────────────────────────────────────────────
    if (hodProfile) {
      const hodPos  = String((hodProfile as any)?.position || (hodProfile as any)?.role || "").toUpperCase().trim()
      const hodLoc  = String(lr.staff_location_name || (ap?.departments as any)?.name || "HEAD OFFICE").toUpperCase()
      if (hodPos) {
        doc.setFont("times", "normal")
        doc.setFontSize(9.2)
        doc.setTextColor(0, 0, 0)
        doc.text("THRO:", marginLeft, y)
        doc.text(hodPos, marginLeft + 14, y)
        y += 5.5
        doc.text("QUALITY CONTROL COMPANY LIMITED", marginLeft + 14, y)
        y += 5.5
        doc.setTextColor(60, 60, 60)
        doc.text(hodLoc, marginLeft + 14, y)
        y += 10
      }
    }

    // ── Subject line ─────────────────────────────────────────────────
    doc.setFont("times", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(0, 0, 0)
    const subjectLines = doc.splitTextToSize(subject, contentWidth)
    doc.text(subjectLines, marginLeft, y)
    // Underline each subject line
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    let underlineY = y + 1.5
    for (const line of subjectLines) {
      const w = doc.getTextWidth(line)
      doc.line(marginLeft, underlineY, marginLeft + Math.min(w, contentWidth), underlineY)
      underlineY += 5.5
    }
    y += subjectLines.length * 5.5 + 8

    // ── Body paragraphs ───────���──────────────────────────────────────
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(0, 0, 0)

    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, contentWidth)
      doc.text(lines, marginLeft, y)
      y += lines.length * 5.5 + 5
    }

    // ── Annual leave table ───────────────────────���─────���─────────────
    if (useTable === true) {
      // These dedicated Day Adjustment Breakdown fields are authoritative.
      // Public holidays and prior leave are deductions; travelling days are additions.
      const publicHolidayDaysDeducted = Math.max(0, Number(lr.holiday_days_deducted || 0))
      const priorLeaveDaysDeducted = Math.max(0, Number(lr.prior_leave_days_deducted || 0))
      const travelDaysFromField = Math.max(0, Number(lr.travelling_days_added || 0))
      const travelDays = travelDaysFromField

      // ─── Entitlement label (top-left cell): gross entitlement ───────────────
      // Show the staff's full annual entitlement (e.g. "24") even when some days were
      // already enjoyed — this is what the memo should declare as the entitlement.
  // The applicant profile is authoritative for annual entitlement. The stored
  // request value is retained only for legacy/non-annual records.
  const isAnnualMemo = leaveTypeKey === "annual"
  const profileEntitlement = isAnnualMemo && applicantProfile
    ? resolveEntitlementFromProfile(applicantProfile as any).annualLeaveDays
    : 0
      const rawEntitlement = Number(lr.entitlement_days || lr.leave_entitlement_days || 0)
      const breakdown = (lr.adjustment_breakdown && typeof lr.adjustment_breakdown === "object") ? lr.adjustment_breakdown : {}
      const outstandingDays = Math.max(0, Number(
        lr.outstanding_leave_days_added
          ?? lr.outstanding_leave_days
          ?? (breakdown as any).outstanding_days
          ?? 0,
      ))
      const baseEntitlement = isAnnualMemo
        ? Math.max(0, profileEntitlement || rawEntitlement || Number(tableEntitlement || 0) || effectiveDays)
        : Math.max(0, rawEntitlement || Number(tableEntitlement || 0) || effectiveDays)
      const grossEntitlement = isAnnualMemo ? baseEntitlement + outstandingDays : baseEntitlement
      const entitlementLabel = travelDays > 0
        ? `${grossEntitlement} plus ${travelDays} travelling day${travelDays !== 1 ? "s" : ""}`
        : String(grossEntitlement)

      // Outstanding days increase entitlement. They are not added to the
      // granted leave period unless the approved leave dates include them.
      const totalDeductions = publicHolidayDaysDeducted + priorLeaveDaysDeducted
      const annualDaysRemaining = Math.max(0, grossEntitlement - totalDeductions)
      const totalGranted = Math.max(0, Math.min(effectiveDays || annualDaysRemaining, annualDaysRemaining) + travelDays)

      const originalRequested = Number(
        lr.original_requested_days != null ? lr.original_requested_days : (lr.requested_days || 0),
      )
      const adjustedRequested = Number(lr.adjusted_days || lr.requested_days || 0)
      const hasIncrease = adjustedRequested > originalRequested || travelDays > 0
      const remarksParts: string[] = []
      // Remarks confirm the dedicated-field calculation. Free-text reasons
      // are displayed only and never parsed or used to change the total.
      if (publicHolidayDaysDeducted > 0) remarksParts.push(`${publicHolidayDaysDeducted} public holiday day(s) deducted`)
      if (priorLeaveDaysDeducted > 0) remarksParts.push(`${priorLeaveDaysDeducted} day(s) given/already enjoyed deducted`)
      if (travelDays > 0) remarksParts.push(`${travelDays} travelling day(s) added`)
      const breakdownTravellingDays = Number((breakdown as any).travelling_days ?? 0)
      if (outstandingDays > 0) remarksParts.push(`${outstandingDays} outstanding day(s) added to entitlement`)
      if (breakdownTravellingDays > 0 && travelDays === 0) remarksParts.push(`${breakdownTravellingDays} travelling day(s) added`)
      // Use one canonical calculation summary. Do not append the free-text
      // adjustment reason because it already contains these same clauses.
      const remarksSummary = Array.from(new Set(remarksParts)).join("; ") || "No day adjustment applied"

      autoTable(doc, {
        startY: y,
        margin: { left: marginLeft, right: marginRight },
        tableWidth: contentWidth,
        styles: {
          font: "times",
          fontSize: 8.5,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
          cellPadding: [1.5, 1.5],
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", fontSize: 8 },
        bodyStyles: { halign: "center", fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 28 }, // Entitled
          1: { cellWidth: 28 }, // Granted
          2: { cellWidth: 32 }, // From
          3: { cellWidth: 32 }, // To
          4: { halign: "left", cellWidth: "auto" }, // Remarks - left aligned, flexible width
        },
        head: [["Number of Days\nEntitled", "Number of Days\nGranted", "From", "To", "Remarks"]],
        body: [
          [
            entitlementLabel,
            String(totalGranted || effectiveDays),
            fmtFormalDate(effectiveStart),
            fmtFormalDate(adjustedEffectiveEnd),
            remarksSummary,
          ],
          [
            { content: String(totalGranted || effectiveDays), colSpan: 5, styles: { halign: "center", fontStyle: "bold", fontSize: 8.5 } },
          ],
        ],
      })

      y = (doc as any).lastAutoTable.finalY + 8

      // Resume duty line (bold date)
      const resumeLabel  = "You are to resume duty on "
      const resumeDate   = fmtFormalDate(returnDateIso)
      const resumeWidth  = doc.getTextWidth(resumeLabel)
      doc.setFont("times", "normal")
      doc.text(resumeLabel, marginLeft, y)
      doc.setFont("times", "bold")
      doc.text(`${resumeDate}.`, marginLeft + resumeWidth, y)
      y += 8
    } else {
      // For non-table types (casual, part_leave, paternity, etc.), resume duty is already in paragraphs
    }

    // ── Closing line ─────────────────────────────────────────────────
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    const closingLines = doc.splitTextToSize(closingLine, contentWidth)
    doc.text(closingLines, marginLeft, y)
    y += closingLines.length * 5.5 + 12

    // ── Signature block ───────────────────────────────────────────────
    // CRITICAL: Use selectedSigner from memo_body ONLY, never fall back to stale leave_plan_requests data
    // signerToUse contains selectedSignerFromMemo or memoBodyApprover
    
    let signerNameForMemo = ""
    let signerPositionForMemo = ""
    let signerSignatureUrl = ""
    
    // Use selectedSigner data (which is stored during submit-memo and approve-secure)
    if (signerToUse?.name) {
      signerNameForMemo     = signerToUse.name
      signerPositionForMemo = signerToUse.position || "HR EXECUTIVE"
      signerSignatureUrl    = signerToUse.signature_data_url || signerToUse.signature_image_url || ""
    }
    // For leave approval memos: signerToUse only has {id}, so use hrApproverProfile
    else if (hrApproverProfile) {
      signerNameForMemo     = fmtName(hrApproverProfile).toUpperCase()
      signerPositionForMemo = String((hrApproverProfile as any)?.position || "HR EXECUTIVE").toUpperCase()
      // Signature comes from registry (fetched via hrSignatureData above)
      signerSignatureUrl    = String((hrSignatureData as any)?.signature_data_url || "").trim()
    } else {
      signerNameForMemo     = "HR EXECUTIVE"
      signerPositionForMemo = "HR DEPARTMENT"
    }

    // Final signature URL: prefer signer's own URL, fall back to registry
    const registrySigDataUrl = String((hrSignatureData as any)?.signature_data_url || "").trim()
    const finalSignatureUrl = signerSignatureUrl || registrySigDataUrl
    
    let sigImgY = -1
    
    // Add modern signature block - PROFESSIONAL APPEARANCE
    if (finalSignatureUrl && finalSignatureUrl.length > 10) {
      try {
        if (finalSignatureUrl.startsWith("data:")) {
          const b64 = finalSignatureUrl.replace(/^data:image\/[^;]+;base64,/, "")
          sigImgY = y
          doc.addImage(`data:image/png;base64,${b64}`, "PNG", marginLeft, y, 50, 18)
          y += 22
        } else if (finalSignatureUrl.startsWith("http")) {
          // Blob URL - fetch and convert to base64
          try {
            const response = await fetch(finalSignatureUrl)
            if (response.ok) {
              const blob = await response.blob()
              const arrayBuffer = await blob.arrayBuffer()
              const base64 = Buffer.from(arrayBuffer).toString("base64")
              sigImgY = y
              doc.addImage(`data:image/png;base64,${base64}`, "PNG", marginLeft, y, 50, 18)
              y += 22
            } else {
              // Show placeholder if fetch fails
              doc.setDrawColor(100, 100, 100)
              doc.setLineWidth(0.3)
              doc.line(marginLeft, y, marginLeft + 50, y)
              y += 2
            }
          } catch (blobErr) {
            console.warn("[v0] Error fetching blob signature:", blobErr)
            // Show placeholder
            doc.setDrawColor(100, 100, 100)
            doc.setLineWidth(0.3)
            doc.line(marginLeft, y, marginLeft + 50, y)
            y += 2
          }
        } else {
          console.warn("[v0] Signature URL has unknown format:", finalSignatureUrl.substring(0, 50))
          // Unknown format - show placeholder
          doc.setDrawColor(150, 150, 150)
          doc.setLineWidth(0.2)
          doc.line(marginLeft, y + 8, marginLeft + 50, y + 8)
          y += 2
        }
      } catch (err) {
        console.error("[v0] CRITICAL: Failed to add signature image:", err)
        // Show placeholder
        doc.setDrawColor(100, 100, 100)
        doc.setLineWidth(0.3)
        doc.line(marginLeft, y, marginLeft + 50, y)
        y += 2
      }
    } else {
      console.warn("[v0] No signature image URL available for:", signerNameForMemo, "URL length:", finalSignatureUrl?.length || 0)
      // No signature - show light placeholder line
      doc.setDrawColor(150, 150, 150)
      doc.setLineWidth(0.2)
      doc.line(marginLeft, y + 8, marginLeft + 50, y + 8)
      y += 2
    }
    
    // Add signer name (modern styling)
    doc.setFont("times", "bold")
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(signerNameForMemo.toUpperCase(), marginLeft, y)
    y += 5
    
    // Add position
    doc.setFont("times", "normal")
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    doc.text(signerPositionForMemo.toUpperCase(), marginLeft, y)
    y += 5
    doc.text("FOR: MANAGING DIRECTOR", marginLeft, y)
    y += 14

    // ── CC block ─────────────────────────────────────────────────────
    doc.setFont("times", "bold")
    doc.setFontSize(8.5)
    doc.text("cc:", marginLeft, y)
    doc.setFont("times", "normal")
  const ccSource = lr.memo_draft_cc ?? lr.cc_recipients ?? lr.cc_list ?? ""
  const ccList: string[] = Array.isArray(ccSource)
    ? ccSource.map((value: unknown) => String(value).trim()).filter(Boolean)
    : String(ccSource)
      .split(/[\r\n,]+/)
      .map((line) => line.trim())
      .filter(Boolean)
    const ccIndent = marginLeft + 10
    for (const cc of ccList) {
      doc.text(cc, ccIndent, y)
      y += 4.8
    }
    y += 3

    // ── Footer ─────────��──────────────────────────────────────────────
    doc.setDrawColor(44, 98, 22)
    doc.setLineWidth(0.5)
    doc.line(marginLeft, pageHeight - 18, pageWidth - marginRight, pageHeight - 18)
    doc.setFont("times", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(80, 80, 80)
    doc.text(
      "Tel: +233-571-461-114  |  +233-571-461-113  |  Fax: GA-105-8378  |  Email: info@qccgh.com  |  www.qccgh.com",
      pageWidth / 2, pageHeight - 12, { align: "center" }
    )

    applySignatureSideWatermark(doc, sigImgY, marginLeft)

    const pdfBytes = doc.output("arraybuffer")

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="leave-memo-${String(leaveId).slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[leave-memo] GET error:", error)
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : ""
    console.error("[leave-memo] Stack:", stack)
    return NextResponse.json({ error: `Failed to generate leave memo: ${msg}`, details: stack }, { status: 500 })
  }
}
