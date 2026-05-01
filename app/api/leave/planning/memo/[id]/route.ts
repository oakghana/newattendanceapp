import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
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
  }
  return map[key] || String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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
      const logoPath = path.join(process.cwd(), "public", "images", "qcc-logo.png")
      logoBase64 = fs.readFileSync(logoPath).toString("base64")
    } catch {
      // continue without logo
    }

    // ─── Build memo content ───────────────────────────────────────────
    const lr = leaveRequest as any
    const ap = applicantProfile as any

    const effectiveStart = lr.adjusted_start_date || lr.preferred_start_date
    const effectiveEnd = lr.adjusted_end_date || lr.preferred_end_date
    const effectiveDays = lr.adjusted_days || lr.requested_days
    const wasAdjusted = !!lr.adjusted_days && lr.adjusted_days !== lr.original_requested_days

    const leaveLabel = leaveTypeLabel(String(lr.leave_type_key || "annual"))
    const subject = String(lr.memo_draft_subject || "").trim() || `APPLICATION FOR ${leaveLabel.toUpperCase()} — ${lr.leave_year_period || "2026/2027"}`

    // Return-to-work date (next business day after leave end)
    const returnDate = new Date(effectiveEnd)
    returnDate.setDate(returnDate.getDate() + 1)
    // Skip weekend
    if (returnDate.getDay() === 6) returnDate.setDate(returnDate.getDate() + 2)
    if (returnDate.getDay() === 0) returnDate.setDate(returnDate.getDate() + 1)

    const paragraphs: string[] = []
    const draftBody = String(lr.memo_draft_body || "").trim()
    if (draftBody) {
      for (const block of draftBody.split(/\n\s*\n/)) {
        const trimmed = block.trim()
        if (trimmed) paragraphs.push(trimmed)
      }
    } else {
      paragraphs.push(
        `We refer to your application for ${leaveLabel} dated ${fmtDate(lr.submitted_at)} on the above subject and wish to inform you that Management has approved your leave request as follows:`,
      )
      paragraphs.push(
        `Leave Type: ${leaveLabel}\nLeave Period: ${fmtDate(effectiveStart)} to ${fmtDate(effectiveEnd)}\nApproved Days: ${effectiveDays} day(s)\nReturn to Work Date: ${fmtDate(returnDate.toISOString())}`,
      )
    }

    if (wasAdjusted && lr.adjustment_reason) {
      const breakdown: string[] = [`Original Requested Days: ${lr.original_requested_days || lr.requested_days}`]
      if (Number(lr.holiday_days_deducted) > 0)
        breakdown.push(`Less Public Holiday Days: -${lr.holiday_days_deducted}`)
      if (Number(lr.prior_leave_days_deducted) > 0)
        breakdown.push(`Less Prior Leave Enjoyed: -${lr.prior_leave_days_deducted}`)
      if (Number(lr.travelling_days_added) > 0)
        breakdown.push(`Plus Travelling Days: +${lr.travelling_days_added}`)
      breakdown.push(`Adjusted Days: ${effectiveDays}`)
      paragraphs.push(`Leave Days Adjustment:\n${breakdown.join("\n")}\n\nReason for Adjustment: ${lr.adjustment_reason}`)
    }

    if (lr.hr_approval_note) {
      paragraphs.push(`HR Note: ${lr.hr_approval_note}`)
    }

    paragraphs.push(
      `By a copy of this letter, the relevant departments are notified of your approved leave period.`,
    )
    paragraphs.push("You can count on our co-operation.")

    // ─── Generate PDF ────────────────────────────────────────────────
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const marginLeft = 24
    const marginRight = 20
    const contentWidth = pageWidth - marginLeft - marginRight

    // Header
    if (logoBase64) {
      try {
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", marginLeft, 13, 22, 22)
      } catch { /* skip */ }
    }

    doc.setTextColor(44, 98, 22)
    doc.setFont("times", "bold")
    doc.setFontSize(15)
    doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, 20, { align: "center" })
    doc.setFontSize(13)
    doc.text("(COCOBOD)", pageWidth / 2, 28, { align: "center" })

    doc.setFont("times", "italic")
    doc.setFontSize(8)
    doc.setTextColor(70, 70, 70)
    const rightBlockX = pageWidth - marginRight - 14
    doc.text("P.O Box M14", rightBlockX, 19)
    doc.text("Accra Ghana", rightBlockX, 24)
    doc.text(`Date: ${fmtDate(lr.hr_approved_at || lr.created_at)}`, rightBlockX, 29)

    doc.setDrawColor(44, 98, 22)
    doc.setLineWidth(0.5)
    doc.line(marginLeft, 38, pageWidth - marginRight, 38)
    doc.setLineWidth(0.2)
    doc.setDrawColor(210, 210, 210)

    let y = 46

    // Ref + Date
    doc.setTextColor(0, 0, 0)
    doc.setFont("times", "normal")
    doc.setFontSize(9)
    const refNum = `QCC/HRD/LV/${new Date(lr.hr_approved_at || lr.created_at).getFullYear()}/${String(lr.id || "").slice(-6).toUpperCase()}`
    doc.text(`Our Ref No:  ${refNum}`, marginLeft, y)
    y += 5.5
    doc.text("Your Ref No:  ____________________________", marginLeft, y)
    y += 10

    // Applicant block
    const applicantFullName = (fmtName(ap) || "REQUESTING STAFF").toUpperCase()
    const applicantStaffNo = String(ap?.employee_id || ap?.staff_number || "")
    const applicantPosition = String(ap?.position || "STAFF").toUpperCase()
    const applicantDept = String(ap?.departments?.name || "").toUpperCase()

    doc.setFont("times", "bold")
    doc.setFontSize(9.5)
    doc.text(
      applicantStaffNo
        ? `${applicantFullName}  (S/No.:  ${applicantStaffNo})`
        : applicantFullName,
      marginLeft,
      y,
    )
    y += 5.5
    doc.text(applicantPosition, marginLeft, y)
    y += 5.5
    if (applicantDept) {
      doc.text(applicantDept, marginLeft, y)
      y += 5.5
    }
    y += 4

    // THRO block
    if (hodProfile) {
      const hodName = fmtName(hodProfile).toUpperCase().trim() || "HOD"
      const hodPos = String(hodProfile?.position || hodProfile?.role || "").toUpperCase()
      doc.setFont("times", "normal")
      doc.setFontSize(9.2)
      doc.text("THRO:", marginLeft, y)
      doc.text(hodName + (hodPos ? ` - ${hodPos}` : ""), marginLeft + 14, y)
      y += 5.5
      doc.text("QUALITY CONTROL COMPANY LIMITED", marginLeft + 14, y)
      y += 10
    }

    // RE: Subject
    doc.setFont("times", "bold")
    doc.setFontSize(9.5)
    const reText = `RE:  ${subject}`
    const reLines = doc.splitTextToSize(reText, contentWidth)
    doc.text(reLines, marginLeft, y)
    // Underline the RE subject
    const reWidth = doc.getTextWidth(reText) > contentWidth ? contentWidth : doc.getTextWidth(reText)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(marginLeft, y + 1.5, marginLeft + Math.min(reWidth, contentWidth), y + 1.5)
    y += reLines.length * 5.5 + 8

    // Body paragraphs
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, contentWidth)
      doc.text(lines, marginLeft, y)
      y += lines.length * 5.5 + 5
    }

    y += 10

    // Signature block
    const sigMode = String(lr.hr_signature_mode || (hrSignatureData as any)?.signature_mode || "typed")
    const sigText = String(lr.hr_signature_text || (hrSignatureData as any)?.signature_text || "")
    const sigDataUrl = String(lr.hr_signature_data_url || (hrSignatureData as any)?.signature_data_url || "")
    const hrName = fmtName(hrApproverProfile || { first_name: (lr.hr_approver_name || "").split(" ")[0], last_name: (lr.hr_approver_name || "").split(" ").slice(1).join(" ") })
    const hrPosition = String((hrApproverProfile as any)?.position || "HR Officer")

    if (sigMode === "draw" && sigDataUrl) {
      try {
        const base64 = sigDataUrl.replace(/^data:image\/\w+;base64,/, "")
        doc.addImage(`data:image/png;base64,${base64}`, "PNG", marginLeft, y, 50, 18)
        y += 20
      } catch {
        doc.setFont("times", "italic")
        doc.text(sigText || hrName, marginLeft, y)
        y += 7
      }
    } else if (sigMode === "upload" && sigDataUrl) {
      try {
        const base64 = sigDataUrl.replace(/^data:image\/\w+;base64,/, "")
        doc.addImage(`data:image/png;base64,${base64}`, "PNG", marginLeft, y, 50, 18)
        y += 20
      } catch {
        doc.setFont("times", "italic")
        doc.text(sigText || hrName, marginLeft, y)
        y += 7
      }
    } else {
      // Typed signature
      doc.setFont("times", "italic")
      doc.setFontSize(11)
      doc.setTextColor(20, 20, 120)
      doc.text(sigText || hrName, marginLeft, y)
      doc.setTextColor(0, 0, 0)
      y += 7
    }

    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    doc.text("_".repeat(35), marginLeft, y)
    y += 5.5
    doc.setFont("times", "bold")
    doc.text(hrName.toUpperCase() || "HR OFFICER", marginLeft, y)
    y += 5
    doc.setFont("times", "normal")
    doc.text(hrPosition.toUpperCase() || "HUMAN RESOURCES", marginLeft, y)
    y += 5
    doc.text("QUALITY CONTROL COMPANY LIMITED", marginLeft, y)
    y += 14

    // CC block
    doc.setFont("times", "bold")
    doc.setFontSize(9)
    doc.text("CC:", marginLeft, y)
    doc.setFont("times", "normal")
    const ccEntries: string[] = []
    const draftCc = String(lr.memo_draft_cc || "").trim()
    if (draftCc) {
      for (const line of draftCc.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed) ccEntries.push(trimmed)
      }
    } else {
      if (hodProfile) {
        ccEntries.push(`${fmtName(hodProfile).toUpperCase()} — ${String(hodProfile?.position || hodProfile?.role || "HOD").toUpperCase()}`)
      }
      ccEntries.push("ACCOUNTS MANAGER — QUALITY CONTROL COMPANY LIMITED")
      ccEntries.push("HR LEAVE OFFICE — HUMAN RESOURCES DEPARTMENT")
      ccEntries.push("FILE")
    }

    let ccX = marginLeft + 10
    for (const cc of ccEntries) {
      doc.text(cc, ccX, y)
      y += 5
    }

    // Footer border
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setDrawColor(44, 98, 22)
    doc.setLineWidth(0.5)
    doc.line(marginLeft, pageHeight - 18, pageWidth - marginRight, pageHeight - 18)
    doc.setFont("times", "italic")
    doc.setFontSize(7.5)
    doc.setTextColor(100, 100, 100)
    doc.text("QUALITY CONTROL COMPANY LIMITED (COCOBOD) — Confidential HR Document", pageWidth / 2, pageHeight - 13, { align: "center" })

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
