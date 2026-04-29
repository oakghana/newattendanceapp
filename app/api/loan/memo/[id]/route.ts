import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoDirectorHr,
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
      canDoLoanOffice(role, deptName, deptCode) ||
      canDoHrOffice(role, deptName, deptCode) ||
      canDoDirectorHr(role, deptName, deptCode) ||
      canDoAccounts(role, deptName, deptCode)

    if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (loan.status !== "approved_director") {
      return NextResponse.json({ error: "Memo is available only after Director approval" }, { status: 400 })
    }

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
      "",
      "Authorized Signatory:",
      loan.director_signature_text || "Director HR",
    ]

    let y = 170
    doc.setFontSize(11)
    for (const line of lines) {
      doc.text(line, 50, y)
      y += 20
    }

    doc.setFontSize(24)
    doc.setTextColor(236, 236, 236)
    doc.text("QCC CONFIDENTIAL", 180, 300, { angle: -24 })
    doc.text("DIRECTOR HR SIGNED", 160, 430, { angle: -24 })

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
