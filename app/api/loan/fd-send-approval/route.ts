import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canSendFdForAccountsExecutiveReview } from "@/lib/loan-workflow"
import { NextResponse } from "next/server"

export const runtime = 'nodejs'

/**
 * POST /api/loan/fd-send-approval
 * Accounts Loan Office sends a calculated FD for Accounts Executive approval.
 * Updates loan_requests status to 'sent_for_fd_approval' and stores FD data.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "")
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    if (!canSendFdForAccountsExecutiveReview(role, deptName, deptCode)) {
      return NextResponse.json({ error: "Only Accounts staff can send FD for Accounts Executive review" }, { status: 403 })
    }

    const body = await request.json()
    const {
      loan_request_id,
      fd_score,
      fd_good,
      fd_calculation_data,
    } = body

    if (!loan_request_id || fd_score === undefined || fd_score === null || fd_score === "") {
      return NextResponse.json({ error: "Missing required fields: loan_request_id, fd_score" }, { status: 400 })
    }

    const normalizedFdScore = Number(fd_score)
    if (!Number.isFinite(normalizedFdScore) || normalizedFdScore < 0 || normalizedFdScore > 100) {
      return NextResponse.json({ error: "FD score must be a number between 0 and 100" }, { status: 400 })
    }

    const { data: loanRequest, error: loanRequestError } = await admin
      .from("loan_requests")
      .select("id, status")
      .eq("id", loan_request_id)
      .maybeSingle()

    if (loanRequestError) {
      return NextResponse.json({ error: "Unable to load the loan request", details: loanRequestError.message }, { status: 500 })
    }
    if (!loanRequest) {
      return NextResponse.json({ error: "Loan request not found" }, { status: 404 })
    }
    if (!["sent_to_accounts", "pending_accounts_fd_review"].includes(String(loanRequest.status || ""))) {
      return NextResponse.json({ error: "This request is not waiting for an Accounts FD review" }, { status: 409 })
    }

    // Update the loan request with FD data and set status to pending accounts FD review.
    const { error: updateError } = await admin
      .from("loan_requests")
      .update({
        fd_score: normalizedFdScore,
        fd_good: fd_good ?? normalizedFdScore >= 40,
        fd_note: JSON.stringify(fd_calculation_data || {}),
        status: "pending_accounts_fd_review",
        loan_office_forwarded_at: new Date().toISOString(),
      })
      .eq("id", loan_request_id)

    if (updateError) {
      console.error("[v0] Error updating loan request with FD approval send:", updateError)
      return NextResponse.json({ error: "Failed to send FD for approval", details: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "FD sent for Accounts Executive approval",
      loan_request_id,
      fd_score,
    })
  } catch (error) {
    console.error("[v0] FD send approval error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
