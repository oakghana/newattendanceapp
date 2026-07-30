import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Roles permitted to approve payments
const HR_APPROVER_ROLES = ["hr_executive", "hr_leave_office", "admin"]
const ACCOUNTS_APPROVER_ROLES = ["accounts_executive", "accounts", "admin"]

export async function PUT(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 })
    }

    // Check user role
    const { data: profileData } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const role = profileData?.role
    if (!role) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 403 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }

    const {
      paymentRecordId,
      approvalType, // "hr" or "accounts"
      approvalStatus, // "approved" or "rejected"
      approvalNotes,
    } = body

    // Validation
    if (!paymentRecordId) {
      return NextResponse.json({ error: "Missing required field: paymentRecordId" }, { status: 400 })
    }
    if (!approvalType || !["hr", "accounts"].includes(approvalType)) {
      return NextResponse.json({ error: "Invalid approvalType: must be 'hr' or 'accounts'" }, { status: 400 })
    }
    if (!approvalStatus || !["approved", "rejected"].includes(approvalStatus)) {
      return NextResponse.json({ error: "Invalid approvalStatus: must be 'approved' or 'rejected'" }, { status: 400 })
    }

    // Check authorization based on approval type
    if (approvalType === "hr" && !HR_APPROVER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Only HR executives can approve HR payments" },
        { status: 403 }
      )
    }

    if (approvalType === "accounts" && !ACCOUNTS_APPROVER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Only Accounts executives can approve payments" },
        { status: 403 }
      )
    }

    // Fetch current payment record
    const { data: paymentRecord, error: fetchError } = await admin
      .from("loan_payment_records")
      .select("*")
      .eq("id", paymentRecordId)
      .single()

    if (fetchError || !paymentRecord) {
      return NextResponse.json({ error: "Payment record not found" }, { status: 404 })
    }

    // Prepare update data
    const updateData: any = {}

    if (approvalType === "hr") {
      updateData.hr_executive_id = user.id
      updateData.hr_approval_at = new Date().toISOString()
      updateData.hr_approval_status = approvalStatus
      updateData.hr_approval_notes = approvalNotes || null
    } else {
      updateData.accounts_executive_id = user.id
      updateData.accounts_approval_at = new Date().toISOString()
      updateData.accounts_approval_status = approvalStatus
      updateData.accounts_approval_notes = approvalNotes || null
    }

    // Update the payment record
    const { data: updatedRecord, error: updateError } = await admin
      .from("loan_payment_records")
      .update(updateData)
      .eq("id", paymentRecordId)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Error updating payment record:", updateError)
      return NextResponse.json({ error: "Failed to update payment record" }, { status: 500 })
    }

    // Send notification to the approver and staff member
    try {
      const notifications = []

      // Notify staff member of approval/rejection
      if (paymentRecord.loan_request_id) {
        const { data: loanData } = await admin
          .from("loan_requests")
          .select("staff_id")
          .eq("id", paymentRecord.loan_request_id)
          .single()

        if (loanData?.staff_id) {
          notifications.push({
            recipient_id: loanData.staff_id,
            type: `payment_${approvalStatus}_${approvalType}`,
            title: `Payment ${approvalStatus === "approved" ? "Approved" : "Rejected"} by ${approvalType === "hr" ? "HR" : "Accounts"}`,
            message: `Your payment of GHc ${paymentRecord.amount_paid.toLocaleString("en-GH", { minimumFractionDigits: 2 })} has been ${approvalStatus}`,
            data: { paymentRecordId },
            is_read: false,
          })
        }
      }

      // If payment is fully approved by both, notify staff and update repayment schedule
      if (updatedRecord.hr_approval_status === "approved" && updatedRecord.accounts_approval_status === "approved") {
        const { data: loanData } = await admin
          .from("loan_requests")
          .select("staff_id")
          .eq("id", paymentRecord.loan_request_id)
          .single()

        if (loanData?.staff_id) {
          notifications.push({
            recipient_id: loanData.staff_id,
            type: "payment_fully_approved",
            title: "Payment Fully Approved",
            message: `Your payment of GHc ${paymentRecord.amount_paid.toLocaleString("en-GH", { minimumFractionDigits: 2 })} has been fully approved and processed`,
            data: { paymentRecordId },
            is_read: false,
          })
        }
      }

      if (notifications.length > 0) {
        await admin.from("staff_notifications").insert(notifications)
      }
    } catch (_notifyErr) {
      // Notification failure is non-fatal
    }

    return NextResponse.json(
      {
        success: true,
        data: updatedRecord,
        message: `Payment ${approvalStatus === "approved" ? "approved" : "rejected"} successfully by ${approvalType === "hr" ? "HR Executive" : "Accounts Executive"}`,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error("[v0] Payment approval error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
