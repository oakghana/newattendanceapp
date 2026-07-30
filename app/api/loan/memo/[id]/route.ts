import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import fs from "fs"
import path from "path"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import {
  isFdExemptLoanType,
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHodReview,
  canDoHrOffice,
  canDoLoanOffice,
  normalizeRole,
} from "@/lib/loan-workflow"
import { verifyMemoToken } from "@/lib/secure-memo"
import { getMemoLocationAddress } from "@/lib/location-mappings"

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
  // Prefer last_name over surname to avoid duplication if both exist with same value
  const last = String(profile?.last_name || profile?.lastname || profile?.surname || "").trim()
  const parts = [first, middle, last].filter(Boolean)
  // Remove duplicates (e.g., if last_name and surname are identical)
  return [...new Set(parts)].join(" ")
}

function canonicalReference(referenceNumber?: string | null, requestNumber?: string | null) {
  const raw = String(referenceNumber || "").trim()
  const match = raw.match(/^QCC\/HRD\/SWL\/V\.2\/(\d+)$/i)
  if (match) return `QCC/HRD/SWL/V.2/${match[1]}`
  const fallbackSeq = String(requestNumber || "").split("-").pop() || "—"
  return `QCC/HRD/SWL/V.2/${fallbackSeq}`
}

function splitThroTelephoneFromNote(note?: string | null): { cleanedNote: string; telephone: string; throName: string; throRank: string; throLocation: string } {
  const raw = String(note || "").trim()
  if (!raw) return { cleanedNote: "", telephone: "", throName: "", throRank: "", throLocation: "" }
  let cleaned = raw
  const extract = (token: string) => {
    const re = new RegExp(`\\[${token}:([^\\]]+)\\]`, "i")
    const m = cleaned.match(re)
    if (!m) return ""
    cleaned = cleaned.replace(m[0], "").replace(/\s{2,}/g, " ").trim()
    return String(m[1] || "").trim()
  }
  const telephone = extract("THRO_TEL")
  const throName = extract("THRO_NAME")
  const throRank = extract("THRO_RANK")
  const throLocation = extract("THRO_LOC")
  return { cleanedNote: cleaned, telephone, throName, throRank, throLocation }
}

function fmtDate(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString().slice(0, 10)
}

function fmtMemoMonth(value?: string | null) {
  if (!value) return "TBD"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function extractMemoCopyRecipient(note?: string | null) {
  const raw = String(note || "").trim()
  const match = raw.match(/\[MEMO_COPY:([^\]]+)\]/i)
  if (!match) return null
  return String(match[1] || "").trim() || null
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
  const rawLocationName = String((reviewerProfile as any)?.geofence_locations?.name || loan.staff_location_name || "HEAD OFFICE").trim()
  // Apply location mapping (e.g., SWANZY ARCADE → HEAD OFFICE ACCRA, GHANA)
  const locationName = getMemoLocationAddress(rawLocationName, "HEAD OFFICE")

  return {
    name: name || "",
    position,
    location: locationName,
    display: [name.toUpperCase(), position.toUpperCase()].filter(Boolean).join(" - "),
  }
}

