import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { canApproveFdScore, canEnterFdScore, canRejectFdByScore, formatFdScoreAdjustmentMemo, GOOD_FD_THRESHOLD, isFdExemptLoanType } from "@/lib/loan-workflow"
import { createMemoToken } from "@/lib/secure-memo"

export const runtime = 'nodejs'

function memoReference(loan: any): string {
  const raw = String(loan?.reference_number || "").trim()
  if (raw) return raw
  const fallbackSeq = String(loan?.request_number || "").split("-").pop() || "—"
  return `QCC/HRD/SWL/V.2/${fallbackSeq}`
}

function buildMemoPath(loanId: string, recipientUserId: string) {
  const token = createMemoToken({ loanId, userId: recipientUserId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  return `/api/loan/memo/${loanId}?token=${encodeURIComponent(token)}`
}

function buildFdRejectionMemo(loan: any, fdScore: number, reason?: string | null) {
  return [
    `Reference: ${memoReference(loan)}`,
    "Loan Request Feedback: FD Threshold Not Met",
    "",
    `FD Score: ${fdScore}%`,
    `Minimum Required FD Score: ${GOOD_FD_THRESHOLD}%`,
    `Reason from Accounts Executive: ${reason || "FD value below required threshold."}`,
    "",
    "You may improve your FD position and submit a new request in a future cycle.",
  ].join("\n")
}

function buildCarLoanHoldNotice(loan: any) {
  return [
    `Reference: ${memoReference(loan)}`,
    "Car Loan Committee Scheduling Notice",
    "",
    "Your request has passed FD verification and remains active.",
    "The Car Loan Committee meets periodically (typically once per year).",
    "You will be notified immediately once your request is scheduled for final committee sitting.",
    "",
    "Please hold on for the committee schedule update.",
  ].join("\n")
}

async function notifyUsers(admin: any, userIds: string[], title: string, message: string, type = "loan_update", data: any = {}) {
  if (!userIds.length) return
  await admin.from("staff_notifications").insert(
    userIds.map((uid) => ({ recipient_id: uid, title, message, type, data, is_read: false })),
  )
}

/**
 * GET /api/loan/fd-review
 * Fetch loan requests that have FD data set by Loan Office, pending Accounts Executive approval.
 * Uses the existing loan_requests table (fd_score, fd_good, fd_note, fd_document_url columns).
 * Status flow: loan_requests.status = 'pending_accounts_fd_review' means awaiting Accounts Exec.
 */
export async function GET(request: Request) {
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

    const role = String(profile.role || "")
    const roleNorm = role.toLowerCase().replace(/[\s-]+/g, "_")
    const isAdmin = roleNorm === "admin"
    const canViewFdQueue = canEnterFdScore(role) || canApproveFdScore(role)

    if (!canViewFdQueue && !isAdmin) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const url = new URL(request.url)
    const statusParam = url.searchParams.get("status") || "pending_review"
    if (statusParam === "pending_review" && !canApproveFdScore(role) && !isAdmin) {
      return NextResponse.json({ error: "Only Accounts Executive can view the FD approval queue" }, { status: 403 })
    }

    // Map the requested status filter to actual loan_requests statuses
    // Accounts Executive sees loans where Loan Office has set FD and is awaiting AE decision
    let statusFilter: string[]
    if (statusParam === "pending_review") {
      // Include sent_to_accounts when FD score already present (legacy path)
      statusFilter = ["pending_accounts_fd_review", "fd_review_pending", "sent_to_accounts"]
    } else if (statusParam === "approved") {
      // Everything Accounts Exec approved / forwarded toward HR Loan Office and beyond
      statusFilter = [
        "fd_approved",
        "pending_hr_loan_office",
        "awaiting_hr_terms",
        "awaiting_director_hr",
        "awaiting_committee",
        "approved_director",
        "md_final_approved",
        "staff_receiving_funds",
        "partially_recovered",
        "payment_completed",
      ]
    } else if (statusParam === "rejected") {
      statusFilter = ["fd_rejected", "rejected_fd"]
    } else {
      // Return all loans that have fd_score set (Loan Office computed it)
      statusFilter = []
    }

    let query = admin
      .from("loan_requests")
      .select(`
        id,
        request_number,
        reference_number,
        status,
        loan_type_key,
        loan_type_label,
        staff_full_name,
        staff_number,
        corporate_email,
        fd_score,
        fd_good,
        fd_note,
        fd_document_url,
        fd_checked_at,
        loan_office_note,
        requires_fd_check,
        requested_amount,
        monthly_deduction,
        repayment_duration_months,
        created_at,
        submitted_at,
        loan_office_forwarded_at,
        loan_office_reviewer_id,
        accounts_reviewer_id,
        user_id
      `)
      .not("fd_score", "is", null)
      .order("loan_office_forwarded_at", { ascending: false })
      .limit(50)

    if (statusFilter.length > 0) {
      query = query.in("status", statusFilter)
    }

    const { data: loanRequests, error: queryError } = await query

    if (queryError) {
      console.error("[v0] Error fetching FD reviews from loan_requests:", queryError)
      return NextResponse.json({ error: "Database query failed", details: queryError.message }, { status: 500 })
    }

    // Fetch user profiles to get complete staff names and FD calculator identity
    const userIds = Array.from(new Set(
      (loanRequests || [])
        .flatMap((lr) => [lr.user_id, lr.loan_office_reviewer_id, lr.accounts_reviewer_id])
        .filter(Boolean),
    ))
    const { data: userProfiles, error: profilesError } = userIds.length > 0
      ? await admin
          .from("user_profiles")
          .select("id, first_name, last_name, employee_id, role")
          .in("id", userIds)
      : { data: [], error: null }

    if (profilesError) {
      console.warn("[v0] Warning fetching user profiles:", profilesError)
    }

    // Create a map of user profiles for easy lookup
    const profileMap = new Map((userProfiles || []).map(p => [p.id, p]))
    const fullName = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
      p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : ""

    // Map to the shape the FD dashboard component expects
    const reviews = (loanRequests || []).map(loan => {
      // Get staff name from profile if loan_requests.staff_full_name is missing
      const profile = profileMap.get(loan.user_id)
      const calculator = profileMap.get(loan.loan_office_reviewer_id)
      const reviewer = profileMap.get(loan.accounts_reviewer_id)
      const staffName = loan.staff_full_name || fullName(profile) || "Unknown Staff"
      const calculatedByName = fullName(calculator) || null
      
      return {
      id: loan.id,
      loan_request_id: loan.id,
      staff_user_id: loan.user_id,
      staff_name: staffName,
      calculated_by_name: calculatedByName,
      calculated_by_role: calculator?.role || null,
      accounts_reviewer_name: fullName(reviewer) || null,
      staff_number: loan.staff_number,
      loan_type: loan.loan_type_label || loan.loan_type_key,
      requested_amount: loan.requested_amount,
      monthly_deduction: loan.monthly_deduction,
      repayment_months: loan.repayment_duration_months,
      // FD is a percent (net-to-gross), not currency — keep fd_value === fd_score for UI
      fd_value: Number(loan.fd_score ?? 0),
      fd_score: Number(loan.fd_score ?? 0),
      fd_good: typeof loan.fd_score === "number" || loan.fd_score != null
        ? Number(loan.fd_score) >= 39
        : loan.fd_good,
      fd_document_url: loan.fd_document_url,
      supporting_docs_url: loan.fd_document_url,
      submission_date: loan.loan_office_forwarded_at || loan.created_at,
      submission_memo: loan.loan_office_note || loan.fd_note || "",
      fd_note: loan.fd_note,
        request_number: loan.request_number || loan.reference_number,
        review_status: statusParam === "pending_review" ? "pending_review" : statusParam,
        status: loan.status,
      }
    })

    return NextResponse.json({
      success: true,
      reviews,
      count: reviews.length,
    })
  } catch (error) {
    console.error("[v0] FD review GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/loan/fd-review
 * Accounts Executive approves or rejects a loan's FD.
 * Updates the loan_requests table directly (fd_good, status, accounts_reviewer_id).
 */
export async function PATCH(request: Request) {
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

    const role = String(profile?.role || "")
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null
    if (!canApproveFdScore(role, deptName, deptCode)) {
      return NextResponse.json({ error: "Only Accounts Executive can review FD requests" }, { status: 403 })
    }

    const body = await request.json()
    const { review_id, review_status, fd_verification_memo, review_decision, adjusted_fd_score, adjustment_reason } = body

    if (!review_id || !review_status) {
      return NextResponse.json({ error: "Missing required fields: review_id, review_status" }, { status: 400 })
    }

    const isApproved = review_status === "approved"

    // First, fetch the current loan to preserve original fd_note with calculation details
    const { data: currentLoan, error: fetchError } = await admin
      .from("loan_requests")
      .select("fd_note, staff_full_name, fd_score, fd_good, loan_type_key, loan_type_label, status, user_id, request_number, reference_number, committee_required, hod_reviewer_id, loan_office_reviewer_id, hr_officer_id, director_hr_id")
      .eq("id", review_id)
      .single()

    if (fetchError) {
      console.error("[v0] Error fetching current loan:", fetchError)
      return NextResponse.json({ error: "Failed to fetch loan details", details: fetchError.message }, { status: 500 })
    }

    if (!["pending_accounts_fd_review", "fd_review_pending", "sent_to_accounts"].includes(String(currentLoan.status || ""))) {
      return NextResponse.json({ error: "This FD is no longer pending Accounts Executive review." }, { status: 400 })
    }

    const originalScore = Number(currentLoan.fd_score)
    const hasAdjustment = adjusted_fd_score !== undefined && adjusted_fd_score !== null && adjusted_fd_score !== ""
    const finalScore = hasAdjustment ? Number(adjusted_fd_score) : originalScore
    if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 100) {
      return NextResponse.json({ error: "FD score must be a whole percentage between 0 and 100." }, { status: 400 })
    }

    const normalizedOriginalScore = Number.isFinite(originalScore) ? Math.round(originalScore) : originalScore
    const normalizedFinalScore = Math.round(finalScore)
    const scoreChanged = normalizedFinalScore !== normalizedOriginalScore
    const trimmedAdjustmentReason = String(adjustment_reason || "").trim()
    if (scoreChanged && !trimmedAdjustmentReason) {
      return NextResponse.json({ error: "Provide a reason when entering a new FD value without recalculation." }, { status: 400 })
    }

    // Block illegal rejections: exempt loan types and scores >= threshold
    if (!isApproved) {
      const loanType = currentLoan?.loan_type_label || currentLoan?.loan_type_key
      if (isFdExemptLoanType(currentLoan?.loan_type_key, currentLoan?.loan_type_label)) {
        return NextResponse.json(
          {
            error: `${loanType || "This"} loans (funeral / insurance / repair) cannot be rejected for FD. Approve and forward instead.`,
          },
          { status: 400 },
        )
      }
      if (!canRejectFdByScore(normalizedFinalScore, currentLoan?.loan_type_key, normalizedFinalScore >= GOOD_FD_THRESHOLD, currentLoan?.loan_type_label)) {
        return NextResponse.json(
          {
            error: `FD score ${normalizedFinalScore}% is at or above the ${GOOD_FD_THRESHOLD}% threshold and cannot be rejected.`,
          },
          { status: 400 },
        )
      }
    }

    const isExemptLoan = isFdExemptLoanType(currentLoan?.loan_type_key, currentLoan?.loan_type_label)
    const finalFdGood = normalizedFinalScore >= GOOD_FD_THRESHOLD
    if (isApproved && !finalFdGood && !isExemptLoan) {
      return NextResponse.json(
        { error: `FD score must be at least ${GOOD_FD_THRESHOLD}% before forwarding this loan to HR. Adjust the verified score with a reason or reject it.` },
        { status: 400 },
      )
    }

    // Preserve original calculation in fd_note, add approval decision at the end
    const originalNote = currentLoan?.fd_note || ""
    const approvalMemo = [fd_verification_memo, review_decision].filter(Boolean).join(" | ")
    const adjustmentMemo = scoreChanged
      ? formatFdScoreAdjustmentMemo(normalizedOriginalScore, normalizedFinalScore, trimmedAdjustmentReason)
      : ""
    const updatedNote = originalNote 
      ? `${originalNote}\n\n--- Accounts Executive Review (${new Date().toLocaleDateString()}) ---\n${[adjustmentMemo, approvalMemo].filter(Boolean).join("\n")}`
      : [adjustmentMemo, approvalMemo].filter(Boolean).join("\n")

    // Car loans still need Car Loan Committee sign-off after Accounts Executive clears FD.
    const isCarLoan = Boolean((currentLoan as any)?.committee_required)
    const finalStatus = isApproved ? (isCarLoan ? "awaiting_committee" : "pending_hr_loan_office") : "fd_rejected"

    // Update the loan_requests row directly
    const { data: updatedLoan, error: updateError } = await admin
      .from("loan_requests")
      .update({
        fd_score: normalizedFinalScore,
        fd_good: finalFdGood,
        // Move to next stage: approved FD goes to HR loan office (or committee for car loans); rejected goes back
        status: finalStatus,
        accounts_reviewer_id: user.id,
        fd_note: updatedNote,
        fd_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", review_id)
      .select("id, status, request_number, staff_full_name")
      .single()

    if (updateError) {
      console.error("[v0] Error updating loan FD decision:", updateError)
      return NextResponse.json({ error: "Failed to update FD decision", details: updateError.message }, { status: 500 })
    }

    // Log to loan_request_timeline for audit trail
    const { error: timelineError } = await admin
      .from("loan_request_timeline")
      .insert({
        loan_request_id: review_id,
        actor_id: user.id,
        actor_role: "accounts_executive",
        action_key: isApproved ? "fd_approved" : "fd_rejected",
        from_status: "pending_accounts_fd_review",
        to_status: finalStatus,
        note: [adjustmentMemo, review_decision || (isApproved ? "FD approved by Accounts Executive" : "FD rejected by Accounts Executive")].filter(Boolean).join(" | "),
        metadata: scoreChanged
          ? {
              fd_original_score: normalizedOriginalScore,
              fd_verified_score: normalizedFinalScore,
              fd_adjustment_reason: trimmedAdjustmentReason,
              fd_manual_override: true,
            }
          : { fd_verified_score: normalizedFinalScore, fd_manual_override: false },
      })

    if (timelineError) {
      console.warn("[v0] Timeline log error (non-critical):", timelineError)
      // Don't fail the whole operation if timeline logging fails
    }

    // Accounts Executive's decision is what issues the rejection letter (or approval
    // notice) to the staff member — Accounts Office never sends this notification.
    try {
      const staffId = String((currentLoan as any)?.user_id || "").trim()
      const loanForMemo = { ...currentLoan, request_number: updatedLoan?.request_number || (currentLoan as any)?.request_number }
      const approverIds = [
        (currentLoan as any)?.hod_reviewer_id,
        (currentLoan as any)?.loan_office_reviewer_id,
        (currentLoan as any)?.hr_officer_id,
        (currentLoan as any)?.director_hr_id,
      ]
        .filter(Boolean)
        .map((id: any) => String(id))

      if (isApproved) {
        if (staffId) {
          const staffMemo = isCarLoan
            ? buildCarLoanHoldNotice(loanForMemo)
            : `Your request ${loanForMemo.request_number} has FD ${normalizedFinalScore}% (>= ${GOOD_FD_THRESHOLD}%) and is in good standing for consideration.`
          const memoPath = buildMemoPath(review_id, staffId)
          await notifyUsers(
            admin,
            [staffId],
            isCarLoan ? "Car Loan in Committee Hold Queue" : "Good FD Standing Confirmed",
            staffMemo,
            isCarLoan ? "loan_committee_hold" : "loan_fd_good",
            { request_id: review_id, fd_score: normalizedFinalScore, memo: staffMemo, memo_path: memoPath },
          )
        }

        if (isCarLoan) {
          const { data: committeeUsers } = await admin
            .from("user_profiles")
            .select("id")
            .in("role", ["loan_committee", "committee_member", "admin"])
            .eq("is_active", true)
          await notifyUsers(
            admin,
            (committeeUsers || []).map((r: any) => r.id),
            "Car Loan Committee Queue Updated",
            `Request ${loanForMemo.request_number} is ready for committee decision after FD confirmation.`,
            "loan_committee_pending",
            { request_id: review_id },
          )
        }
      } else {
        const rejectionReason = review_decision || fd_verification_memo || null
        const rejectionMemo = buildFdRejectionMemo(loanForMemo, normalizedFinalScore, rejectionReason)
        if (staffId) {
          const memoPath = buildMemoPath(review_id, staffId)
          await notifyUsers(
            admin,
            [staffId],
            "Loan Request Rejected by Accounts Executive",
            rejectionMemo,
            "loan_fd_rejected",
            { request_id: review_id, fd_score: normalizedFinalScore, threshold: GOOD_FD_THRESHOLD, reason: rejectionReason, memo: rejectionMemo, memo_path: memoPath },
          )
        }

        if (approverIds.length > 0) {
          await notifyUsers(
            admin,
            Array.from(new Set(approverIds)),
            "FD Rejection Issued by Accounts Executive",
            `Request ${loanForMemo.request_number} was rejected by Accounts Executive. FD ${normalizedFinalScore}% below ${GOOD_FD_THRESHOLD}%.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
            "loan_fd_rejected_approver_notice",
            { request_id: review_id, fd_score: normalizedFinalScore, threshold: GOOD_FD_THRESHOLD, reason: rejectionReason },
          )
        }
      }
    } catch (notifyError) {
      console.warn("[v0] FD decision notification error (non-critical):", notifyError)
    }

    return NextResponse.json({
      success: true,
      review: updatedLoan,
      message: isApproved
        ? (isCarLoan ? "FD approved. Loan forwarded to the Car Loan Committee." : "FD approved. Loan forwarded to HR Loan Office.")
        : "FD rejected by Accounts Executive. Staff and Loan Office have been notified.",
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    console.error("[v0] FD review PATCH error:", errorMessage)
    return NextResponse.json({ 
      error: "Failed to process FD approval",
      details: errorMessage
    }, { status: 500 })
  }
}

/**
 * POST /api/loan/fd-review  
 * Loan Office sets FD values on a loan request.
 * Updates loan_requests with fd_score, fd_note, fd_document_url and advances status.
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

    const role = String(profile?.role || "")
    const roleNorm = role.toLowerCase().replace(/[\s-]+/g, "_")
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null
    if (!canEnterFdScore(role, deptName, deptCode)) {
      return NextResponse.json({ error: "Only Accounts staff can submit FD values for executive review" }, { status: 403 })
    }

    const body = await request.json()
    const { 
      loan_request_id, 
      fd_score, 
      fd_good,
      fd_note, 
      fd_document_url,
      fd_calculation_data,
      accounts_notes,
      override_reason,
      submission_type // 'automated_calculation' or 'manual_upload'
    } = body

    if (!loan_request_id || fd_score === undefined || fd_score === null) {
      return NextResponse.json({ error: "Missing required fields: loan_request_id, fd_score" }, { status: 400 })
    }

    // Accounts Loan Office may correct FD only while AE has not decided yet
    const { data: existingLoan, error: existingErr } = await admin
      .from("loan_requests")
      .select("id, status, fd_score, fd_note")
      .eq("id", loan_request_id)
      .single()

    if (existingErr || !existingLoan) {
      return NextResponse.json({ error: "Loan request not found" }, { status: 404 })
    }

    const currentStatus = String(existingLoan.status || "").toLowerCase()
    const editableStatuses = new Set([
      "pending_accounts_fd_review",
      "fd_review_pending",
      "sent_to_accounts",
      "rejected_fd",
      "fd_rejected",
      "hod_approved",
    ])
    // First-time submit from accounts queue may still be hod_approved / sent_to_accounts
    if (existingLoan.fd_score != null && !editableStatuses.has(currentStatus)) {
      return NextResponse.json(
        {
          error:
            "FD values are locked after Accounts Executive decision. Accounts Loan Office can only correct pending (not-yet-approved) FD submissions.",
        },
        { status: 400 },
      )
    }

    const isCorrection = Boolean(body.is_correction) || (existingLoan.fd_score != null && editableStatuses.has(currentStatus))
    const correctionReason = String(body.correction_reason || "").trim()
    if (isCorrection && !correctionReason && roleNorm === "accounts_loan_office") {
      return NextResponse.json(
        { error: "Correction reason is required when updating a pending FD submission." },
        { status: 400 },
      )
    }

    // A manually entered FD value (score_override present) on the initial submission
    // must always carry a reason, even if the client-side check is bypassed.
    const isManualOverride = !isCorrection && fd_calculation_data?.score_override != null
    const trimmedOverrideReason = String(override_reason || "").trim()
    if (isManualOverride && !trimmedOverrideReason) {
      return NextResponse.json(
        { error: "A reason is required when manually entering the FD value instead of using the auto-calculated score." },
        { status: 400 },
      )
    }

    // Build the notes string with calculation data if automated
    let finalNotes = fd_note || ""
    if (submission_type === "automated_calculation" && fd_calculation_data) {
      // Format outstanding loans if present
      let outstandingSection = ""
      if (fd_calculation_data.outstanding_loans && Object.keys(fd_calculation_data.outstanding_loans).length > 0) {
        const outstandingItems = Object.entries(fd_calculation_data.outstanding_loans)
          .map(([key, value]) => {
            // Convert snake_case to Title Case for display
            const label = key.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            return `  - ${label}: GH¢ ${(value as number).toFixed(2)}`
          })
          .join('\n')
        outstandingSection = `\nBalance Outstanding Loans:\n${outstandingItems}`
      }
      
      const calcNotes = `
Automated FD Calculation (HR Loan Office):
- Salary Per Annum: GH¢ ${fd_calculation_data.salary_per_annum?.toFixed(2)}
- Consolidated Monthly Salary: GH¢ ${fd_calculation_data.consolidated_salary_per_month?.toFixed(2)}
- Other Monthly Allowances: GH¢ ${fd_calculation_data.other_allowances?.toFixed(2)}
- Gross Monthly Salary: GH¢ ${fd_calculation_data.gross_salary_monthly?.toFixed(2)}
- Existing Gross Deductions: GH¢ ${fd_calculation_data.gross_deductions_monthly?.toFixed(2)}
- Approx Loan Installment: GH¢ ${fd_calculation_data.loan_installment_monthly?.toFixed(2)}
- Outstanding monthly burden: GH¢ ${fd_calculation_data.outstanding_installment_monthly?.toFixed(2) ?? "0.00"}
- Total Monthly Deductions: GH¢ ${fd_calculation_data.total_deductions_monthly?.toFixed(2)}
- Net Monthly Salary: GH¢ ${fd_calculation_data.net_salary_monthly?.toFixed(2)}
- ½ of Gross Monthly Salary: GH¢ ${fd_calculation_data.half_gross_monthly?.toFixed(2)}
- Net to Gross Ratio: ${fd_calculation_data.net_to_gross_ratio?.toFixed(1)}%${outstandingSection}
${accounts_notes ? `\nHR Loan Office Remarks: ${accounts_notes}` : ""}${isManualOverride ? `\n\nMANUAL FD VALUE ENTERED: auto-calc ${fd_calculation_data.auto_calculated_score}% → ${fd_score}%\nReason: ${trimmedOverrideReason}` : ""}
      `.trim()
      finalNotes = calcNotes
    }

    if (isCorrection && correctionReason) {
      const stamp = new Date().toISOString()
      finalNotes = [
        finalNotes,
        "",
        `--- FD CORRECTION (${stamp}) ---`,
        `Reason: ${correctionReason}`,
        existingLoan.fd_note ? `Previous note retained above.` : "",
      ]
        .filter(Boolean)
        .join("\n")
    }

    const { data: updatedLoan, error: updateError } = await admin
      .from("loan_requests")
      .update({
        fd_score,
        fd_good: fd_good !== undefined ? Boolean(fd_good) : Number(fd_score) >= 39,
        fd_note: finalNotes,
        fd_document_url,
        fd_checked_at: new Date().toISOString(),
        // Remain / return to pending Accounts Executive FD review (LO cannot approve)
        status: "pending_accounts_fd_review",
        loan_office_reviewer_id: user.id,
        loan_office_forwarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", loan_request_id)
      .select("id, status, request_number, staff_full_name")
      .single()

    if (updateError) {
      console.error("[v0] Error setting FD on loan:", updateError)
      return NextResponse.json({ error: "Failed to set FD values", details: updateError.message }, { status: 500 })
    }

    // Log to timeline. The Supabase query builder is "thenable" (awaitable) but is NOT
    // a real Promise, so it has no .catch() method -- chaining .catch() directly onto it
    // throws a TypeError that was bubbling up and turning an already-successful FD update
    // into a fake "Internal server error" for the user. Await it and check the error
    // result instead, exactly like the loan_requests update above.
    const { error: timelineError } = await admin.from("loan_request_timeline").insert({
      loan_request_id,
      actor_id: user.id,
      actor_role: submission_type === "automated_calculation" ? "accounts_loan_office" : "loan_office",
      action_key: isCorrection ? "fd_corrected" : "fd_submitted",
      to_status: "pending_accounts_fd_review",
      note: isCorrection
        ? `FD score corrected to ${fd_score}% by Accounts Loan Office (pending AE). Reason: ${correctionReason || "n/a"}`
        : isManualOverride
          ? `FD value manually entered as ${fd_score}% by Accounts Office (auto-calc was ${fd_calculation_data.auto_calculated_score}%). Reason: ${trimmedOverrideReason}`
          : `FD score ${fd_score} submitted by ${submission_type === "automated_calculation" ? "Accounts" : "Loan"} Office${submission_type === "automated_calculation" ? " (Automated Calculation)" : ""}`,
      metadata: isManualOverride
        ? { fd_manual_override: true, fd_auto_calculated_score: fd_calculation_data.auto_calculated_score, fd_manual_value: fd_score, fd_override_reason: trimmedOverrideReason }
        : undefined,
    })
    if (timelineError) {
      console.error("[v0] Timeline log error:", timelineError)
    }

    return NextResponse.json({
      success: true,
      loan: updatedLoan,
      message: isCorrection
        ? "FD correction saved. Still awaiting Accounts Executive approval (Loan Office cannot approve)."
        : "FD values submitted. Awaiting Accounts Executive review.",
    })
  } catch (error) {
    console.error("[v0] FD review POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
