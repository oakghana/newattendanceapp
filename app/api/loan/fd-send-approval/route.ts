import { createAdminClient, createClient } from "@/lib/supabase/server"
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
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isAccountsLoanOffice = roleNorm === "accounts_loan_office"

    if (!isAccountsLoanOffice) {
      return NextResponse.json({ error: "Only Accounts Loan Office can send FD for approval" }, { status: 403 })
    }

    const body = await request.json()
    const {
      loan_request_id,
      fd_score,
      fd_good,
      fd_calculation_data,
    } = body

    if (!loan_request_id || fd_score === undefined) {
      return NextResponse.json({ error: "Missing required fields: loan_request_id, fd_score" }, { status: 400 })
    }

    // Update the loan request with FD data and set status to sent for approval
    const { error: updateError } = await admin
      .from("loan_requests")
      .update({
        fd_score,
        fd_good: fd_good ?? false,
        fd_note: JSON.stringify(fd_calculation_data || {}),
        status: "sent_for_fd_approval",
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