function buildMemoBody(loan: any): { subject: string; paragraphs: string[] } {
  const parsedHrNote = splitThroTelephoneFromNote(loan.hr_note)
  const cleanedHrNote = parsedHrNote.cleanedNote
  const amount = `GHc ${fmtAmount(loan.fixed_amount || loan.requested_amount)}`

  if (loan.status === "rejected_fd") {
    // Funeral, Repair, and Issuance loans must never receive a rejection memo —
    // they are forwarded to HR Loan Office whenever FD >= 0, regardless of threshold.
    if (isFdExemptLoanType(loan.loan_type_key, loan.loan_type_label)) {
      return {
        subject: `APPLICATION FOR ${String(loan.loan_type_label || "LOAN").toUpperCase()} — FD REVIEW UPDATE`,
        paragraphs: [
          `We refer to your ${loan.loan_type_label || "loan"} application dated ${fmtDate(loan.fd_checked_at)} and wish to inform you that your request has been reviewed by Accounts.`,
          `FD Score: ${loan.fd_score ?? "N/A"}`,
          `Your application has been forwarded to the HR Loan Office for further processing.`,
          ...(loan.fd_note ? [`Accounts Note: ${loan.fd_note}`] : []),
          "You can count on our co-operation.",
        ],
      }
    }
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
        ...(cleanedHrNote ? [`HR Note: ${cleanedHrNote}`] : []),
        "You will receive a final memo once Director HR concludes review.",
        "You can count on our co-operation.",
      ],
    }
  }

  const disbMonth = fmtMemoMonth(loan.disbursement_date)
  const recovStart = fmtMemoMonth(loan.recovery_start_date)
  const memoCopyRecipient =
    extractMemoCopyRecipient(loan.hr_note) ||
    extractMemoCopyRecipient(loan.loan_office_note) ||
    "Deputy Director, Finance"
  return {
    subject: `APPLICATION FOR ${String(loan.loan_type_label || "LOAN").toUpperCase()}`,
    paragraphs: [
      `We refer to your loan application dated ${fmtDate(loan.created_at)} on the above subject and wish to inform you that, Management has given approval for you to be granted a ${loan.loan_type_label || "Loan"} of ${amount}.`,
      `The loan would be recovered in ${loan.recovery_months || "TBD"} Equal Monthly Instalment from your salary effective, ${recovStart}.`,
      `By a copy of this letter, the ${memoCopyRecipient} has been advised to release the said amount to you effective, ${disbMonth}.`,
      "You can count on our co-operation.",
    ],
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await createAdminClient()
    const { user, authError } = await createClientAndGetUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = request.nextUrl.searchParams.get("token") || ""
    const params = await context.params
    const loanId = params.id

    // Try to verify token if provided, but allow authenticated users who have access
    if (token) {
      const verified = verifyMemoToken(token)
      if (!verified) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

      if (verified.loanId !== loanId || verified.userId !== user.id) {
        return NextResponse.json({ error: "Token does not match request" }, { status: 403 })
      }
    }
    // If no token, we'll check access permissions below instead

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
      role === "managing_director" ||
      role === "secretary" ||
      role === "it-admin" ||
      canDoHodReview(role) ||
      canDoCommittee(role) ||
      canDoLoanOffice(role, deptName, deptCode) ||
      canDoHrOffice(role, deptName, deptCode) ||
      canDoDirectorHr(role, deptName, deptCode) ||
      canDoAccounts(role, deptName, deptCode) ||
      [loan.hod_reviewer_id, loan.committee_reviewer_id, loan.hr_officer_id, loan.director_hr_id].includes(user.id)

    if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Include md_approved and all post-approval statuses so download works across the full workflow
    const memoEligibleStatuses = ["approved_director", "md_approved", "director_rejected", "rejected_fd", "awaiting_director_hr", "staff_receiving_funds", "partially_recovered", "fully_recovered"]
    if (!memoEligibleStatuses.includes(String(loan.status || ""))) {
      return NextResponse.json({ error: "Memo is not available for this current stage" }, { status: 400 })
    }

    // Fetch applicant, director HR profile + signature only
    const applicantId = String(loan.user_id || "")
    let directorHrId = loan.director_hr_id ? String(loan.director_hr_id) : null

    // Fallback for legacy rows: use the latest workflow actor who handled director finalization/terms.
    if (!directorHrId) {
      try {
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
      } catch {
        // loan_request_timeline table may not exist — skip to next fallback
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

    // Fetch MD's user ID from the loan — this is who actually approved
    const mdApproverId = loan.md_approved_by ? String(loan.md_approved_by) : null

    const [{ data: applicantProfile }, { data: directorProfile }, { data: mdProfile }] = await Promise.all([
      admin
        .from("user_profiles")
        .select("*")
        .eq("id", applicantId)
        .single() as any,
      directorHrId
        ? admin
            .from("user_profiles")
            .select("id, first_name, last_name, position, role, signature_data_url")
            .eq("id", directorHrId)
            .single()
        : Promise.resolve({ data: null } as any),
      // Fetch the actual MD profile using md_approved_by — NOT the HR Executive
      mdApproverId
        ? admin
            .from("user_profiles")
            .select("id, first_name, last_name, position, role, signature_data_url")
            .eq("id", mdApproverId)
            .single()
        : // Fallback: find by role managing_director
          admin
            .from("user_profiles")
            .select("id, first_name, last_name, position, role, signature_data_url")
            .eq("role", "managing_director")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle() as any,
    ])

    // ─── Fetch HR Executive signature (for the letter signatory section) ────
    let signerSignatureUrl = ""
    if (directorHrId) {
      try {
        const { data: hrSigRecords } = await admin
          .from("approval_signature_registry")
          .select("id, signature_data_url, signature_mode, signature_text")
          .eq("user_id", directorHrId)
        if (hrSigRecords && hrSigRecords.length > 0) {
          const best = hrSigRecords
            .map((r: any) => {
              const mode = String(r?.signature_mode || "").toLowerCase()
              const hasImage = (mode === "draw" || mode === "drawn" || mode === "upload") && String(r?.signature_data_url || "").trim().length > 0
              return { ...r, score: hasImage ? 100 : 10 }
            })
            .sort((a: any, b: any) => b.score - a.score)[0]
          if (best?.signature_data_url) signerSignatureUrl = best.signature_data_url
        }
      } catch { /* skip */ }
      if (!signerSignatureUrl) {
        try {
          const { data: hrProf } = await admin.from("user_profiles").select("signature_data_url").eq("id", directorHrId).single()
          if (hrProf?.signature_data_url) signerSignatureUrl = hrProf.signature_data_url
        } catch { /* skip */ }
      }
    }

    // ─── Fetch actual MD signature (for the approval stamp) ────────────
    // Uses mdApproverId (loan.md_approved_by) — NOT the HR Executive
    let mdStampSignatureUrl = ""
    let mdStampSignatureText = ""
    const mdProfileId = (mdProfile as any)?.id || mdApproverId
    if (mdProfileId) {
      try {
        const { data: mdSigRecords } = await admin
          .from("approval_signature_registry")
          .select("id, signature_data_url, signature_mode, signature_text")
          .eq("user_id", mdProfileId)
        if (mdSigRecords && mdSigRecords.length > 0) {
          const best = mdSigRecords
            .map((r: any) => {
              const mode = String(r?.signature_mode || "").toLowerCase()
              const hasImage = (mode === "draw" || mode === "drawn" || mode === "upload") && String(r?.signature_data_url || "").trim().length > 0
              const hasTyped = mode === "typed" && String(r?.signature_text || "").trim().length > 0
              return { ...r, score: hasImage ? 100 : hasTyped ? 10 : 0 }
            })
            .sort((a: any, b: any) => b.score - a.score)[0]
          if (best?.signature_data_url) mdStampSignatureUrl = best.signature_data_url
          else if (best?.signature_text) mdStampSignatureText = best.signature_text
        }
      } catch { /* skip */ }
      // Fallback: signature_data_url from user_profiles
      if (!mdStampSignatureUrl) {
        try {
          const { data: mdProf2 } = await admin.from("user_profiles").select("signature_data_url").eq("id", mdProfileId).single()
          if ((mdProf2 as any)?.signature_data_url) mdStampSignatureUrl = (mdProf2 as any).signature_data_url
        } catch { /* skip */ }
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
    const rightBlockX = pageWidth - marginRight - 14
    doc.text("P.O Box M14", rightBlockX, 19)
    doc.text("Accra Ghana", rightBlockX, 24)

    // Green separator under header
    doc.setDrawColor(44, 98, 22)
    doc.setLineWidth(0.5)
    doc.line(marginLeft, 38, pageWidth - marginRight, 38)
    doc.setLineWidth(0.2)
    doc.setDrawColor(210, 210, 210)

    let y = 46

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
    const parsedHrNote = splitThroTelephoneFromNote(loan.hr_note)
    const parsedLoanOfficeNote = splitThroTelephoneFromNote(loan.loan_office_note)
    const hodRank = String(parsedHrNote.throRank || parsedLoanOfficeNote.throRank || loan.hod_rank || throRecipient?.position || "").toUpperCase().trim()
    const rawHodLocation = String(parsedHrNote.throLocation || parsedLoanOfficeNote.throLocation || loan.hod_location || throRecipient?.location || loan.staff_location_name || "HEAD OFFICE ACCRA")
    // Apply location mapping to ensure consistency (e.g., SWANZY ARCADE → HEAD OFFICE ACCRA, GHANA)
    const hodLocation = getMemoLocationAddress(rawHodLocation, "HEAD OFFICE ACCRA, GHANA").toUpperCase()
    if (hodRank || hodLocation) {
      doc.setFont("times", "normal")
      doc.setFontSize(9.2)
      doc.text("THRO:", marginLeft, y)
      doc.text(hodRank || hodLocation, marginLeft + 14, y)
      y += 5.5
      if (hodRank) {
        doc.text("QUALITY CONTROL COMPANY LIMITED", marginLeft + 14, y)
        y += 5.5
        doc.text(hodLocation, marginLeft + 14, y)
      }
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

    // sigImgY: y-position where the signature image is placed, used by applySignatureSideWatermark
    // Initialised to -1 so the text fallback path knows no image has been rendered yet
    let sigImgY = -1

    // Add signature image if available — RENDER ABOVE NAME (exact leave module approach)
    if (signerSignatureUrl && signerSignatureUrl.length > 10) {
      try {
        if (signerSignatureUrl.startsWith("data:image/")) {
          // Base64 data URL
          const b64Match = signerSignatureUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (b64Match) {
            const imageType = b64Match[1].toUpperCase() === "JPEG" ? "JPEG" : "PNG"
            sigImgY = y
            doc.addImage(signerSignatureUrl, imageType, marginLeft, y, 50, 18)
            y += 20
          }
        } else if (signerSignatureUrl.startsWith("https://")) {
          // External URL — fetch and embed (exact leave module pattern)
          try {
            const sigResponse = await fetch(signerSignatureUrl)
            if (sigResponse.ok) {
              const sigBuffer = await sigResponse.arrayBuffer()
              const sigBase64 = Buffer.from(sigBuffer).toString("base64")
              const contentType = sigResponse.headers.get("content-type") || "image/png"
              const imageType = contentType.includes("jpeg") ? "JPEG" : "PNG"
              sigImgY = y
              doc.addImage(`data:${contentType};base64,${sigBase64}`, imageType, marginLeft, y, 50, 18)
              y += 20
            }
          } catch (fetchErr) {
            // Fall through to text fallback
          }
        }
      } catch (err) {
        // Fall through to text fallback
      }
    }

    // Fallback text signature if no image was rendered
    if (sigImgY < 0) {
      const profileName = fmtName(directorProfile)
      const fallbackSigText = (profileName || String((loan as any).director_signature_text || "").trim() || "AUTHORISED SIGNATORY").toUpperCase()
      doc.setFont("times", "bolditalic")
      doc.setFontSize(13)
      doc.setTextColor(0, 0, 0)
      doc.text(fallbackSigText, marginLeft, y + 14)
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

    // ─── cc section + MD Approval Stamp ──────────────────────────────
    if (y + 40 > pageHeight - 16) {
      doc.addPage()
      y = 24
    }

    const ccStartY = y

    doc.setFont("times", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(60, 60, 60)
    const defaultCcList = [
      "Managing Director",
      "Deputy Managing Director",
      "Deputy Director Finance",
      "Deputy Director Human Resource",
      "Audit Manager",
      "Registry Unit",
      "Records Unit",
    ]
    const ccList = loan.memo_cc
      ? loan.memo_cc.split('\n').filter((line: string) => line.trim())
      : defaultCcList
    doc.text("cc:", marginLeft, y)
    ccList.forEach((entry: string, i: number) => {
      doc.text(entry, marginLeft + 10, y + (i + 1) * 4.5)
    })
    y += (ccList.length + 1) * 4.5 + 4

    // ─── MD Approval Stamp — Professional Square Stamp with MD Signature ─
    // Only show if MD has ACTUALLY approved (md_approved_at is populated)
    // Don't show at awaiting_director_hr stage — that means HR signed but MD hasn't approved yet
    const isMdApproved = Boolean(loan.md_approved_at) && ["approved_director", "staff_receiving_funds", "partially_recovered", "fully_recovered"].includes(String(loan.status || ""))
    if (isMdApproved) {
      // ── QCC physical rubber-stamp replica ──────────────────────────────────
      // Rounded rectangle, all QCC blue ink, "QUALITY CONTROL CO. LTD. (COCOBOD)"
      // header, large "APPROVED", signature + date, dotted separator, MANAGING DIRECTOR
      const stampW  = 72   // mm wide
      const stampH  = 54   // mm tall
      const stampX  = pageWidth - marginRight - stampW
      const stampTopY = y - 10   // sit beside the cc list
      const cx      = stampX + stampW / 2
      const r       = 4    // corner radius mm

      // Official QCC stamp blue — matches the physical ink
      const inkR = 30, inkG = 95, inkB = 168   // #1E5FA8

      // ── Outer rounded rectangle (thick border)
      doc.setDrawColor(inkR, inkG, inkB)
      doc.setLineWidth(1.6)
      doc.roundedRect(stampX, stampTopY, stampW, stampH, r, r, "S")

      // ── Inner rounded rectangle (thin inset, 2 mm inside)
      doc.setLineWidth(0.45)
      doc.roundedRect(stampX + 2, stampTopY + 2, stampW - 4, stampH - 4, r - 1, r - 1, "S")

      // ── Top header: "QUALITY CONTROL CO. LTD. (COCOBOD)"
      doc.setFont("helvetica", "bold")
      doc.setFontSize(5.8)
      doc.setTextColor(inkR, inkG, inkB)
      doc.text("QUALITY CONTROL CO. LTD. (COCOBOD)", cx, stampTopY + 8, { align: "center" })

      // Thin solid separator under header
      doc.setDrawColor(inkR, inkG, inkB)
      doc.setLineWidth(0.3)
      doc.line(stampX + 4, stampTopY + 10.5, stampX + stampW - 4, stampTopY + 10.5)

      // ── MD signature image — drawn FIRST so APPROVED text renders on top
      if (mdStampSignatureUrl) {
        try {
          const sigResp = await fetch(mdStampSignatureUrl)
          if (sigResp.ok) {
            const sigBuf = await sigResp.arrayBuffer()
            const sigB64 = Buffer.from(sigBuf).toString("base64")
            const ct = sigResp.headers.get("content-type") || "image/png"
            const imgType = ct.includes("jpeg") ? "JPEG" : "PNG"
            const sigHeight = 22
            doc.addImage(`data:${ct};base64,${sigB64}`, imgType, stampX + 2, stampTopY + 10, stampW - 4, sigHeight)
          }
        } catch { /* signature optional */ }
      } else if (mdStampSignatureText) {
        doc.setFont("times", "bolditalic")
        doc.setFontSize(14)
        doc.setTextColor(inkR, inkG, inkB)
        doc.text(mdStampSignatureText, cx, stampTopY + 24, { align: "center" })
      }

      // ── "APPROVED" — drawn AFTER signature so it appears on top, bold and visible
      doc.setFont("helvetica", "bold")
      doc.setFontSize(17)
      doc.setTextColor(inkR, inkG, inkB)
      doc.text("APPROVED", cx, stampTopY + 16, { align: "center" })

      // ��─ Approval date (e.g. "29-JUL-2026") in blue, centred
      const approvalDateStr = fmtDate(loan.md_approved_at || new Date()).toUpperCase()
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(inkR, inkG, inkB)
      doc.text(approvalDateStr, cx, stampTopY + 31, { align: "center" })

      // ── Dotted separator line (matches physical stamp dots)
      const dotY = stampTopY + 34.5
      doc.setDrawColor(inkR, inkG, inkB)
      doc.setLineWidth(0.28)
      let dx = stampX + 4
      while (dx < stampX + stampW - 4) {
        doc.line(dx, dotY, dx + 0.8, dotY)
        dx += 2.2
      }

      // ── "MANAGING DIRECTOR" footer band — bold, centred
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(inkR, inkG, inkB)
      doc.text("MANAGING DIRECTOR", cx, stampTopY + 41, { align: "center" })

      // Thin solid separator above MD name
      doc.setDrawColor(inkR, inkG, inkB)
      doc.setLineWidth(0.3)
      doc.line(stampX + 4, stampTopY + 43.5, stampX + stampW - 4, stampTopY + 43.5)

      // ── MD personalised name (small, below separator)
      const mdFullName = fmtName(mdProfile) || (loan as any).md_approved_by_name || ""
      if (mdFullName) {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(6)
        doc.setTextColor(inkR, inkG, inkB)
        doc.text(mdFullName.toUpperCase(), cx, stampTopY + 49, { align: "center" })
      }
    }

    applySignatureSideWatermark(doc, sigImgY, marginLeft)

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
