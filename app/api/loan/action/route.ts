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
import { createMemoToken } from "@/lib/secure-memo"

type ActionKey =
  | "hod_decision"
  | "loan_office_update_request"
  | "loan_office_forward"
  | "accounts_fd_update"
  | "committee_decision"
  | "hr_set_terms"
  | "director_finalize"

function normalizeReferenceNumber(value: string | null | undefined): string | null {
  const raw = String(value || "").trim()
  if (!raw) return null
  const match = raw.match(/^QCC\/HRD\/SWL\/V\.2\/(\d+)$/i)
  if (!match) return null
  return `QCC/HRD/SWL/V.2/${match[1]}`
}

function memoReference(req: any): string {
  const normalized = normalizeReferenceNumber(req?.reference_number)
  if (normalized) return normalized
  const fallbackSeq = String(req?.request_number || "").split("-").pop() || "—"
  return `QCC/HRD/SWL/V.2/${fallbackSeq}`
}

async function notifyUsers(admin: any, userIds: string[], title: string, message: string, type = "loan_update", data: any = {}) {
  if (!userIds.length) return
  await admin.from("staff_notifications").insert(
    userIds.map((uid) => ({ recipient_id: uid, title, message, type, data, is_read: false })),
  )
}

async function timeline(admin: any, payload: any) {
  await admin.from("loan_request_timeline").insert(payload)
}

async function getDirectorApprovers(admin: any) {
  const { data } = await admin
    .from("user_profiles")
    .select("id")
    .in("role", ["director_hr", "manager_hr", "hr_director", "admin"])
    .eq("is_active", true)
  return (data || []).map((row: any) => String(row.id))
}

async function validateDirectorApprover(admin: any, approverId: string) {
  const { data } = await admin
    .from("user_profiles")
    .select("id, role, is_active")
    .eq("id", approverId)
    .maybeSingle()

  if (!data) return false
  const role = normalizeRole((data as any).role)
  return Boolean((data as any).is_active) && ["director_hr", "manager_hr", "hr_director", "admin"].includes(role)
}

