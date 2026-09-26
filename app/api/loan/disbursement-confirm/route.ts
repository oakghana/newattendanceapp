import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canConfirmDisbursement } from "@/lib/role-capabilities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
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

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, first_name, last_name, employee_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    if (!canConfirmDisbursement(profile.role)) {
      return NextResponse.json(
        { error: "Only the Accounts Office and Accounts Executive are authorized to initiate or confirm loan disbursements." },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const loanId = String(body.loan_id || body.id || "").trim()

    if (!loanId) {
      return NextResponse.json({ error: "loan_id is required" }, { status: 400 })
    }

    // Fetch loan request
    const { data: loan, error: loanFetchError } = await admin
      .from("loan_requests")
      .select("*")
      .eq("id", loanId)
      .single()

    if (loanFetchError || !loan) {
      return NextResponse.json({ error: "Loan request not found" }, { status: 404 })
    }

    const confirmedByName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.role || "Accounts Officer"
    const nowIso = new Date().toISOString()

    // Update loan_requests status to partially_recovered with valid repayment_status 'active'
    let updatedLoan: any = null
    let updateError: any = null

    // Update loan status and repayment status on loan_requests
    const updatePayload: Record<string, any> = {
      status: "partially_recovered",
      repayment_status: "active",
      updated_at: nowIso,
    }

    const { data: res1, error: err1 } = await admin
      .from("loan_requests")
      .update(updatePayload)
      .eq("id", loanId)
      .select()
      .single()

    if (err1) {
      console.warn("[v0] Primary update failed, trying fallback with status only:", err1.message)
      const { data: res2, error: err2 } = await admin
        .from("loan_requests")
        .update({ status: "partially_recovered", updated_at: nowIso })
        .eq("id", loanId)
        .select()
        .single()

      if (err2) {
        updateError = err2
      } else {
        updatedLoan = res2
      }
    } else {
      updatedLoan = res1
    }

    if (updateError) {
      console.error("[v0] Error updating loan status on disbursement confirmation:", updateError)
      return NextResponse.json(
        { error: updateError.message || "Failed to update loan disbursement status" },
        { status: 500 }
      )
    }

    // Record audit entry in loan_request_timeline
    try {
      await admin.from("loan_request_timeline").insert({
        loan_request_id: loanId,
        actor_id: user.id,
        actor_role: profile.role,
        action_key: "confirm_disbursement",
        from_status: loan.status,
        to_status: "partially_recovered",
        note: `Disbursement confirmed received by staff. Action taken by ${confirmedByName}.`,
        metadata: {
          confirmed_by_id: user.id,
          confirmed_by_name: confirmedByName,
          confirmed_at: nowIso,
        },
      })
    } catch (timelineErr) {
      console.warn("[v0] Non-critical timeline insertion warning:", timelineErr)
    }

    // Every Accounts-confirmed disbursement, including Funeral Loans, receives a monthly repayment schedule.
    const durationMonths = Math.max(1, Math.trunc(Number(loan.recovery_months || loan.repayment_duration_months || 12)))
    const scheduleStartDate = loan.recovery_start_date || loan.disbursement_date || nowIso.slice(0, 10)
    const { error: scheduleError } = await admin.rpc("generate_repayment_schedule", {
      p_loan_request_id: loan.id,
      p_start_date: scheduleStartDate,
      p_duration_months: durationMonths,
    })
    if (scheduleError) {
      console.error("[v0] Repayment schedule generation failed after disbursement confirmation:", scheduleError)
      return NextResponse.json({ error: "Disbursement was confirmed, but the monthly repayment schedule could not be generated." }, { status: 500 })
    }
    await admin.from("loan_requests").update({
      repayment_plan_generated_at: nowIso,
      repayment_duration_months: durationMonths,
      repayment_status: "active",
    }).eq("id", loan.id)

    // Notify staff member in staff_notifications
    if (loan.user_id) {
      try {
        const amountStr = loan.fixed_amount || loan.requested_amount
          ? `GHc ${Number(loan.fixed_amount || loan.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
          : ""
        await admin.from("staff_notifications").insert({
          recipient_id: loan.user_id,
          sender_id: user.id,
          sender_role: "accounts",
          sender_label: "Accounts Loan Office",
          title: "Loan Disbursement Confirmed",
          message: `Your loan disbursement for request ${loan.request_number || loan.id.slice(0, 8)} ${amountStr ? `(${amountStr}) ` : ""}has been verified and confirmed by Accounts.`,
          notification_type: "loan_disbursement_confirmed",
          type: "loan_disbursement_confirmed",
          data: { loan_id: loan.id, request_number: loan.request_number },
          is_read: false,
        })
      } catch (notifErr) {
        console.warn("[v0] Non-critical notification insertion warning:", notifErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Loan disbursement confirmed successfully",
      confirmedByName,
      confirmedAt: nowIso,
      loan: { ...updatedLoan, repayment_plan_generated_at: nowIso, repayment_duration_months: durationMonths },
    })
  } catch (error: any) {
    console.error("[v0] Error in disbursement confirmation API:", error)
    return NextResponse.json(
      { error: error?.message || "Internal server error confirming disbursement" },
      { status: 500 }
    )
  }
}
