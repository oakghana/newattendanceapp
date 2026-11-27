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

    const canConfirmAsAccounts = canConfirmDisbursement(profile.role)
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

    const staffAcknowledgement = body.staff_acknowledgement === true
    const isApplicant = String(loan.user_id || "") === user.id
    if (staffAcknowledgement ? !isApplicant : !canConfirmAsAccounts) {
      return NextResponse.json({ error: "Only Accounts may confirm on behalf of staff. Staff may acknowledge receipt only for their own loan." }, { status: 403 })
    }

    if (staffAcknowledgement) {
      const isManagingDirectorApproved = Boolean(loan.md_approved_at) && ["approved_director", "md_approved", "referenced", "staff_receiving_funds"].includes(String(loan.status || ""))
      if (!isManagingDirectorApproved) {
        return NextResponse.json({ error: "Receipt can only be acknowledged after the Managing Director has approved the loan." }, { status: 409 })
      }
      const { data: memoOpenEvent } = await admin
        .from("loan_request_timeline")
        .select("id")
        .eq("loan_request_id", loanId)
        .eq("actor_id", user.id)
        .eq("action_key", "staff_opened_memo")
        .limit(1)
        .maybeSingle()
      if (!memoOpenEvent) {
        return NextResponse.json({ error: "Open your approved loan memo before confirming receipt." }, { status: 409 })
      }
    }

    const alreadyConfirmedByStatus = ["partially_recovered", "fully_recovered", "payment_completed"].includes(String(loan.status || "")) || Boolean(loan.repayment_plan_generated_at)
    const { data: existingReceiptEvent } = await admin
      .from("loan_request_timeline")
      .select("id")
      .eq("loan_request_id", loanId)
      .in("action_key", ["confirm_disbursement", "staff_acknowledge_receipt"])
      .limit(1)
      .maybeSingle()
    if (alreadyConfirmedByStatus || existingReceiptEvent) {
      return NextResponse.json({ error: "Receipt has already been confirmed and the repayment process has started." }, { status: 409 })
    }

    const confirmedByName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.role || (staffAcknowledgement ? "Staff member" : "Accounts Officer")
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
      .eq("status", loan.status)
      .select()
      .maybeSingle()

    if (err1) {
      console.warn("[v0] Primary update failed, trying fallback with status only:", err1.message)
      const { data: res2, error: err2 } = await admin
        .from("loan_requests")
        .update({ status: "partially_recovered", updated_at: nowIso })
        .eq("id", loanId)
        .eq("status", loan.status)
        .select()
        .maybeSingle()

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
    if (!updatedLoan) {
      return NextResponse.json({ error: "Receipt was already confirmed by another action." }, { status: 409 })
    }

    // Record audit entry in loan_request_timeline
    try {
      await admin.from("loan_request_timeline").insert({
        loan_request_id: loanId,
        actor_id: user.id,
        actor_role: profile.role,
        action_key: staffAcknowledgement ? "staff_acknowledge_receipt" : "confirm_disbursement",
        from_status: loan.status,
        to_status: "partially_recovered",
        note: staffAcknowledgement
          ? `Staff confirmed receipt of the loan disbursement: ${confirmedByName}.`
          : `Disbursement confirmed received by staff. Action taken by ${confirmedByName}.`,
        metadata: {
          confirmed_by_id: user.id,
          confirmed_by_name: confirmedByName,
          confirmed_at: nowIso,
          confirmation_source: staffAcknowledgement ? "staff_portal" : "accounts_office",
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

    // Staff receipt acknowledgment moves the loan into the existing active repayment flow.
    try {
      const amountStr = loan.fixed_amount || loan.requested_amount
        ? `GHc ${Number(loan.fixed_amount || loan.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
        : ""
      if (staffAcknowledgement) {
        const { data: accountsUsers } = await admin
          .from("user_profiles")
          .select("id")
          .in("role", ["accounts", "accounts_executive"])
          .eq("is_active", true)
        const accountsNotifications = (accountsUsers || []).map((accountsUser: any) => ({
          recipient_id: accountsUser.id,
          sender_id: user.id,
          sender_role: profile.role,
          sender_label: "Staff Portal",
          notification_type: "staff_confirmed_loan_receipt",
          message: `${confirmedByName} confirmed receipt of loan ${loan.request_number || loan.id.slice(0, 8)}${amountStr ? ` (${amountStr})` : ""}. The repayment schedule has started.`,
          action_url: "/dashboard/disbursement-confirmation",
          data: { loan_id: loan.id, request_number: loan.request_number, confirmed_at: nowIso },
          is_read: false,
        }))
        if (accountsNotifications.length) await admin.from("staff_notifications").insert(accountsNotifications)
      } else if (loan.user_id) {
        await admin.from("staff_notifications").insert({
          recipient_id: loan.user_id,
          sender_id: user.id,
          sender_role: "accounts",
          sender_label: "Accounts Loan Office",
          message: `Your loan disbursement for request ${loan.request_number || loan.id.slice(0, 8)} ${amountStr ? `(${amountStr}) ` : ""}has been verified and confirmed by Accounts.`,
          notification_type: "loan_disbursement_confirmed",
          action_url: "/dashboard/loan-app",
          data: { loan_id: loan.id, request_number: loan.request_number, confirmed_at: nowIso },
          is_read: false,
        })
      }
    } catch (notifErr) {
      console.warn("[v0] Non-critical disbursement notification warning:", notifErr)
    }

    return NextResponse.json({
      success: true,
      message: staffAcknowledgement ? "Receipt acknowledged and repayment schedule started." : "Loan disbursement confirmed successfully",
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
