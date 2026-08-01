import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Roles permitted to submit payment evidence
const ALLOWED_ROLES = ["admin", "accounts", "loan_office", "hr_loan_office", "accounts_loan_office", "director_hr", "manager_hr", "hr_office", "hr_leave_office", "it-admin"]

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 })
    }

    // Check user role from user_profiles (not user_roles)
    const { data: profileData } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const role = profileData?.role
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Only Accounts/HR staff can submit payment evidence" },
        { status: 403 }
      )
    }

    let body
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }

    const {
      loanRequestId,
      paymentDate,
      paymentAmount,
      paymentMethod,
      referenceNumber,
      description,
      evidenceFileUrl,
    } = body

    // Validation
    if (!loanRequestId) {
      return NextResponse.json({ error: "Missing required field: loanRequestId" }, { status: 400 })
    }
    if (!paymentDate) {
      return NextResponse.json({ error: "Missing required field: paymentDate" }, { status: 400 })
    }
    if (!paymentAmount && paymentAmount !== 0) {
      return NextResponse.json({ error: "Missing required field: paymentAmount" }, { status: 400 })
    }

    const amount = typeof paymentAmount === "string" ? parseFloat(paymentAmount) : paymentAmount
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Payment amount must be a positive number" }, { status: 400 })
    }

    // Verify loan exists and get details
    const { data: loanData, error: loanError } = await admin
      .from("loan_requests")
      .select("id, user_id, fixed_amount, requested_amount, status")
      .eq("id", loanRequestId)
      .single()

    if (loanError || !loanData) {
      return NextResponse.json({ error: "Loan request not found" }, { status: 404 })
    }

    // Verify loan status is active (not already completed or rejected)
    const activeStatuses = [
      "hod_approved",
      "sent_to_accounts",
      "approved_director",
      "awaiting_committee",
      "awaiting_hr_terms",
      "awaiting_director_hr",
      "staff_receiving_funds",
      "partially_recovered",
    ]
    if (!activeStatuses.includes(loanData.status)) {
      return NextResponse.json(
        { error: "Loan is not in an active state for payment evidence submission" },
        { status: 400 }
      )
    }

    // Create payment record in new loan_payment_records table
    const { data: paymentData, error: paymentError } = await admin
      .from("loan_payment_records")
      .insert({
        loan_request_id: loanRequestId,
        payment_date: paymentDate,
        amount_paid: amount,
        payment_method: paymentMethod || null,
        reference_number: referenceNumber || null,
        description: description || null,
        evidence_file_path: evidenceFileUrl || null,
        submitted_by: user.id,
        // Dual approval workflow: both HR and Accounts must approve
        hr_approval_status: "pending",
        accounts_approval_status: "pending",
        overall_status: "pending",
      })
      .select()
      .single()

    if (paymentError) {
      console.error("[v0] Error creating payment record:", paymentError)
      return NextResponse.json({ error: "Failed to create payment record" }, { status: 500 })
    }

    // Route to appropriate approvers based on roles
    const approverRoles = [
      { role: "hr_executive", approverType: "hr_executive" },
      { role: "hr_leave_office", approverType: "hr_executive" },
      { role: "accounts_executive", approverType: "accounts_executive" },
      { role: "accounts", approverType: "accounts_executive" },
      { role: "admin", approverType: "both" },
    ]

    // Get HR approvers
    const { data: hrApprovers } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", ["hr_executive", "hr_leave_office", "admin"])
      .eq("is_active", true)
      .limit(5)

    // Get Accounts approvers
    const { data: accountsApprovers } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", ["accounts_executive", "accounts", "admin"])
      .eq("is_active", true)
      .limit(5)

    // Notify both sets of approvers
    const notifications = []
    
    if (hrApprovers && hrApprovers.length > 0) {
      notifications.push(
        ...hrApprovers.map((approver) => ({
          recipient_id: approver.id,
          type: "payment_record_pending_hr_approval",
          title: "Payment Record Requires HR Approval",
          message: `Payment of GHc ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })} submitted for loan approval`,
          data: { paymentRecordId: paymentData.id, approvalType: "hr" },
          is_read: false,
        }))
      )
    }

    if (accountsApprovers && accountsApprovers.length > 0) {
      notifications.push(
        ...accountsApprovers.map((approver) => ({
          recipient_id: approver.id,
          type: "payment_record_pending_accounts_approval",
          title: "Payment Record Requires Accounts Approval",
          message: `Payment of GHc ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })} submitted for verification`,
          data: { paymentRecordId: paymentData.id, approvalType: "accounts" },
          is_read: false,
        }))
      )
    }

    if (notifications.length > 0) {
      try {
        await admin.from("staff_notifications").insert(notifications)
      } catch (_notifyErr) {
        // Notification failure is non-fatal — payment record was already saved
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: paymentData,
        message: "Payment record submitted successfully and awaiting dual approval from HR and Accounts executives",
      },
      { status: 201 }
    )
  } catch (err) {
    console.error("[v0] Payment evidence POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - Retrieve payment records
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const loanRequestId = searchParams.get("loanRequestId")
    const overallStatus = searchParams.get("overallStatus") // "pending", "approved", "rejected", "completed"
    const filterByPending = searchParams.get("pendingOnly") === "true"

    let query = admin
      .from("loan_payment_records")
      .select(
        `
        id, loan_request_id, payment_date, amount_paid, 
        payment_method, reference_number, description, evidence_file_path,
        submitted_by, submitted_at,
        hr_executive_id, hr_approval_at, hr_approval_status, hr_approval_notes,
        accounts_executive_id, accounts_approval_at, accounts_approval_status, accounts_approval_notes,
        overall_status, created_at, updated_at
      `
      )
      .order("submitted_at", { ascending: false })

    if (loanRequestId) {
      query = query.eq("loan_request_id", loanRequestId)
    }

    if (overallStatus) {
      query = query.eq("overall_status", overallStatus)
    }

    if (filterByPending) {
      query = query.eq("overall_status", "pending")
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching payment records:", error)
      return NextResponse.json({ error: "Failed to fetch payment records" }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (err) {
    console.error("[v0] Payment records GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
