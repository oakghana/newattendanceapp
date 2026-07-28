import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Roles permitted to submit payment evidence
const ALLOWED_ROLES = ["admin", "accounts", "loan_office", "director_hr", "manager_hr", "hr_office", "hr_leave_office", "it-admin"]

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

    const body = await request.json()
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
    if (!loanRequestId || !paymentDate || !paymentAmount) {
      return NextResponse.json(
        { error: "Missing required fields: loanRequestId, paymentDate, paymentAmount" },
        { status: 400 }
      )
    }

    if (paymentAmount <= 0) {
      return NextResponse.json({ error: "Payment amount must be positive" }, { status: 400 })
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

    // Create payment evidence record
    const { data: evidenceData, error: evidenceError } = await admin
      .from("loan_payment_evidence")
      .insert({
        loan_request_id: loanRequestId,
        user_id: loanData.user_id,
        payment_date: paymentDate,
        payment_amount: paymentAmount,
        payment_method: paymentMethod || null,
        reference_number: referenceNumber || null,
        description: description || null,
        evidence_file_url: evidenceFileUrl || null,
        submitted_by: user.id,
        status: "pending_approval",
      })
      .select()
      .single()

    if (evidenceError) {
      console.error("[v0] Error creating payment evidence:", evidenceError)
      return NextResponse.json({ error: "Failed to create payment evidence" }, { status: 500 })
    }

    // Notify HR directors/executives about the new payment evidence
    const { data: hrDirectors } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", ["director_hr", "manager_hr", "admin"])
      .eq("is_active", true)
      .limit(10)

    if (hrDirectors && hrDirectors.length > 0) {
      await admin.from("staff_notifications").insert(
        hrDirectors.map((hr) => ({
          recipient_id: hr.id,
          type: "payment_evidence_pending_approval",
          title: "New Payment Evidence Requires Approval",
          message: `Payment evidence submitted for loan - Amount: GHc ${paymentAmount}`,
          data: { evidenceId: evidenceData.id },
          is_read: false,
        }))
      ).catch(() => {})
    }

    return NextResponse.json(
      {
        success: true,
        data: evidenceData,
        message: "Payment evidence submitted successfully and awaiting HR Executive approval",
      },
      { status: 201 }
    )
  } catch (err) {
    console.error("[v0] Payment evidence POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET - Retrieve payment evidence records
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const loanRequestId = searchParams.get("loanRequestId")
    const status = searchParams.get("status") // "pending_approval", "approved", "rejected"
    const filterByPending = searchParams.get("pendingOnly") === "true"

    let query = admin
      .from("loan_payment_evidence")
      .select(
        `
        id, loan_request_id, user_id, payment_date, payment_amount, 
        payment_method, reference_number, description, evidence_file_url,
        status, submitted_by, submitted_at, approved_by, approved_at, 
        approval_notes, rejected_by, rejected_at, rejection_reason,
        created_at, updated_at
      `
      )
      .order("submitted_at", { ascending: false })

    if (loanRequestId) {
      query = query.eq("loan_request_id", loanRequestId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (filterByPending) {
      query = query.eq("status", "pending_approval")
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching payment evidence:", error)
      return NextResponse.json({ error: "Failed to fetch payment evidence" }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (err) {
    console.error("[v0] Payment evidence GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
