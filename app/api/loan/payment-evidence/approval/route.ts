import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "")

    const {
      data: { user },
    } = await admin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Check if user is HR Executive
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single()

    const role = roleData?.role
    if (!role || !["hr_executive", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only HR Executives can approve/reject payment evidence" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { evidenceId, action, approvalNotes, rejectionReason } = body

    // Validation
    if (!evidenceId || !action) {
      return NextResponse.json(
        { error: "Missing required fields: evidenceId, action" },
        { status: 400 }
      )
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Action must be 'approve' or 'reject'" }, { status: 400 })
    }

    if (action === "approve" && !approvalNotes) {
      return NextResponse.json(
        { error: "Approval notes are required when approving" },
        { status: 400 }
      )
    }

    if (action === "reject" && !rejectionReason) {
      return NextResponse.json(
        { error: "Rejection reason is required when rejecting" },
        { status: 400 }
      )
    }

    // Get the payment evidence record
    const { data: evidenceData, error: fetchError } = await admin
      .from("loan_payment_evidence")
      .select("*")
      .eq("id", evidenceId)
      .single()

    if (fetchError || !evidenceData) {
      return NextResponse.json({ error: "Payment evidence not found" }, { status: 404 })
    }

    // Verify status is pending_approval
    if (evidenceData.status !== "pending_approval") {
      return NextResponse.json(
        { error: `Cannot ${action} evidence that is already ${evidenceData.status}` },
        { status: 400 }
      )
    }

    // Update the evidence record
    const updateData: any = {
      status: action === "approve" ? "approved" : "rejected",
      updated_at: new Date().toISOString(),
    }

    if (action === "approve") {
      updateData.approved_by = user.id
      updateData.approved_at = new Date().toISOString()
      updateData.approval_notes = approvalNotes
    } else {
      updateData.rejected_by = user.id
      updateData.rejected_at = new Date().toISOString()
      updateData.rejection_reason = rejectionReason
    }

    const { data: updatedEvidence, error: updateError } = await admin
      .from("loan_payment_evidence")
      .update(updateData)
      .eq("id", evidenceId)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Error updating payment evidence:", updateError)
      return NextResponse.json({ error: "Failed to update payment evidence" }, { status: 500 })
    }

    // If approved, mark loan as payment_completed
    if (action === "approve") {
      const { error: loanUpdateError } = await admin
        .from("loan_requests")
        .update({
          status: "payment_completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", evidenceData.loan_request_id)

      if (loanUpdateError) {
        console.error("[v0] Error updating loan status:", loanUpdateError)
        return NextResponse.json({ error: "Failed to mark loan as completed" }, { status: 500 })
      }

      // Create timeline entry for the approval
      await admin
        .from("loan_request_timeline")
        .insert({
          loan_request_id: evidenceData.loan_request_id,
          action_type: "payment_evidence_approved",
          status: "payment_completed",
          description: `Payment evidence approved by HR Executive. Amount verified: GHc ${evidenceData.payment_amount}. Approval notes: ${approvalNotes}`,
          actor_id: user.id,
          actor_role: "hr_executive",
        })
        .catch(() => {
          // Timeline table might not exist, silently fail
        })

      // Notify staff member
      await admin
        .from("notifications")
        .insert({
          user_id: evidenceData.user_id,
          type: "payment_evidence_approved",
          title: "Payment Verified - Loan Marked Complete",
          message: `Your payment of GHc ${evidenceData.payment_amount} has been verified and approved by HR Executive. Your loan is now marked as fully repaid.`,
          related_id: evidenceData.loan_request_id,
          is_read: false,
        })
        .catch(() => {
          // Notifications table might not exist, silently fail
        })
    } else {
      // If rejected, create notification for staff to resubmit
      await admin
        .from("notifications")
        .insert({
          user_id: evidenceData.user_id,
          type: "payment_evidence_rejected",
          title: "Payment Evidence Rejected - Please Resubmit",
          message: `Your payment evidence has been rejected. Reason: ${rejectionReason}. Please resubmit with correct documentation.`,
          related_id: evidenceData.loan_request_id,
          is_read: false,
        })
        .catch(() => {
          // Notifications table might not exist, silently fail
        })
    }

    return NextResponse.json({
      success: true,
      data: updatedEvidence,
      message:
        action === "approve"
          ? "Payment evidence approved and loan marked as completed"
          : "Payment evidence rejected - staff notified to resubmit",
    })
  } catch (err) {
    console.error("[v0] Payment evidence approval error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
