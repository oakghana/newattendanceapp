import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  GOOD_FD_THRESHOLD,
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHodReview,
  canDoHrOffice,
  canDoLoanOffice,
  normalizeRole,
} from "@/lib/loan-workflow"

type ActionKey =
  | "hod_decision"
  | "loan_office_forward"
  | "accounts_fd_update"
  | "committee_decision"
  | "hr_set_terms"
  | "director_finalize"

async function notifyUsers(admin: any, userIds: string[], title: string, message: string, type = "loan_update", data: any = {}) {
  if (!userIds.length) return
  await admin.from("staff_notifications").insert(
    userIds.map((uid) => ({ user_id: uid, title, message, type, data, is_read: false })),
  )
}

async function timeline(admin: any, payload: any) {
  await admin.from("loan_request_timeline").insert(payload)
}

function buildAutoMemo(req: any) {
  return [
    "QUALITY CONTROL COMPANY LIMITED",
    "HUMAN RESOURCES DEPARTMENT",
    "",
    `Reference: ${req.request_number}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Subject: Loan Approval Notice - ${req.loan_type_label}`,
    "",
    "Your loan request has been approved.",
    `Approved Amount: GHc ${Number(req.fixed_amount || req.requested_amount || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Disbursement Date: ${req.disbursement_date || "TBD"}`,
    `Recovery Start Date: ${req.recovery_start_date || "TBD"}`,
    `Recovery Months: ${req.recovery_months || "TBD"}`,
    "",
    "Please contact HR/Accounts for processing and disbursement instructions.",
  ].join("\n")
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, department_id, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const body = await request.json()
    const action = String(body.action || "") as ActionKey
    const id = String(body.id || "")
    const note = String(body.note || "").trim() || null

    if (!action || !id) {
      return NextResponse.json({ error: "action and id are required" }, { status: 400 })
    }

    const { data: req, error: reqError } = await admin.from("loan_requests").select("*").eq("id", id).single()
    if (reqError || !req) return NextResponse.json({ error: "Loan request not found" }, { status: 404 })

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const update: any = { updated_at: new Date().toISOString() }
    let toStatus = req.status

    if (action === "hod_decision") {
      if (!canDoHodReview(role)) return NextResponse.json({ error: "Only HOD/manager/admin can review" }, { status: 403 })
      if (req.status !== "pending_hod") return NextResponse.json({ error: "Request is not pending HOD review" }, { status: 400 })

      if (role !== "admin") {
        const directlyAssigned = req.hod_reviewer_id === user.id
        const { data: linkRow } = await admin
          .from("loan_hod_linkages")
          .select("id")
          .eq("staff_user_id", req.user_id)
          .eq("hod_user_id", user.id)
          .maybeSingle()
        const isLinkedHod = Boolean((linkRow as any)?.id)

        if (!directlyAssigned && !isLinkedHod) {
          return NextResponse.json({ error: "You are not linked to review this staff request." }, { status: 403 })
        }
      }

      const decision = body.decision === "reject" ? "reject" : "approve"
      toStatus = decision === "approve" ? "hod_approved" : "hod_rejected"
      update.status = toStatus
      update.hod_reviewer_id = user.id
      update.hod_review_note = note
      update.hod_decision_at = new Date().toISOString()

      if (decision === "approve") {
        await notifyUsers(
          admin,
          [req.user_id],
          "Loan Request Approved by HOD",
          `Your request ${req.request_number} has been approved by HOD and sent to Loan Office.`,
          "loan_hod_approved",
          { request_id: req.id },
        )
      } else {
        await notifyUsers(
          admin,
          [req.user_id],
          "Loan Request Rejected by HOD",
          `Your request ${req.request_number} was rejected by HOD.${note ? ` Reason: ${note}` : ""}`,
          "loan_hod_rejected",
          { request_id: req.id },
        )
      }
    }

    if (action === "loan_office_forward") {
      if (!canDoLoanOffice(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Only Loan Office/Admin can forward" }, { status: 403 })
      }
      if (req.status !== "hod_approved") return NextResponse.json({ error: "Request is not ready for Loan Office" }, { status: 400 })

      const requiresFdCheck = req.requires_fd_check !== false
      toStatus = requiresFdCheck ? "sent_to_accounts" : "awaiting_hr_terms"
      update.status = toStatus
      update.loan_office_reviewer_id = user.id
      update.loan_office_note = note
      update.loan_office_forwarded_at = new Date().toISOString()

      if (requiresFdCheck) {
        const { data: accountsUsers } = await admin
          .from("user_profiles")
          .select("id")
          .in("role", ["accounts", "admin"])
          .eq("is_active", true)
        await notifyUsers(
          admin,
          (accountsUsers || []).map((r: any) => r.id),
          "Loan Request Needs FD Check",
          `Request ${req.request_number} is waiting for FD update from Accounts.`,
          "loan_accounts_pending",
          { request_id: req.id },
        )
      } else {
        const { data: hrUsers } = await admin
          .from("user_profiles")
          .select("id")
          .in("role", ["hr_officer", "director_hr", "hr_director", "admin", "department_head"])
          .eq("is_active", true)
        await notifyUsers(
          admin,
          (hrUsers || []).map((r: any) => r.id),
          "Loan Request Ready for HR Terms",
          `Request ${req.request_number} bypassed Accounts FD and is ready for HR terms processing.`,
          "loan_hr_terms_pending",
          { request_id: req.id },
        )
      }
    }

    if (action === "accounts_fd_update") {
      if (!canDoAccounts(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Only Accounts/Admin can update FD" }, { status: 403 })
      }
      if (req.status !== "sent_to_accounts") return NextResponse.json({ error: "Request is not at Accounts stage" }, { status: 400 })

      const fdScore = Number(body.fd_score)
      if (!Number.isFinite(fdScore)) {
        return NextResponse.json({ error: "fd_score is required" }, { status: 400 })
      }

      const fdGood = fdScore >= GOOD_FD_THRESHOLD
      const isCarLoan = Boolean(req.committee_required)

      if (!fdGood && !note) {
        return NextResponse.json({ error: `Provide Accounts response note for FD below ${GOOD_FD_THRESHOLD}.` }, { status: 400 })
      }

      update.accounts_reviewer_id = user.id
      update.fd_score = fdScore
      update.fd_note = note
      update.fd_checked_at = new Date().toISOString()
      update.fd_good = fdGood

      if (!fdGood) {
        toStatus = "rejected_fd"
      } else if (isCarLoan) {
        toStatus = "awaiting_committee"
      } else {
        toStatus = "awaiting_hr_terms"
      }

      update.status = toStatus

      if (fdGood) {
        await notifyUsers(
          admin,
          [req.user_id],
          "Good FD Standing Confirmed",
          `Your request ${req.request_number} has FD ${fdScore} (> ${GOOD_FD_THRESHOLD}) and is in good standing for consideration.`,
          "loan_fd_good",
          { request_id: req.id, fd_score: fdScore },
        )
      } else {
        await notifyUsers(
          admin,
          [req.user_id],
          "Loan Request Auto-Rejected by FD Threshold",
          `Your request ${req.request_number} was automatically rejected because FD score ${fdScore} is below ${GOOD_FD_THRESHOLD}.`,
          "loan_fd_rejected",
          { request_id: req.id, fd_score: fdScore },
        )
      }

      const { data: loanOfficeUsers } = await admin
        .from("user_profiles")
        .select("id")
        .in("role", ["loan_officer", "hr_officer", "admin"])
        .eq("is_active", true)

      await notifyUsers(
        admin,
        (loanOfficeUsers || []).map((u: any) => u.id),
        "Accounts FD Response Received",
        `Request ${req.request_number}: FD score ${fdScore}. Decision: ${fdGood ? "cleared" : "below threshold"}.${note ? ` Note: ${note}` : ""}`,
        "loan_accounts_fd_feedback",
        { request_id: req.id, fd_score: fdScore, fd_good: fdGood, note },
      )

      if (toStatus === "awaiting_committee") {
        const { data: committeeUsers } = await admin
          .from("user_profiles")
          .select("id")
          .in("role", ["loan_committee", "committee_member", "admin"])
          .eq("is_active", true)
        await notifyUsers(
          admin,
          (committeeUsers || []).map((r: any) => r.id),
          "Car Loan Committee Queue Updated",
          `Request ${req.request_number} is ready for committee decision after FD confirmation.`,
          "loan_committee_pending",
          { request_id: req.id },
        )
      }
    }

    if (action === "committee_decision") {
      if (!canDoCommittee(role)) return NextResponse.json({ error: "Only committee/admin can decide" }, { status: 403 })
      if (req.status !== "awaiting_committee") return NextResponse.json({ error: "Request is not at committee stage" }, { status: 400 })

      const decision = body.decision === "reject" ? "reject" : "approve"
      toStatus = decision === "approve" ? "awaiting_hr_terms" : "committee_rejected"
      update.status = toStatus
      update.committee_reviewer_id = user.id
      update.committee_note = note
      update.committee_decision_at = new Date().toISOString()

      await notifyUsers(
        admin,
        [req.user_id],
        decision === "approve" ? "Car Loan Endorsed by Committee" : "Car Loan Rejected by Committee",
        decision === "approve"
          ? `Your request ${req.request_number} has been endorsed and moved to HR for terms setup.`
          : `Your request ${req.request_number} was not approved by committee.${note ? ` Reason: ${note}` : ""}`,
        decision === "approve" ? "loan_committee_approved" : "loan_committee_rejected",
        { request_id: req.id },
      )
    }

    if (action === "hr_set_terms") {
      if (!canDoHrOffice(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Only HR Office/Admin can set terms" }, { status: 403 })
      }
      if (req.status !== "awaiting_hr_terms") return NextResponse.json({ error: "Request is not at HR terms stage" }, { status: 400 })

      const disbursementDate = String(body.disbursement_date || "")
      const recoveryStartDate = String(body.recovery_start_date || "")
      const recoveryMonths = Number(body.recovery_months)

      if (!disbursementDate || !recoveryStartDate || !Number.isFinite(recoveryMonths) || recoveryMonths <= 0) {
        return NextResponse.json({ error: "disbursement_date, recovery_start_date, and valid recovery_months are required" }, { status: 400 })
      }

      toStatus = "awaiting_director_hr"
      update.status = toStatus
      update.hr_officer_id = user.id
      update.hr_note = note
      update.disbursement_date = disbursementDate
      update.recovery_start_date = recoveryStartDate
      update.recovery_months = recoveryMonths
      update.hr_forwarded_at = new Date().toISOString()

      // Notify staff that terms are set and awaiting Director HR
      await notifyUsers(
        admin,
        [req.user_id],
        "Loan Terms Set — Pending Director HR Approval",
        `Your request ${req.request_number} terms have been set by HR Office (Disbursement: ${disbursementDate}; Recovery Start: ${recoveryStartDate}; ${recoveryMonths} months) and forwarded to Director HR for final approval.`,
        "loan_hr_terms_set",
        { request_id: req.id },
      )

      // Notify Director HR
      const { data: directorUsers } = await admin
        .from("user_profiles")
        .select("id")
        .in("role", ["director_hr", "hr_director", "admin"])
        .eq("is_active", true)
      await notifyUsers(
        admin,
        (directorUsers || []).map((r: any) => r.id),
        "Loan Ready for Director HR Decision",
        `Request ${req.request_number} from ${req.staff_rank || "staff"} is ready for your final approval.`,
        "loan_director_pending",
        { request_id: req.id },
      )
    }

    if (action === "director_finalize") {
      if (!canDoDirectorHr(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Only Director HR/Admin can finalize" }, { status: 403 })
      }
      if (req.status !== "awaiting_director_hr") {
        return NextResponse.json({ error: "Request is not at Director HR stage" }, { status: 400 })
      }

      const decision = body.decision === "reject" ? "reject" : "approve"
      const signatureMode = String(body.signature_mode || "typed")
      const signatureText = String(body.signature_text || "").trim() || null
      const signatureDataUrl = String(body.signature_data_url || "").trim() || null
      const directorLetter = String(body.director_letter || "").trim() || null

      if (!signatureText && !signatureDataUrl) {
        return NextResponse.json({ error: "Director HR signature is required" }, { status: 400 })
      }

      toStatus = decision === "approve" ? "approved_director" : "director_rejected"
      update.status = toStatus
      update.director_hr_id = user.id
      update.director_signature_mode = signatureMode
      update.director_signature_text = signatureText
      update.director_signature_data_url = signatureDataUrl
      const autoMemo = decision === "approve" ? buildAutoMemo(req) : null
      update.director_letter = directorLetter || autoMemo
      update.director_note = note
      update.director_decision_at = new Date().toISOString()

      await notifyUsers(
        admin,
        [req.user_id],
        decision === "approve" ? "Final Loan Approval from Director HR" : "Loan Request Declined by Director HR",
        decision === "approve"
          ? `Your request ${req.request_number} is fully approved. Disbursement: ${req.disbursement_date || "TBD"}; Recovery starts: ${req.recovery_start_date || "TBD"}; Duration: ${req.recovery_months || "TBD"} months.`
          : `Your request ${req.request_number} was declined by Director HR.${note ? ` Reason: ${note}` : ""}`,
        decision === "approve" ? "loan_final_approved" : "loan_final_rejected",
        { request_id: req.id, auto_memo: decision === "approve" ? (directorLetter || autoMemo) : null },
      )

      if (decision === "approve") {
        const { data: accountsUsers } = await admin
          .from("user_profiles")
          .select("id")
          .in("role", ["accounts", "admin"])
          .eq("is_active", true)

        await notifyUsers(
          admin,
          (accountsUsers || []).map((r: any) => r.id),
          "Signed Director HR Approval Letter",
          `Signed approval for ${req.request_number} is available for Accounts records.`,
          "loan_signed_letter_copy",
          { request_id: req.id },
        )
      }
    }

    if (toStatus === req.status && !update.status) {
      return NextResponse.json({ error: "Unknown or unsupported action" }, { status: 400 })
    }

    const { data: updated, error: updateError } = await admin
      .from("loan_requests")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (updateError) throw updateError

    await timeline(admin, {
      loan_request_id: id,
      actor_id: user.id,
      actor_role: role,
      action_key: action,
      from_status: req.status,
      to_status: toStatus,
      note,
      metadata: {
        fd_score: update.fd_score || null,
        recovery_start_date: update.recovery_start_date || null,
        disbursement_date: update.disbursement_date || null,
        recovery_months: update.recovery_months || null,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error: any) {
    console.error("loan action error", error)
    return NextResponse.json({ error: error?.message || "Failed to process action" }, { status: 500 })
  }
}
