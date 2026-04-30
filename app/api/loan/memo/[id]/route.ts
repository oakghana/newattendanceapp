import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import fs from "fs"
import path from "path"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHodReview,
  canDoHrOffice,
  canDoLoanOffice,
  normalizeRole,
} from "@/lib/loan-workflow"
import { verifyMemoToken } from "@/lib/secure-memo"

export const runtime = "nodejs"

function fmtAmount(value?: number | null) {
  return Number(value || 0).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtName(profile?: any) {
  const direct = String(profile?.full_name || profile?.display_name || profile?.name || "").trim()
  if (direct) return direct

  const first = String(profile?.first_name || profile?.firstname || "").trim()
  const middle = String(profile?.middle_name || profile?.other_name || "").trim()
  const last = String(profile?.last_name || profile?.lastname || profile?.surname || "").trim()
  return [first, middle, last].filter(Boolean).join(" ")
}

function canonicalReference(referenceNumber?: string | null, requestNumber?: string | null) {
  const raw = String(referenceNumber || "").trim()
  const match = raw.match(/^QCC\/HRD\/SWL\/V\.2\/(\d+)$/i)
  if (match) return `QCC/HRD/SWL/V.2/${match[1]}`
  const fallbackSeq = String(requestNumber || "").split("-").pop() || "—"
  return `QCC/HRD/SWL/V.2/${fallbackSeq}`
}

function fmtDate(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString().slice(0, 10)
}

async function resolveThroRecipient(admin: any, loan: any, applicantId: string) {
  let reviewerId = loan.hod_reviewer_id ? String(loan.hod_reviewer_id) : ""

  if (!reviewerId) {
    const { data: linkage } = await admin
      .from("loan_hod_linkages")
      .select("hod_user_id")
      .eq("staff_user_id", applicantId)
      .limit(1)
      .maybeSingle()
    if ((linkage as any)?.hod_user_id) reviewerId = String((linkage as any).hod_user_id)
  }

  if (!reviewerId) {
    const { data: fallbackReviewer } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", ["department_head", "regional_manager"])
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if ((fallbackReviewer as any)?.id) reviewerId = String((fallbackReviewer as any).id)
  }

  if (!reviewerId) return null

  const { data: reviewerProfile } = await admin
    .from("user_profiles")
    .select("id, first_name, last_name, position, geofence_locations!assigned_location_id(name)")
    .eq("id", reviewerId)
    .maybeSingle()

  if (!reviewerProfile) return null

  const name = `${(reviewerProfile as any).first_name || ""} ${(reviewerProfile as any).last_name || ""}`.trim()
  const position = String((reviewerProfile as any).position || "").trim()
  const locationName = String((reviewerProfile as any)?.geofence_locations?.name || loan.staff_location_name || "HEAD OFFICE").trim()

  return {
    name: name || "",
    position,
    location: locationName,
    display: [name.toUpperCase(), position.toUpperCase()].filter(Boolean).join(" - "),
  }
}

function buildMemoBody(loan: any): { subject: string; paragraphs: string[] } {
  const amount = `GHc ${fmtAmount(loan.fixed_amount || loan.requested_amount)}`

  if (loan.status === "rejected_fd") {
    return {
      subject: "APPLICATION FOR LOAN — FD REVIEW FEEDBACK",
      paragraphs: [
        `We refer to your loan application dated ${fmtDate(loan.fd_checked_at)} on the above subject and wish to inform you that, following Accounts FD review, your request could not proceed at this time.`,
        `FD Score: ${loan.fd_score ?? "N/A"}`,
        `Accounts Note: ${loan.fd_note || "FD value below required threshold."}`,
        "Please regularize your standing and submit again in a future cycle.",
        "You can count on our co-operation.",
      ],
    }
  }

  if (loan.status === "director_rejected") {
    return {
      subject: `DIRECTOR HR DECISION ON LOAN REQUEST`,
      paragraphs: [
        `We refer to your loan application on the above subject and wish to inform you that, after final management review, your loan request was not approved.`,
        `${loan.director_note ? `Director's Note: ${loan.director_note}` : "Director's Note: Not stated."}`,
        "For further guidance, kindly liaise with HR Office.",
        "You can count on our co-operation.",
      ],
    }
  }

  if (loan.status === "awaiting_director_hr") {
    return {
      subject: `APPLICATION FOR ${String(loan.loan_type_label || "LOAN").toUpperCase()} (TERMS SET)`,
      paragraphs: [
        `We refer to your loan application dated ${fmtDate(loan.hr_forwarded_at)} on the above subject and wish to inform you that HR has prepared your loan terms and forwarded your request to Director HR for final decision.`,
        `Proposed Disbursement Date: ${fmtDate(loan.disbursement_date)}`,
        `Proposed Recovery Start Date: ${fmtDate(loan.recovery_start_date)}`,
        `Proposed Recovery Duration: ${loan.recovery_months || "TBD"} month(s)`,
        ...(loan.hr_note ? [`HR Note: ${loan.hr_note}`] : []),
        "You will receive a final memo once Director HR concludes review.",
        "You can count on our co-operation.",
      ],
    }
  }

  const disbMonth = loan.disbursement_date
    ? new Date(loan.disbursement_date).toLocaleString("en-GH", { month: "long", year: "numeric" })
    : "TBD"
  const recovStart = loan.recovery_start_date
    ? new Date(loan.recovery_start_date).toLocaleString("en-GH", { month: "long", year: "numeric" })
    : "TBD"
  return {
    subject: `APPLICATION FOR ${String(loan.loan_type_label || "LOAN").toUpperCase()}`,
    paragraphs: [
      `We refer to your loan application dated ${fmtDate(loan.created_at)} on the above subject and wish to inform you that, Management has given approval for you to be granted a ${loan.loan_type_label || "Loan"} of ${amount}.`,
      `The loan would be recovered in ${loan.recovery_months || "TBD"} Equal Monthly Instalment from your salary effective, ${recovStart}.`,
      `By a copy of this letter, the Accounts Manager is been advised to release the said amount to you effective, ${disbMonth}.`,
      "You can count on our co-operation.",
    ],
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = request.nextUrl.searchParams.get("token") || ""
    const verified = verifyMemoToken(token)
    if (!verified) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

    const params = await context.params
    const loanId = params.id

    if (verified.loanId !== loanId || verified.userId !== user.id) {
      return NextResponse.json({ error: "Token does not match request" }, { status: 403 })
    }

    const [{ data: profile, error: profileError }, { data: loan, error: loanError }] = await Promise.all([
      admin
        .from("user_profiles")
        .select("id, role, departments(name, code)")
        .eq("id", user.id)
        .single(),
      admin
        .from("loan_requests")
        .select("*")
        .eq("id", loanId)
        .single(),
    ])

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    if (loanError || !loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 })

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const canAccess =
      loan.user_id === user.id ||
      role === "admin" ||
      canDoHodReview(role) ||
      canDoCommittee(role) ||
      canDoLoanOffice(role, deptName, deptCode) ||
      canDoHrOffice(role, deptName, deptCode) ||
      canDoDirectorHr(role, deptName, deptCode) ||
      canDoAccounts(role, deptName, deptCode) ||
      [loan.hod_reviewer_id, loan.committee_reviewer_id, loan.hr_officer_id, loan.director_hr_id].includes(user.id)

    if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const memoEligibleStatuses = ["approved_director", "director_rejected", "rejected_fd", "awaiting_director_hr"]
    if (!memoEligibleStatuses.includes(String(loan.status || ""))) {
      return NextResponse.json({ error: "Memo is not available for this current stage" }, { status: 400 })
    }

    // Fetch applicant, director HR profile + signature only
    const applicantId = String(loan.user_id || "")
    let directorHrId = loan.director_hr_id ? String(loan.director_hr_id) : null

    // Fallback for legacy rows: use the latest workflow actor who handled director finalization/terms.
    if (!directorHrId) {
      const { data: actorRow } = await admin
        .from("loan_request_timeline")
        .select("actor_id, action_key")
        .eq("loan_request_id", loan.id)
        .in("action_key", ["director_finalize", "hr_set_terms"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if ((actorRow as any)?.actor_id) {
        const fallbackActorId = String((actorRow as any).actor_id)
        const { data: fallbackActor } = await admin
          .from("user_profiles")
          .select("id, role")
          .eq("id", fallbackActorId)
          .maybeSingle()
        const fallbackRole = normalizeRole((fallbackActor as any)?.role)
        if (["director_hr", "manager_hr", "hr_director"].includes(fallbackRole)) {
          directorHrId = fallbackActorId
        }
      }
    }

    if (!directorHrId) {
      const { data: assignedApprover } = await admin
        .from("user_profiles")
        .select("id, role")
        .in("role", ["director_hr", "manager_hr", "hr_director"])
        .eq("is_active", true)
        .limit(1)
        .maybeSingle()
      if ((assignedApprover as any)?.id) {
        directorHrId = String((assignedApprover as any).id)
      }
    }

    const throRecipient = await resolveThroRecipient(admin, loan, applicantId)

    const [
      { data: applicantProfile },
      { data: directorProfile },
      { data: directorSignature, error: signatureError },
    ] = await Promise.all([
      admin
        .from("user_profiles")
        .select("*")
        .eq("id", applicantId)
        .single() as any,
      directorHrId
        ? admin
            .from("user_profiles")
            .select("id, first_name, last_name, position, role")
            .eq("id", directorHrId)
            .single()
        : Promise.resolve({ data: null } as any),
      directorHrId
        ? admin
            .from("approval_signature_registry")
            .select("user_id, approval_stage, signature_mode, signature_text, signature_data_url")
            .eq("workflow_domain", "loan")
            .eq("user_id", directorHrId)
            .eq("approval_stage", "director_hr")
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ])

    if (signatureError) {
      const signatureMessage = String(signatureError.message || "")
      if (!/does not exist|schema cache|relation/i.test(signatureMessage)) {
        throw signatureError
      }
    }

    // Load QCC logo
    let logoBase64: string | null = null
    try {
      const logoPath = path.join(process.cwd(), "public", "images", "qcc-logo.png")
      logoBase64 = fs.readFileSync(logoPath).toString("base64")
    } catch {
      // logo unavailable, continue without it
    }

    const { subject, paragraphs } = buildMemoBody(loan)
    const memoDate = fmtDate(
      loan.director_decision_at || loan.hr_forwarded_at || loan.fd_checked_at || loan.created_at,
    )
    const refNumber = canonicalReference((loan as any).reference_number, loan.request_number)

    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginLeft = 24
    const marginRight = 20
    const contentWidth = pageWidth - marginLeft - marginRight

    // ─── Header: Logo + Company Name + Address ────────────────────────
    if (logoBase64) {
      try {
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", marginLeft, 13, 22, 22)
      } catch {
        // skip logo render failure
      }
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
    doc.text("P.O Box M14", pageWidth - marginRight - 14, 19)
    doc.text("Accra Ghana", pageWidth - marginRight - 14, 24)

    // Green separator under header
    doc.setDrawColor(44, 98, 22)
    doc.setLineWidth(0.5)
    doc.line(marginLeft, 33, pageWidth - marginRight, 33)
    doc.setLineWidth(0.2)
    doc.setDrawColor(210, 210, 210)

    let y = 41

    // ─── Our Ref No + Date ────────────────────────────────────────────
    doc.setTextColor(0, 0, 0)
    doc.setFont("times", "normal")
    doc.setFontSize(9)
    doc.text(`Our Ref No:  ${refNumber}`, marginLeft, y)
    doc.text(`Date:  ${memoDate}`, pageWidth - marginRight - 42, y)
    y += 5.5
    doc.text("Your Ref No:  ____________________________", marginLeft, y)
    y += 10

    // ─── Applicant block ──────────────────────────────────────────────
    const applicantFullName = (
      fmtName(applicantProfile) ||
      String((loan as any)?.staff_full_name || "").trim() ||
      "REQUESTING STAFF"
    ).toUpperCase()
    const applicantStaffNo =
      String((applicantProfile as any)?.employee_id || (applicantProfile as any)?.staff_number || loan.staff_number || "")
    const applicantPosition = String((applicantProfile as any)?.position || loan.staff_rank || "STAFF").toUpperCase()

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
    y += 10

    // ─── THRO section ─────────────────────────────────────────────────
    const hodName = String(throRecipient?.display || loan.hod_name || "").toUpperCase().trim()
    const hodLocation = String(throRecipient?.location || loan.hod_location || loan.staff_location_name || "HEAD OFFICE ACCRA").toUpperCase()
    if (hodName) {
      doc.setFont("times", "normal")
      doc.setFontSize(9.2)
      doc.text("THRO:", marginLeft, y)
      doc.text(hodName, marginLeft + 14, y)
      y += 5.5
      doc.text("QUALITY CONTROL COMPANY LIMITED", marginLeft + 14, y)
      y += 5.5
      doc.text(hodLocation, marginLeft + 14, y)
      y += 10
    }

    // ─── RE: Subject ──────────────────────────────────────────────────
    doc.setFont("times", "bold")
    doc.setFontSize(9.5)
    const reText = `RE:  ${subject}`
    const reLines = doc.splitTextToSize(reText, contentWidth)
    doc.text(reLines, marginLeft, y)
    // underline
    const underlineW = Math.min(doc.getTextWidth(reText), contentWidth)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(marginLeft, y + 1.2, marginLeft + underlineW, y + 1.2)
    y += reLines.length * 6 + 6

    // ─── Body paragraphs ──────────────────────────────────────────────
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    for (const para of paragraphs) {
      if (!para.trim()) { y += 3; continue }
      const wrapped = doc.splitTextToSize(para, contentWidth)
      if (y + wrapped.length * 5.5 > pageHeight - 65) {
        doc.addPage()
        y = 24
      }
      doc.text(wrapped, marginLeft, y)
      y += wrapped.length * 5.5 + 4
    }

    y += 8

    // ─── Director HR Signature ────────────────────────────────────────
    if (y + 50 > pageHeight - 20) {
      doc.addPage()
      y = 24
    }

    const sigRecord = directorSignature as any
    if (sigRecord?.signature_data_url) {
      try {
        doc.addImage(sigRecord.signature_data_url, "PNG", marginLeft, y, 50, 18)
        y += 20
      } catch {
        y += 20
      }
    } else if (sigRecord?.signature_text) {
      doc.setFont("times", "italic")
      doc.setFontSize(12)
      doc.setTextColor(30, 60, 100)
      doc.text(sigRecord.signature_text, marginLeft, y + 14)
      y += 20
      doc.setTextColor(0, 0, 0)
    } else {
      // blank space for signature
      y += 20
    }

    // Signature line
    doc.setTextColor(0, 0, 0)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)
    doc.line(marginLeft, y, marginLeft + 65, y)
    y += 5.5

    // Name (bold)
    const dirName = fmtName(directorProfile).toUpperCase()
    const dirTitle = String((directorProfile as any)?.position || (directorProfile as any)?.role || "APPROVING AUTHORITY").replace(/_/g, " ").toUpperCase()
    doc.setFont("times", "bold")
    doc.setFontSize(10)
    doc.text(dirName || "APPROVING AUTHORITY", marginLeft, y)
    y += 5.5

    // Title
    doc.setFont("times", "normal")
    doc.setFontSize(9.5)
    doc.text(dirTitle, marginLeft, y)
    y += 5.5

    // FOR: MANAGING DIRECTOR
    doc.setFont("times", "bold")
    doc.text("FOR:  MANAGING DIRECTOR", marginLeft, y)
    y += 12

    // ─── cc section ───────────────────────────────────────────────────
    if (y + 40 > pageHeight - 16) {
      doc.addPage()
      y = 24
    }
    doc.setFont("times", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(60, 60, 60)
    const ccList = [
      "Managing Director",
      "Deputy Managing Director",
      "Deputy Director Finance",
      "Deputy Director Human Resource",
      "Audit Manager",
      "Registry Unit",
      "Records Unit",
    ]
    doc.text("cc:", marginLeft, y)
    ccList.forEach((entry, i) => {
      doc.text(entry, marginLeft + 10, y + (i + 1) * 4.5)
    })
    y += (ccList.length + 1) * 4.5 + 4

    const pdfBytes = Buffer.from(doc.output("arraybuffer"))

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=loan-memo-${loan.request_number}.pdf`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    })
  } catch (error: any) {
    console.error("secure memo pdf error", error)
    return NextResponse.json({ error: error?.message || "Failed to render secure memo" }, { status: 500 })
  }
}
