import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Cron job to auto-forward leave and loan requests from HOD after 2 days (48 hours)
 * if the HOD hasn't endorsed/approved them.
 * 
 * This ensures requests don't get stuck in the pending_hod stage.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get("authorization")

    // Verify cron secret
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: true, source: "cron" as const })
    }

    const supabase = await createClient()

    console.log("[v0] Starting HOD auto-forward cron job")

    // Calculate 48 hours ago (2 days)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // Auto-forward LOAN requests pending HOD for 2+ days
    const { data: pendingLoans, error: loanError } = await supabase
      .from("loan_requests")
      .select("id, user_id, staff_full_name, request_number, status, submitted_at")
      .eq("status", "pending_hod")
      .lt("submitted_at", twoDaysAgo)
      .is("hod_auto_advanced_at", null) // Only if not already auto-advanced

    if (loanError) {
      console.error("[v0] Error fetching pending loans:", loanError)
      return NextResponse.json({ error: "Failed to fetch loans", details: loanError.message }, { status: 500 })
    }

    // Update loan requests to auto-advance to loan office
    let loansUpdated = 0
    if (pendingLoans && pendingLoans.length > 0) {
      const { error: updateError } = await supabase
        .from("loan_requests")
        .update({
          status: "loan_office_pending",
          hod_auto_advanced_at: new Date().toISOString(),
          hod_auto_advanced_reason: "Auto-advanced after 48 hours without HOD endorsement",
        })
        .in(
          "id",
          pendingLoans.map((r) => r.id)
        )

      if (updateError) {
        console.error("[v0] Error updating loans:", updateError)
      } else {
        loansUpdated = pendingLoans.length
        console.log(`[v0] Auto-forwarded ${loansUpdated} loan requests to loan office`)
      }
    }

    // Auto-forward LEAVE requests pending HOD for 2+ days
    const { data: pendingLeaves, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, status, submitted_at")
      .eq("status", "pending_hod_review")
      .lt("submitted_at", twoDaysAgo)
      .is("hod_auto_advanced_at", null) // Only if not already auto-advanced

    if (leaveError) {
      console.error("[v0] Error fetching pending leaves:", leaveError)
      return NextResponse.json(
        { error: "Failed to fetch leaves", details: leaveError.message },
        { status: 500 }
      )
    }

    // Update leave requests to auto-advance to HR office
    let leavesUpdated = 0
    if (pendingLeaves && pendingLeaves.length > 0) {
      const { error: updateError } = await supabase
        .from("leave_plan_requests")
        .update({
          status: "hr_office_forwarded",
          hod_auto_advanced_at: new Date().toISOString(),
          hod_auto_advanced_reason: "Auto-forwarded to HR after 48 hours without HOD review",
        })
        .in(
          "id",
          pendingLeaves.map((r) => r.id)
        )

      if (updateError) {
        console.error("[v0] Error updating leaves:", updateError)
      } else {
        leavesUpdated = pendingLeaves.length
        console.log(`[v0] Auto-forwarded ${leavesUpdated} leave requests to HR office`)
      }
    }

    console.log(
      `[v0] HOD auto-forward cron completed: ${loansUpdated} loans, ${leavesUpdated} leaves auto-forwarded`
    )

    return NextResponse.json({
      success: true,
      message: `Auto-forwarded ${loansUpdated} loan requests and ${leavesUpdated} leave requests`,
      loansUpdated,
      leavesUpdated,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] HOD auto-forward cron error:", error)
    return NextResponse.json(
      { error: "Cron job failed", details: String(error) },
      { status: 500 }
    )
  }
}
