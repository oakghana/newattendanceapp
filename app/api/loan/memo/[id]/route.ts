import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
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
  const first = String(profile?.first_name || "").trim()
  const last = String(profile?.last_name || "").trim()
  return [first, last].filter(Boolean).join(" ") || String(profile?.position || profile?.role || "Approver")
}

function fmtDate(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString().slice(0, 10)
}

function buildMemoLines(loan: any) {
  const amount = `GHc ${fmtAmount(loan.fixed_amount || loan.requested_amount)}`

  if (loan.status === "rejected_fd") {
    return [
      "RE: LOAN REQUEST FEEDBACK (FD REVIEW)",
      "",
      `Reference: ${loan.request_number}`,
      `Loan Type: ${loan.loan_type_label}`,
      `Requested Amount: ${amount}`,
      "",
      "Dear Staff,",
      "",
      "Following Accounts FD review, your request could not proceed at this time.",
      `FD Score: ${loan.fd_score ?? "N/A"}`,
      `Accounts Note: ${loan.fd_note || "FD value below required threshold."}`,
      "",
      "Please regularize your standing and submit again in a future cycle.",
      "",
      "Thank you.",
    ]
  }

  if (loan.status === "director_rejected") {
    return [
      "RE: DIRECTOR HR DECISION ON LOAN REQUEST",
      "",
      `Reference: ${loan.request_number}`,
      `Loan Type: ${loan.loan_type_label}`,
      `Requested Amount: ${amount}`,
      "",
      "Dear Staff,",
      "",
      "After final management review, your loan request was not approved.",
      `${loan.director_note ? `Director's Note: ${loan.director_note}` : "Director's Note: Not stated."}`,
      "",
      "For further guidance, kindly liaise with HR Office.",
      "",
      "Thank you.",
    ]
  }

  if (loan.status === "awaiting_director_hr") {
    return [
      "RE: LOAN TERMS SET BY HR OFFICE",
      "",
      `Reference: ${loan.request_number}`,
      `Loan Type: ${loan.loan_type_label}`,
      `Provisional Amount: ${amount}`,
      "",
      "Dear Staff,",
      "",
      "HR has prepared your loan terms and forwarded your request to Director HR for final decision.",
      `Proposed Disbursement Date: ${loan.disbursement_date || "TBD"}`,
      `Proposed Recovery Start Date: ${loan.recovery_start_date || "TBD"}`,
      `Proposed Recovery Duration: ${loan.recovery_months || "TBD"} month(s)`,
      `${loan.hr_note ? `HR Note: ${loan.hr_note}` : ""}`,
      "",
      "You will receive a final memo once Director HR concludes review.",
    ]
  }

  return [
    "RE: LOAN APPROVAL MEMO",
    "",
    `Reference: ${loan.request_number}`,
    `Loan Type: ${loan.loan_type_label}`,
    `Approved Amount: ${amount}`,
    `Disbursement Date: ${loan.disbursement_date || "TBD"}`,
    `Recovery Start Date: ${loan.recovery_start_date || "TBD"}`,
    `Recovery Months: ${loan.recovery_months || "TBD"}`,
    "",
    loan.director_letter || "Management has approved this loan under the stated terms and conditions.",
    "",
    "Please proceed with HR/Accounts for implementation.",
  ]
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

    const approverIds = Array.from(
      new Set([loan.hod_reviewer_id, loan.hr_officer_id, loan.director_hr_id].filter(Boolean).map((value: any) => String(value))),
    )

    const [{ data: approverProfiles }, { data: registrySignatures, error: signatureError }] = await Promise.all([
      approverIds.length > 0
        ? admin.from("user_profiles").select("id, first_name, last_name, position, role").in("id", approverIds)
        : Promise.resolve({ data: [], error: null } as any),
      approverIds.length > 0
        ? admin
            .from("approval_signature_registry")
            .select("user_id, approval_stage, signature_mode, signature_text, signature_data_url")
            .eq("workflow_domain", "loan")
            .in("user_id", approverIds)
            .in("approval_stage", ["hod_review", "hr_terms", "director_hr"])
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (signatureError) {
      const signatureMessage = String(signatureError.message || "")
      if (!/does not exist|schema cache|relation/i.test(signatureMessage)) {
        throw signatureError
      }
    }

    const profileMap = new Map((approverProfiles || []).map((row: any) => [row.id, row]))
    const signatureMap = new Map(
      ((registrySignatures as any[]) || []).map((row: any) => [`${row.user_id}:${row.approval_stage}`, row]),
    )

    const signatureBlocks = [
      { stage: "hod_review", label: "HOD Review", userId: loan.hod_reviewer_id },
      { stage: "hr_terms", label: "HR Terms", userId: loan.hr_officer_id },
      { stage: "director_hr", label: "Director HR Approval", userId: loan.director_hr_id },
    ].filter((block) => Boolean(block.userId))

    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginLeft = 24
    const marginRight = 20
    const contentWidth = pageWidth - marginLeft - marginRight

    doc.setDrawColor(210, 210, 210)
    doc.setLineWidth(0.2)
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20)

    doc.setTextColor(44, 98, 22)
    doc.setFont("times", "bold")
    doc.setFontSize(14)
    doc.text("QUALITY CONTROL COMPANY LIMITED", pageWidth / 2, 22, { align: "center" })
    doc.text("(COCOBOD)", pageWidth / 2, 29, { align: "center" })

    doc.setFont("times", "italic")
    doc.setFontSize(8)
    doc.setTextColor(70, 70, 70)
    doc.text("P.O Box M14", pageWidth - 42, 22)
    doc.text("Accra Ghana", pageWidth - 42, 27)
    doc.setFont("times", "normal")
    doc.setFontSize(8.4)
    doc.text(`Date: ${fmtDate(loan.director_decision_at || loan.hr_forwarded_at || loan.fd_checked_at)}`, pageWidth - 42, 33)

    doc.setTextColor(0, 0, 0)
    doc.setFont("times", "bold")
    doc.setFontSize(9)
    doc.text(`Our Ref No: ${loan.request_number}`, marginLeft, 40)

    let y = 50
    doc.setFont("times", "normal")
    doc.setFontSize(9.2)
    const lines = buildMemoLines(loan)
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(line, contentWidth)
      doc.text(wrapped, marginLeft, y)
      y += wrapped.length * 5
      if (y > pageHeight - 55) {
        doc.addPage()
        y = 24
      }
    }

    if (signatureBlocks.length > 0) {
      y += 10
      doc.setFontSize(12)
      doc.setTextColor(30, 41, 59)
      doc.text("Approval Signatures", marginLeft, y)
      y += 10

      signatureBlocks.forEach((block, index) => {
        const x = marginLeft + index * 56
        const profile = profileMap.get(String(block.userId))
        const signature = signatureMap.get(`${block.userId}:${block.stage}`)
        doc.setDrawColor(203, 213, 225)
        doc.roundedRect(x, y, 52, 35, 2, 2)
        doc.setFontSize(7.5)
        doc.setTextColor(71, 85, 105)
        doc.text(block.label, x + 3, y + 5)

        if (signature?.signature_data_url) {
          try {
            doc.addImage(signature.signature_data_url, "PNG", x + 3, y + 8, 26, 10)
          } catch {
            doc.setFontSize(8.5)
            doc.setTextColor(15, 23, 42)
            doc.text(signature.signature_text || fmtName(profile), x + 3, y + 16)
          }
        } else {
          doc.setFontSize(8.5)
          doc.setTextColor(15, 23, 42)
          doc.text(signature?.signature_text || fmtName(profile), x + 3, y + 16)
        }

        doc.setFontSize(6.8)
        doc.setTextColor(100, 116, 139)
        doc.text(fmtName(profile), x + 3, y + 25)
        doc.text(String(profile?.position || profile?.role || "Approver"), x + 3, y + 30)
      })

      y += 42
    }

    doc.setFontSize(38)
    doc.setTextColor(235, 235, 235)
    doc.setFont("times", "bold")
    doc.text("Loan App", pageWidth / 2 - 20, pageHeight / 2 + 8, { angle: -28 })

    doc.setTextColor(140, 140, 140)
    doc.setFontSize(7)
    doc.text(`Secure Memo ID: ${loan.id}`, marginLeft, pageHeight - 14)
    doc.text(`Generated For User: ${user.id}`, pageWidth - 70, pageHeight - 14)

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
