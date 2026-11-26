import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { isAdminRole, normalizeRole } from "@/lib/loan-workflow"

const CORRECTABLE_STATUSES = [
  "approved_director",
  "md_approved",
  "referenced",
  "staff_receiving_funds",
  "partially_recovered",
  "fully_recovered",
]

export async function PATCH(request: NextRequest) {
  try {
    const { user, authError } = await createClientAndGetUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role, position")
      .eq("id", user.id)
      .maybeSingle()
    const role = normalizeRole(String(profile?.role || (user.user_metadata as Record<string, unknown> | undefined)?.role || ""))
    const isAdministrator = isAdminRole(role)
    if (!isAdministrator) return NextResponse.json({ error: "Only an administrator can correct an approved loan memo." }, { status: 403 })

    const body = await request.json()
    const loanId = String(body.loanId || "").trim()
    const correctedContent = String(body.correctedContent || "").trim()
    const expectedContent = String(body.expectedContent || "")
    const reason = String(body.reason || "").trim()
    if (!loanId) return NextResponse.json({ error: "Loan id is required." }, { status: 400 })
    if (correctedContent.length < 20) return NextResponse.json({ error: "Enter the corrected memo content (at least 20 characters)." }, { status: 400 })
    if (reason.length < 5) return NextResponse.json({ error: "A correction reason of at least 5 characters is required." }, { status: 400 })

    const { data: loan, error: loanError } = await admin
      .from("loan_requests")
      .select("id, request_number, status, director_letter, director_letter_original, md_approved_at, md_approved_by_name, updated_at")
      .eq("id", loanId)
      .maybeSingle()
    if (loanError) throw loanError
    if (!loan) return NextResponse.json({ error: "Loan request not found." }, { status: 404 })
    if (!loan.md_approved_at || ![...CORRECTABLE_STATUSES].includes(String(loan.status || ""))) {
      return NextResponse.json({ error: "Only an MD-approved loan memo can be corrected from this page." }, { status: 409 })
    }

    const oldContent = String(loan.director_letter || "")
    const originalSignedContent = String(loan.director_letter_original || oldContent)
    if (oldContent !== expectedContent) return NextResponse.json({ error: "This memo was changed by another administrator. Refresh the page and open the editor again." }, { status: 409 })
    if (correctedContent === oldContent) return NextResponse.json({ error: "No memo wording changes were made." }, { status: 400 })

    const update = admin
      .from("loan_requests")
      .update({ director_letter: correctedContent, updated_at: new Date().toISOString() })
      .eq("id", loanId)
      .eq("status", loan.status)
      .eq("md_approved_at", loan.md_approved_at)
    const guardedUpdate = oldContent
      ? update.eq("director_letter", oldContent)
      : update.is("director_letter", null)
    const { data: savedLoan, error: saveError } = await guardedUpdate
      .select("id, request_number, status, director_letter, md_approved_at, md_approved_by_name")
      .maybeSingle()
    if (saveError) throw saveError
    if (!savedLoan) return NextResponse.json({ error: "This memo changed in another session. Refresh the page and retry your correction." }, { status: 409 })

    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "ADMIN_APPROVED_LOAN_MEMO_CORRECTION",
      table_name: "loan_requests",
      record_id: loanId,
      old_values: { director_letter: oldContent },
      new_values: { director_letter: correctedContent },
      details: {
        reason,
        request_number: loan.request_number,
        status: loan.status,
        original_signed_memo_preserved: true,
        original_signed_memo: originalSignedContent,
        md_approved_at: loan.md_approved_at,
        md_approved_by_name: loan.md_approved_by_name,
      },
    })
    if (auditError) {
      console.error("[v0] Approved loan memo correction saved but audit log failed:", auditError)
      return NextResponse.json({ error: "The memo was updated, but the audit record could not be saved. Contact support before making another correction." }, { status: 500 })
    }

    return NextResponse.json({ success: true, memo: savedLoan })
  } catch (error) {
    console.error("[v0] Approved loan memo correction failed:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save approved memo correction." }, { status: 500 })
  }
}
