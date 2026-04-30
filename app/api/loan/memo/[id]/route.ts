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

    if (loan.status !== "approved_director") {
      return NextResponse.json({ error: "Memo is available only after Director approval" }, { status: 400 })
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

    const doc = new jsPDF({ unit: "pt", format: "a4" })

    doc.setFontSize(18)
    doc.text("QUALITY CONTROL COMPANY LIMITED", 50, 60)
    doc.setFontSize(12)
    doc.text("HUMAN RESOURCES DEPARTMENT", 50, 82)

    doc.setFontSize(10)
    doc.text(`Reference: ${loan.request_number}`, 50, 120)
    doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, 400, 120)

    const lines = [
      `Subject: Loan Approval Memo - ${loan.loan_type_label}`,
      "",
      `Approved Amount: GHc ${fmtAmount(loan.fixed_amount || loan.requested_amount)}`,
      `Disbursement Date: ${loan.disbursement_date || "TBD"}`,
      `Recovery Start Date: ${loan.recovery_start_date || "TBD"}`,
      `Recovery Months: ${loan.recovery_months || "TBD"}`,
      "",
      loan.director_letter || "Management has approved this loan under stated conditions.",
    ]

    let y = 170
    doc.setFontSize(11)
    for (const line of lines) {
      doc.text(line, 50, y)
      y += 20
    }

    if (signatureBlocks.length > 0) {
      y += 16
      doc.setFontSize(12)
      doc.setTextColor(30, 41, 59)
      doc.text("Approval Signatures", 50, y)
      y += 18

      signatureBlocks.forEach((block, index) => {
        const x = 50 + index * 175
        const profile = profileMap.get(String(block.userId))
        const signature = signatureMap.get(`${block.userId}:${block.stage}`)
        doc.setDrawColor(203, 213, 225)
        doc.roundedRect(x, y, 150, 90, 10, 10)
        doc.setFontSize(10)
        doc.setTextColor(71, 85, 105)
        doc.text(block.label, x + 10, y + 16)

        if (signature?.signature_data_url) {
          try {
            doc.addImage(signature.signature_data_url, "PNG", x + 10, y + 24, 90, 28)
          } catch {
            doc.setFontSize(14)
            doc.setTextColor(15, 23, 42)
            doc.text(signature.signature_text || fmtName(profile), x + 10, y + 46)
          }
        } else {
          doc.setFontSize(14)
          doc.setTextColor(15, 23, 42)
          doc.text(signature?.signature_text || fmtName(profile), x + 10, y + 46)
        }

        doc.setFontSize(9)
        doc.setTextColor(100, 116, 139)
        doc.text(fmtName(profile), x + 10, y + 66)
        doc.text(String(profile?.position || profile?.role || "Approver"), x + 10, y + 80)
      })

      y += 110
    }

    doc.setFontSize(24)
    doc.setTextColor(236, 236, 236)
    doc.text("QCC CONFIDENTIAL", 180, 300, { angle: -24 })
    doc.text("MULTI-SIGNATURE MEMO", 145, 430, { angle: -24 })

    doc.setTextColor(140, 140, 140)
    doc.setFontSize(9)
    doc.text(`Secure Memo ID: ${loan.id}`, 50, 780)
    doc.text(`Generated For User: ${user.id}`, 320, 780)

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
