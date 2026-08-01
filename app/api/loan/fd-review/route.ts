import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const runtime = 'nodejs'

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

    const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isAccountsExecutive = roleNorm === "accounts_executive" || roleNorm === "accounts"
    const isLoanOffice = roleNorm === "loan_office" || roleNorm === "hr_loan_office" || roleNorm === "accounts_loan_office"
    const isAdmin = roleNorm === "admin"

    if (!isAccountsExecutive && !isLoanOffice && !isAdmin) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const url = new URL(request.url)
    const statusParam = url.searchParams.get("status") || "pending_review"

    // Map the requested status filter to actual loan_requests statuses
    // Accounts Executive sees loans where Loan Office has set FD and is awaiting AE decision
    let statusFilter: string[]
    if (statusParam === "pending_review") {
      statusFilter = ["pending_accounts_fd_review", "fd_review_pending"]
    } else if (statusParam === "approved") {
      statusFilter = ["fd_approved", "pending_hr_loan_office"]
    } else if (statusParam === "rejected") {
      statusFilter = ["fd_rejected"]
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

    // Map to the shape the FD dashboard component expects
    const reviews = (loanRequests || []).map(loan => ({
      id: loan.id,
      loan_request_id: loan.id,
      staff_user_id: loan.user_id,
      staff_name: loan.staff_full_name,
      staff_number: loan.staff_number,
      loan_type: loan.loan_type_label || loan.loan_type_key,
      requested_amount: loan.requested_amount,
      monthly_deduction: loan.monthly_deduction,
      repayment_months: loan.repayment_duration_months,
      fd_value: loan.fd_score ?? 0,
      fd_score: loan.fd_score,
      fd_good: loan.fd_good,
      fd_document_url: loan.fd_document_url,
      supporting_docs_url: loan.fd_document_url,
      submission_date: loan.loan_office_forwarded_at || loan.created_at,
      submission_memo: loan.loan_office_note || loan.fd_note || "",
      request_number: loan.request_number || loan.reference_number,
      review_status: statusParam === "pending_review" ? "pending_review" : statusParam,
      status: loan.status,
    }))

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
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (roleNorm !== "accounts_executive" && roleNorm !== "accounts" && roleNorm !== "admin") {
      return NextResponse.json({ error: "Only Accounts Executive can review FD requests" }, { status: 403 })
    }

    const body = await request.json()
    const { review_id, review_status, fd_verification_memo, review_decision } = body

    if (!review_id || !review_status) {
      return NextResponse.json({ error: "Missing required fields: review_id, review_status" }, { status: 400 })
    }

    const isApproved = review_status === "approved"

    // Update the loan_requests row directly
    const { data: updatedLoan, error: updateError } = await admin
      .from("loan_requests")
      .update({
        fd_good: isApproved,
        // Move to next stage: approved FD goes to HR loan office; rejected goes back
        status: isApproved ? "pending_hr_loan_office" : "fd_rejected",
        accounts_reviewer_id: user.id,
        fd_note: [fd_verification_memo, review_decision].filter(Boolean).join(" | "),
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
    await admin
      .from("loan_request_timeline")
      .insert({
        loan_request_id: review_id,
        actor_id: user.id,
        actor_role: "accounts_executive",
        action_key: isApproved ? "fd_approved" : "fd_rejected",
        from_status: "pending_accounts_fd_review",
        to_status: isApproved ? "pending_hr_loan_office" : "fd_rejected",
        note: review_decision || (isApproved ? "FD approved by Accounts Executive" : "FD rejected by Accounts Executive"),
      })
      .catch(err => console.error("[v0] Timeline log error:", err))

    return NextResponse.json({
      success: true,
      review: updatedLoan,
      message: isApproved
        ? "FD approved. Loan forwarded to HR Loan Office."
        : "FD rejected. Loan Office has been notified.",
    })
  } catch (error) {
    console.error("[v0] FD review PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (!["loan_office", "hr_loan_office", "accounts_loan_office", "admin"].includes(roleNorm)) {
      return NextResponse.json({ error: "Only Loan Office can submit FD values" }, { status: 403 })
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
      submission_type // 'automated_calculation' or 'manual_upload'
    } = body

    if (!loan_request_id || fd_score === undefined || fd_score === null) {
      return NextResponse.json({ error: "Missing required fields: loan_request_id, fd_score" }, { status: 400 })
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
- Total Monthly Deductions: GH¢ ${fd_calculation_data.total_deductions_monthly?.toFixed(2)}
- Net Monthly Salary: GH¢ ${fd_calculation_data.net_salary_monthly?.toFixed(2)}
- ½ of Gross Monthly Salary: GH¢ ${fd_calculation_data.half_gross_monthly?.toFixed(2)}
- Net to Gross Ratio: ${fd_calculation_data.net_to_gross_ratio?.toFixed(1)}%${outstandingSection}
${accounts_notes ? `\nHR Loan Office Remarks: ${accounts_notes}` : ""}
      `.trim()
      finalNotes = calcNotes
    }

    const { data: updatedLoan, error: updateError } = await admin
      .from("loan_requests")
      .update({
        fd_score,
        fd_good: fd_good !== undefined ? fd_good : (fd_score >= 50),
        fd_note: finalNotes,
        fd_document_url,
        fd_checked_at: new Date().toISOString(),
        // Set to pending Accounts Executive FD review
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

    // Log to timeline
    await admin
      .from("loan_request_timeline")
      .insert({
        loan_request_id,
        actor_id: user.id,
        actor_role: submission_type === "automated_calculation" ? "accounts_loan_office" : "loan_office",
        action_key: "fd_submitted",
        to_status: "pending_accounts_fd_review",
        note: `FD score ${fd_score} submitted by ${submission_type === "automated_calculation" ? "Accounts" : "Loan"} Office${submission_type === "automated_calculation" ? " (Automated Calculation)" : ""}`,
      })
      .catch(err => console.error("[v0] Timeline log error:", err))

    return NextResponse.json({
      success: true,
      loan: updatedLoan,
      message: "FD values submitted. Awaiting Accounts Executive review.",
    })
  } catch (error) {
    console.error("[v0] FD review POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
