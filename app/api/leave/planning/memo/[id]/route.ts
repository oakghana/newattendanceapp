import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import fs from "fs"
import path from "path"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrApproverRole, isHrLeaveOfficeRole, isManagerRole, isStaffRole } from "@/lib/leave-planning"

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

/** Returns the official subject heading per leave type (no "RE:" prefix). */
function getMemoSubject(leaveTypeKey: string, leavePeriod: string, draftSubject?: string | null): string {
  if (draftSubject && draftSubject.trim()) return draftSubject.trim()
  const yearPart = String(leavePeriod || "2026/2027").split("/")[0]
  const map: Record<string, string> = {
    annual:           `ANNUAL LEAVE ADVICE FOR ${yearPart}`,
    casual:           "CASUAL LEAVE",
    sick:             "SICK LEAVE",
    maternity:        "MATERNITY LEAVE",
    paternity:        "PATERNITY LEAVE",
    study:            "STUDY LEAVE",
    compassionate:    "COMPASSIONATE LEAVE",
    part_leave:       "PART LEAVE",
    no_pay:           "LEAVE WITHOUT PAY",
    leave_of_absence: "LEAVE OF ABSENCE",
  }
  return map[String(leaveTypeKey || "annual").toLowerCase()] || `${leaveTypeLabel(leaveTypeKey).toUpperCase()} ADVICE FOR ${yearPart}`
}

/**
 * Builds the body paragraphs for each leave type when no memo_draft_body exists.
 * Returns { paragraphs: string[], closing: string, useTable: boolean } where
 * useTable=true means annual leave table format should be rendered by the PDF layer.
 */