function buildAutoMemo(req: any) {
  return [
    "QUALITY CONTROL COMPANY LIMITED",
    "HUMAN RESOURCES DEPARTMENT",
    "",
    `Reference: ${memoReference(req)}`,
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

function buildCarLoanHoldNotice(req: any) {
  return [
    `Reference: ${memoReference(req)}`,
    "Car Loan Committee Scheduling Notice",
    "",
    "Your request has passed FD verification and remains active.",
    "The Car Loan Committee meets periodically (typically once per year).",
    "You will be notified immediately once your request is scheduled for final committee sitting.",
    "",
    "Please hold on for the committee schedule update.",
  ].join("\n")
}

function buildFdRejectionMemo(req: any, fdScore: number, note?: string | null) {
  return [
    `Reference: ${memoReference(req)}`,
    "Loan Request Feedback: FD Threshold Not Met",
    "",
    `FD Score: ${fdScore}`,
    `Minimum Required FD Score: ${GOOD_FD_THRESHOLD}`,
    `Reason from Accounts: ${note || "FD value below required threshold."}`,
    "",
    "You may improve your FD position and submit a new request in a future cycle.",
  ].join("\n")
}

function buildHrTermsMemo(req: any, disbursementDate: string, recoveryStartDate: string, recoveryMonths: number, note?: string | null) {
  return [
    `Reference: ${memoReference(req)}`,
    "Loan Terms Set by HR Office",
    "",
    `Disbursement Date: ${disbursementDate}`,
    `Recovery Start Date: ${recoveryStartDate}`,
    `Recovery Duration: ${recoveryMonths} month(s)`,
    `${note ? `HR Note: ${note}` : ""}`,
    "",
    "Your request has been forwarded to Director HR for final approval.",
  ].join("\n")
}

function buildDirectorRejectionMemo(req: any, note?: string | null) {
  return [
    `Reference: ${memoReference(req)}`,
    "Director HR Decision: Not Approved",
    "",
    `Loan Type: ${req.loan_type_label}`,
    `${note ? `Reason: ${note}` : "Reason: Not stated."}`,
    "",
    "For further support, kindly contact HR Office.",
  ].join("\n")
}

function buildMemoPath(loanId: string, recipientUserId: string) {
  const token = createMemoToken({
    loanId,
    userId: recipientUserId,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })
  return `/api/loan/memo/${loanId}?token=${encodeURIComponent(token)}`
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
      .select("id, role, department_id, assigned_location_id, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const body = await request.json()
    const action = String(body.action || "") as ActionKey
    const id = String(body.id || "")
    const note = String(body.note || "").trim() || null
    const selectedDirectorApproverId = String(body.director_approver_id || "").trim() || null

    if (!action || !id) {
      return NextResponse.json({ error: "action and id are required" }, { status: 400 })
    }

    const { data: req, error: reqError } = await admin.from("loan_requests").select("*").eq("id", id).single()
    if (reqError || !req) return NextResponse.json({ error: "Loan request not found" }, { status: 404 })

    const { data: requesterProfile } = await admin
      .from("user_profiles")
      .select("id, department_id, assigned_location_id")
      .eq("id", req.user_id)
      .maybeSingle()

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const update: any = { updated_at: new Date().toISOString() }
    let toStatus = req.status
    let actionHandled = false
    let requestedStaffFullName: string | null = null

    if (action === "hod_decision") {
      actionHandled = true
      if (!canDoHodReview(role)) return NextResponse.json({ error: "Only HOD/manager/admin can review" }, { status: 403 })
      if (req.status !== "pending_hod") return NextResponse.json({ error: "Request is not pending HOD review" }, { status: 400 })

      if (role !== "admin") {
        const reviewerDept = String((profile as any)?.department_id || "")
        const reviewerLocation = String((profile as any)?.assigned_location_id || "")
        const requesterDept = String((requesterProfile as any)?.department_id || req.department_id || "")
        const requesterLocation = String((requesterProfile as any)?.assigned_location_id || req.staff_location_id || "")

        if (role === "regional_manager") {
          if (!reviewerLocation || !requesterLocation || reviewerLocation !== requesterLocation) {
            return NextResponse.json({ error: "Regional managers can review only staff requests within their assigned region/location." }, { status: 403 })
          }
        }

        if (role === "department_head") {
          const sameDept = reviewerDept && requesterDept && reviewerDept === requesterDept
          const sameLocation = !reviewerLocation || (requesterLocation && reviewerLocation === requesterLocation)
          if (!sameDept || !sameLocation) {
            return NextResponse.json({ error: "Department heads can review only requests within their department and assigned location." }, { status: 403 })
          }
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

    if (action === "loan_office_update_request" || action === "loan_office_forward") {
      actionHandled = true
      if (!canDoLoanOffice(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Only Loan Office/Admin can update or forward" }, { status: 403 })
      }
      if (action === "loan_office_forward" && (req.status === "sent_to_accounts" || req.status === "awaiting_hr_terms")) {
        return NextResponse.json({
          success: true,
          alreadyForwarded: true,
          data: req,
          message: req.status === "sent_to_accounts"
            ? "Request has already been forwarded to Accounts."
            : "Request has already been forwarded to HR Terms.",
        })
      }
      if (![
        "hod_approved",
        "sent_to_accounts",
        "awaiting_hr_terms",
      ].includes(String(req.status || ""))) {
        return NextResponse.json({ error: "Request is not editable at Loan Office stage" }, { status: 400 })
      }

      const normalizedReference = normalizeReferenceNumber(body.reference_number)
      if (body.reference_number !== undefined && body.reference_number !== null && String(body.reference_number).trim() && !normalizedReference) {
        return NextResponse.json({ error: "Reference number format must be QCC/HRD/SWL/V.2/<sequence>" }, { status: 400 })
      }

      if (body.staff_full_name !== undefined) requestedStaffFullName = String(body.staff_full_name || "").trim() || null
      if (body.staff_number !== undefined) update.staff_number = String(body.staff_number || "").trim() || null
      if (body.staff_rank !== undefined) update.staff_rank = String(body.staff_rank || "").trim() || null
      if (body.corporate_email !== undefined) update.corporate_email = String(body.corporate_email || "").trim() || null
      if (body.hod_reviewer_id !== undefined) update.hod_reviewer_id = String(body.hod_reviewer_id || "").trim() || null
      if (normalizedReference) update.reference_number = normalizedReference
      if (selectedDirectorApproverId) {
        const isValidDirector = await validateDirectorApprover(admin, selectedDirectorApproverId)
        if (!isValidDirector) {
          return NextResponse.json({ error: "Selected approver is not an active Director HR approver." }, { status: 400 })
        }
        update.director_hr_id = selectedDirectorApproverId
      }

      update.loan_office_reviewer_id = user.id
      update.loan_office_note = note

      if (action === "loan_office_update_request") {
        toStatus = req.status
      } else {
        if (req.status !== "hod_approved") {
          return NextResponse.json({ error: "Only HOD-approved requests can be forwarded to Accounts/HR." }, { status: 400 })
        }

        const requiresFdCheck = req.requires_fd_check !== false
        toStatus = requiresFdCheck ? "sent_to_accounts" : "awaiting_hr_terms"
        update.status = toStatus
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
            .in("role", ["hr_officer", "director_hr", "manager_hr", "hr_director", "admin", "department_head"])
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
    }

    if (action === "accounts_fd_update") {
      actionHandled = true
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
        const staffMemo = isCarLoan
          ? buildCarLoanHoldNotice(req)
          : `Your request ${req.request_number} has FD ${fdScore} (> ${GOOD_FD_THRESHOLD}) and is in good standing for consideration.`
        const memoPath = buildMemoPath(req.id, req.user_id)

        await notifyUsers(
          admin,
          [req.user_id],
          isCarLoan ? "Car Loan in Committee Hold Queue" : "Good FD Standing Confirmed",
          staffMemo,
          isCarLoan ? "loan_committee_hold" : "loan_fd_good",
          { request_id: req.id, fd_score: fdScore, memo: staffMemo, memo_path: memoPath },
        )
      } else {
        const rejectionMemo = buildFdRejectionMemo(req, fdScore, note)
        const memoPath = buildMemoPath(req.id, req.user_id)
        await notifyUsers(
          admin,
          [req.user_id],
          "Loan Request Auto-Rejected by FD Threshold",
          rejectionMemo,
          "loan_fd_rejected",
          { request_id: req.id, fd_score: fdScore, threshold: GOOD_FD_THRESHOLD, reason: note || null, memo: rejectionMemo, memo_path: memoPath },
        )

        const approverIds = [req.hod_reviewer_id, req.loan_office_reviewer_id, req.hr_officer_id, req.director_hr_id]
          .filter((id: any) => Boolean(id))
          .map((id: any) => String(id))

        if (approverIds.length > 0) {
          await notifyUsers(
            admin,
            Array.from(new Set(approverIds)),
            "FD Rejection Issued",
            `Request ${req.request_number} was rejected at Accounts. FD ${fdScore} below ${GOOD_FD_THRESHOLD}.${note ? ` Reason: ${note}` : ""}`,
            "loan_fd_rejected_approver_notice",
            { request_id: req.id, fd_score: fdScore, threshold: GOOD_FD_THRESHOLD, reason: note || null, memo_path: memoPath },
          )
        }
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
      actionHandled = true
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
      actionHandled = true
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
      const normalizedReference = normalizeReferenceNumber(body.reference_number)
      if (body.reference_number !== undefined && body.reference_number !== null && String(body.reference_number).trim() && !normalizedReference) {
        return NextResponse.json({ error: "Reference number format must be QCC/HRD/SWL/V.2/<sequence>" }, { status: 400 })
      }
      if (normalizedReference) update.reference_number = normalizedReference
      update.disbursement_date = disbursementDate
      update.recovery_start_date = recoveryStartDate
      update.recovery_months = recoveryMonths
      update.hr_forwarded_at = new Date().toISOString()

      // Track who is expected to sign/finalize the memo.
      if (selectedDirectorApproverId) {
        const isValidDirector = await validateDirectorApprover(admin, selectedDirectorApproverId)
        if (!isValidDirector) {
          return NextResponse.json({ error: "Selected approver is not an active Director HR approver." }, { status: 400 })
        }
        update.director_hr_id = selectedDirectorApproverId
      } else if (role === "director_hr" || role === "manager_hr" || role === "hr_director") {
        update.director_hr_id = user.id
      } else if (!req.director_hr_id) {
        const { data: directorCandidates } = await admin
          .from("user_profiles")
          .select("id, role")
          .in("role", ["director_hr", "manager_hr", "hr_director"])
          .eq("is_active", true)
          .limit(10)

        const ordered = (directorCandidates || []).sort((a: any, b: any) => {
          const rank = (value: string) => {
            if (value === "director_hr") return 1
            if (value === "manager_hr") return 2
            if (value === "hr_director") return 3
            return 9
          }
          return rank(String(a.role || "")) - rank(String(b.role || ""))
        })

        if (ordered[0]?.id) update.director_hr_id = ordered[0].id
      }

      // Notify staff that terms are set and awaiting Director HR
      const hrMemo = buildHrTermsMemo(req, disbursementDate, recoveryStartDate, recoveryMonths, note)
      const hrMemoPath = buildMemoPath(req.id, req.user_id)
      await notifyUsers(
        admin,
        [req.user_id],
        "Loan Terms Set — Pending Director HR Approval",
        `Your request ${req.request_number} terms have been set by HR Office (Disbursement: ${disbursementDate}; Recovery Start: ${recoveryStartDate}; ${recoveryMonths} months) and forwarded to Director HR for final approval.`,
        "loan_hr_terms_set",
        { request_id: req.id, memo: hrMemo, memo_path: hrMemoPath },
      )

      // Notify Director HR
      const ownerId = String(update.director_hr_id || req.director_hr_id || "").trim() || null
      const directorIds = await getDirectorApprovers(admin)
      if (ownerId) {
        await notifyUsers(
          admin,
          [ownerId],
          "Loan Ready for Your Approval",
          `Request ${req.request_number} from ${req.staff_rank || "staff"} is assigned to you for final approval.`,
          "loan_director_pending_owner",
          { request_id: req.id, role: "owner" },
        )
      }

      const watcherIds = directorIds.filter((uid) => uid !== ownerId)
      if (watcherIds.length > 0) {
        await notifyUsers(
          admin,
          watcherIds,
          "Loan Approval Copy (Watch)",
          `Copy notice: Request ${req.request_number} is pending final approval by assigned approver.`,
          "loan_director_pending_copy",
          { request_id: req.id, role: "watcher", owner_id: ownerId },
        )
      }
    }

    if (action === "director_finalize") {
      actionHandled = true
      if (!canDoDirectorHr(role, deptName, deptCode)) {
        return NextResponse.json({ error: "Only Director HR/Admin can finalize" }, { status: 403 })
      }
      if (req.status !== "awaiting_director_hr") {
        return NextResponse.json({ error: "Request is not at Director HR stage" }, { status: 400 })
      }

      const assignedDirectorId = String(req.director_hr_id || "").trim() || null
      if (assignedDirectorId && role !== "admin" && assignedDirectorId !== user.id) {
        return NextResponse.json({ error: "This request is assigned to another approver. You can view copy only." }, { status: 403 })
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
        {
          request_id: req.id,
          auto_memo: decision === "approve" ? (directorLetter || autoMemo) : buildDirectorRejectionMemo(req, note),
          memo_path: buildMemoPath(req.id, req.user_id),
        },
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
      } else {
        const approverIds = [req.hod_reviewer_id, req.loan_office_reviewer_id, req.hr_officer_id]
          .filter((id: any) => Boolean(id))
          .map((id: any) => String(id))

        if (approverIds.length > 0) {
          await notifyUsers(
            admin,
            Array.from(new Set(approverIds)),
            "Director HR Rejection Memo Available",
            `Request ${req.request_number} was rejected by Director HR.${note ? ` Reason: ${note}` : ""}`,
            "loan_director_rejected_approver_notice",
            {
              request_id: req.id,
              reason: note || null,
              memo_path: buildMemoPath(req.id, req.user_id),
            },
          )
        }
      }
    }

    if (!actionHandled) {
      return NextResponse.json({ error: "Unknown or unsupported action" }, { status: 400 })
    }

    let updateQuery: any = admin.from("loan_requests").update(update).eq("id", id)
    if (action !== "loan_office_update_request") {
      // First-action-wins lock: once status changes, later approvers cannot overwrite.
      updateQuery = updateQuery.eq("status", req.status)
    }

    const { data: updated, error: updateError } = await updateQuery.select("*").single()

    if (updateError) {
      const msg = String(updateError?.message || "")
      if (msg.toLowerCase().includes("no rows")) {
        return NextResponse.json({ error: "Request was already processed by another approver. Refresh queue." }, { status: 409 })
      }
      throw updateError
    }

    if (requestedStaffFullName !== null) {
      const parts = requestedStaffFullName.split(/\s+/).filter(Boolean)
      const firstName = parts[0] || null
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null
      await admin
        .from("user_profiles")
        .update({ first_name: firstName, last_name: lastName, updated_at: new Date().toISOString() })
        .eq("id", req.user_id)
    }

    if (action === "director_finalize") {
      const signaturePayload = {
        user_id: user.id,
        workflow_domain: "loan",
        approval_stage: "director_hr",
        signature_mode: update.director_signature_mode || "typed",
        signature_text: update.director_signature_text || null,
        signature_data_url: update.director_signature_data_url || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }

      const { error: signatureError } = await admin
        .from("approval_signature_registry")
        .upsert(signaturePayload, { onConflict: "user_id,workflow_domain,approval_stage" })

      if (signatureError) {
        const signatureMessage = String(signatureError.message || "")
        if (!/does not exist|schema cache|relation/i.test(signatureMessage)) {
          throw signatureError
        }
      }
    }

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