function buildBuiltinBody(lr: any, effectiveStart: string, effectiveEnd: string, effectiveDays: number, returnDateIso: string): {
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
  const yearPart = String(lr.leave_year_period || "2026/2027")
  const calYear = yearPart.split("/")[0]
  const travellingDays = Number(lr.travelling_days_added || 0)
  const entitlementDays = Number(lr.entitlement_days || 0)

  const adjustmentParagraph = lr.adjustment_reason
    ? `Adjustment Details: ${String(lr.adjustment_reason).trim()}`
    : ""

  switch (leaveType) {
    case "annual": {
      const yearRange = `January to December ${calYear}`
      return {
        useTable: true,
        paragraphs: [
          `In accordance with COCOBOD's vacation leave policy, we wish to inform you that approval has been granted for you to proceed on your annual leave in respect of the year ${yearRange}.`,
          "Your leave details are shown below.",
        ],
        closing: "We wish you a pleasant and relaxing vacation.",
        tableEntitlement: entitlementDays,
        tableTravellingDays: travellingDays,
      }
    }

    case "casual":
      return {
        useTable: false,
        paragraphs: [
          `We acknowledge receipt of your letter dated ${submittedFormal} in relation to the above-mentioned subject and wish to inform you that Management has given approval for you to proceed on ${effectiveDays} working day(s) casual leave with effect from ${startFormal} to ${endFormal}.`,
          `You are expected to resume duty on ${returnFormal}.`,
          ...(adjustmentParagraph ? [adjustmentParagraph] : []),
        ],
        closing: "You can count on our co-operation.",
      }

    case "part_leave":
      return {
        useTable: false,
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = await context.params
    const leaveId = params.id

    // Token-based verification (memo_token stored on the request)
    const token = request.nextUrl.searchParams.get("token") || ""

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

    const role = normalizeRole((currentProfile as any).role)
    const deptName = (currentProfile as any)?.departments?.name || null
    const deptCode = (currentProfile as any)?.departments?.code || null

    // Access control: applicant, HR approver, HR leave office, HOD, admin
    const isApplicant = (leaveRequest as any).user_id === user.id
    const canAccess =
      isApplicant ||
      role === "admin" ||
      isHrApproverRole(role, deptName, deptCode) ||
      isHrLeaveOfficeRole(role) ||
      isManagerRole(role) ||
      (leaveRequest as any).hod_reviewer_id === user.id ||
      (leaveRequest as any).hr_office_reviewer_id === user.id ||
      (leaveRequest as any).hr_approver_id === user.id

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify token if provided (required for non-HR/admin users)
    if (token) {
      const storedToken = String((leaveRequest as any).memo_token || "")
      if (!storedToken || token !== storedToken) {
        return NextResponse.json({ error: "Invalid or expired memo token." }, { status: 401 })
      }
    } else if (!isHrApproverRole(role, deptName, deptCode) && role !== "admin") {
      return NextResponse.json({ error: "A valid memo token is required." }, { status: 401 })
    }

    if ((leaveRequest as any).status !== "hr_approved") {
      return NextResponse.json(
        { error: "Leave memo is only available after HR final approval." },
        { status: 400 },
      )
    }

    // Resolve applicant profile
    const { data: applicantProfile } = await admin
      .from("user_profiles")
      .select("*, departments(name, code)")
      .eq("id", (leaveRequest as any).user_id)
      .single()

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
    const hrApproverId = String((leaveRequest as any).hr_approver_id || "")
    let hrApproverProfile: any = null
    let hrSignatureData: any = null
    if (hrApproverId) {
      const [{ data: hrProf }, { data: hrSig }] = await Promise.all([
        admin
          .from("user_profiles")
          .select("id, first_name, last_name, position, role")
          .eq("id", hrApproverId)
          .maybeSingle(),
        admin
          .from("approval_signature_registry")
          .select("signature_mode, signature_text, signature_data_url")
          .eq("workflow_domain", "leave")
          .eq("user_id", hrApproverId)
          .maybeSingle(),
      ])
      hrApproverProfile = hrProf
      hrSignatureData = hrSig
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

    const effectiveStart = lr.adjusted_start_date || lr.preferred_start_date
    const effectiveEnd   = lr.adjusted_end_date   || lr.preferred_end_date
    const effectiveDays  = Number(lr.adjusted_days || lr.requested_days || 0)

    // Return-to-work date (next business day after leave end)
    const returnDate = new Date(effectiveEnd)
    returnDate.setDate(returnDate.getDate() + 1)
    if (returnDate.getDay() === 6) returnDate.setDate(returnDate.getDate() + 2)
    if (returnDate.getDay() === 0) returnDate.setDate(returnDate.getDate() + 1)
    const returnDateIso = returnDate.toISOString()

    const leaveTypeKey = String(lr.leave_type_key || "annual").toLowerCase()
    const leaveLabel   = leaveTypeLabel(leaveTypeKey)

    // Subject (use memo_draft_subject override if present, else per-type heading)
    const subject = getMemoSubject(leaveTypeKey, String(lr.leave_year_period || "2026/2027"), lr.memo_draft_subject)

    // Body paragraphs
    const templateData = {
      leave_type: leaveLabel,
      leave_start_date: fmtFormalDate(effectiveStart),
      leave_end_date: fmtFormalDate(effectiveEnd),
      approved_days: String(effectiveDays),
      submitted_date: fmtFormalDate(lr.submitted_at || lr.created_at),
      return_to_work_date: fmtFormalDateWithWeekday(returnDateIso),
    }
    const draftBody = renderMemoTemplate(String(lr.memo_draft_body || "").trim(), templateData)

    let paragraphs: string[]
    let closingLine: string
    let useTable = false
    let tableEntitlement = 0
    let tableTravellingDays = 0

    if (draftBody) {
      const blocks = draftBody.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
      paragraphs  = blocks.slice(0, -1).length > 0 ? blocks.slice(0, -1) : blocks
      closingLine = blocks.length > 1 ? blocks[blocks.length - 1] : "You can count on our co-operation."
    } else {
      const built = buildBuiltinBody(lr, effectiveStart, effectiveEnd, effectiveDays, returnDateIso)
      paragraphs        = built.paragraphs
      closingLine       = built.closing
      useTable          = built.useTable
      tableEntitlement  = built.tableEntitlement  ?? 0
      tableTravellingDays = built.tableTravellingDays ?? 0
    }

    // ─── Generate PDF ────────────────────────────────────────────────
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageWidth    = doc.internal.pageSize.getWidth()
    const pageHeight   = doc.internal.pageSize.getHeight()
    const marginLeft   = 24
    const marginRight  = 20
    const contentWidth = pageWidth - marginLeft - marginRight

    // ── Letterhead ──────────────────────────────────────────────────
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

    // ISO certifications (small, centred)
    doc.setFont("times", "normal")
    doc.setFontSize(7)
    doc.setTextColor(60, 60, 60)
    doc.text("ISO/IEC 17020 : 2012", pageWidth / 2, 31, { align: "center" })
    doc.text("ISO/IEC 17025 : 2017", pageWidth / 2, 35, { align: "center" })
    doc.setFont("times", "bold")
    doc.setFontSize(7.5)
    doc.text("ACCREDITED", pageWidth / 2, 39, { align: "center" })

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

    // Ref No + Date row
    doc.setTextColor(0, 0, 0)
    doc.setFont("times", "normal")
    doc.setFontSize(9)
    const approvalDate = lr.hr_approved_at || lr.created_at
    const refYear  = new Date(approvalDate).getFullYear()
    const refCode  = leaveReferenceCode(leaveTypeKey)
    const refNum   = `QCC/HRD/${refCode}/${refYear}/${String(lr.id || "").slice(-6).toUpperCase()}`
    doc.text(`Our Ref No:  ${refNum}`, marginLeft, y)
    doc.text(`Date:  ${fmtFormalDate(approvalDate)}`, pageWidth - marginRight, y, { align: "right" })
    y += 5.5
    doc.text("Your Ref No:  ____________________________", marginLeft, y)
    y += 10

    // ── Recipient block ──────────────────────────────────────────────
    const applicantFullName = fmtName(ap).toUpperCase() || "REQUESTING STAFF"
    const staffNo           = String(ap?.employee_id || ap?.staff_number || "")
    const applicantPosition = String(ap?.position || "STAFF").toUpperCase()
    const applicantDept     = String((ap?.departments as any)?.name || "").toUpperCase()

    doc.setFont("times", "bold")
    doc.setFontSize(9.5)
    doc.text(staffNo ? `${applicantFullName}  (S/NO.:  ${staffNo})` : applicantFullName, marginLeft, y)
    y += 5.5
    doc.text(applicantPosition, marginLeft, y)
    y += 5.5
    if (applicantDept) { doc.text(applicantDept, marginLeft, y); y += 5.5 }
    y += 4

    // ── THRO block ───────────────────────────────────────────────────
    if (hodProfile) {
      const hodName = fmtName(hodProfile).toUpperCase().trim() || "HOD"
      const hodPos  = String((hodProfile as any)?.position || (hodProfile as any)?.role || "").toUpperCase()
      doc.setFont("times", "normal")
      doc.setFontSize(9.2)
      doc.text("THRO:", marginLeft, y)
      doc.text(hodName + (hodPos ? ` - ${hodPos}` : ""), marginLeft + 14, y)
      y += 5.5
      doc.text("QUALITY CONTROL COMPANY LIMITED", marginLeft + 14, y)
      y += 10
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

    // ── Body paragraphs ──────────────────────────────────────────────
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(0, 0, 0)

    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, contentWidth)
      doc.text(lines, marginLeft, y)
      y += lines.length * 5.5 + 5
    }

    // ── Annual leave table ───────────────────────────────────────────
    if (useTable) {
      const entitlementLabel = tableTravellingDays > 0
        ? `${tableEntitlement} plus ${tableTravellingDays} travelling day${tableTravellingDays !== 1 ? "s" : ""}`
        : String(tableEntitlement || effectiveDays)

      const totalGranted = effectiveDays + tableTravellingDays

      autoTable(doc, {
        startY: y,
        margin: { left: marginLeft, right: marginRight },
        tableWidth: contentWidth,
        styles: {
          font: "times",
          fontSize: 9,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
          cellPadding: 2,
        },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
        bodyStyles: { halign: "center" },
        head: [["Number of Days\nEntitled", "Number of Days\nGranted", "From", "To", "Remarks"]],
        body: [
          [
            entitlementLabel,
            String(totalGranted || effectiveDays),
            fmtFormalDate(effectiveStart),
            fmtFormalDate(effectiveEnd),
            "",
          ],
          [
            { content: String(totalGranted || effectiveDays), colSpan: 5, styles: { halign: "center", fontStyle: "bold" } },
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
      // For non-table types, resume duty is already in the paragraphs
    }

    // ── Closing line ─────────────────────────────────────────────────
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    const closingLines = doc.splitTextToSize(closingLine, contentWidth)
    doc.text(closingLines, marginLeft, y)
    y += closingLines.length * 5.5 + 12

    // ── Signature block ───────────────────────────────────────────────
    const sigMode   = String(lr.hr_signature_mode || (hrSignatureData as any)?.signature_mode || "typed")
    const sigText   = String(lr.hr_signature_text   || (hrSignatureData as any)?.signature_text   || "")
    const sigDataUrl = String(lr.hr_signature_data_url || (hrSignatureData as any)?.signature_data_url || "")
    const hrName    = fmtName(hrApproverProfile || {
      first_name: (lr.hr_approver_name || "").split(" ")[0],
      last_name:  (lr.hr_approver_name || "").split(" ").slice(1).join(" "),
    })
    const hrPosition = String((hrApproverProfile as any)?.position || "HR Officer")

    if ((sigMode === "draw" || sigMode === "upload") && sigDataUrl) {
      try {
        const b64 = sigDataUrl.replace(/^data:image\/\w+;base64,/, "")
        doc.addImage(`data:image/png;base64,${b64}`, "PNG", marginLeft, y, 50, 18)
        y += 20
      } catch {
        doc.setFont("times", "italic")
        doc.setTextColor(20, 20, 120)
        doc.text(sigText || hrName, marginLeft, y)
        doc.setTextColor(0, 0, 0)
        y += 7
      }
    } else {
      doc.setFont("times", "italic")
      doc.setFontSize(11)
      doc.setTextColor(20, 20, 120)
      doc.text(sigText || hrName, marginLeft, y)
      doc.setTextColor(0, 0, 0)
      y += 7
    }

    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(0, 0, 0)
    doc.text("_".repeat(35), marginLeft, y)
    y += 5.5
    doc.setFont("times", "bold")
    doc.text((hrName || "HR OFFICER").toUpperCase(), marginLeft, y)
    y += 5
    doc.setFont("times", "normal")
    doc.text((hrPosition || "HUMAN RESOURCES").toUpperCase(), marginLeft, y)
    y += 5
    doc.text("FOR: MANAGING DIRECTOR", marginLeft, y)
    y += 14

    // ── CC block ─────────────────────────────────────────────────────
    doc.setFont("times", "bold")
    doc.setFontSize(8.5)
    doc.text("cc:", marginLeft, y)
    doc.setFont("times", "normal")
    const ccRaw = String(lr.memo_draft_cc || "").trim()
    const ccList: string[] = ccRaw
      ? ccRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      : [
          "Managing Director",
          "Deputy Director, HR (QCC)",
          "Accounts Manager",
          "Dep. Audit Manager",
        ]
    const ccIndent = marginLeft + 10
    for (const cc of ccList) {
      doc.text(cc, ccIndent, y)
      y += 4.8
    }
    y += 3

    // Marks line (approval date)
    doc.setFont("times", "italic")
    doc.setFontSize(8)
    const marksDate = fmtDate(approvalDate).replace(/\s/g, "")
    doc.text(`Marks (${marksDate})`, marginLeft, y)

    // ── Footer ────────────────────────────────────────────────────────
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
    return NextResponse.json({ error: `Failed to generate leave memo: ${msg}` }, { status: 500 })
  }
}
