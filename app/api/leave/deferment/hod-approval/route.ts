import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      deferment_request_id,
      decision, // 'approved', 'rejected', 'request_change'
      hod_notes,
      hod_proposed_deferment_year,
      hod_proposed_deferment_period,
    } = await request.json()

    if (!deferment_request_id || !decision) {
      return NextResponse.json(
        { error: "deferment_request_id and decision are required" },
        { status: 400 }
      )
    }

    if (!["approved", "rejected", "request_change"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision value" },
        { status: 400 }
      )
    }

    // Get deferment request
    const { data: defermentRequest, error: deferError } = await admin
      .from("leave_deferment_requests")
      .select("*")
      .eq("id", deferment_request_id)
      .single()

    if (deferError || !defermentRequest) {
      return NextResponse.json({ error: "Deferment request not found" }, { status: 404 })
    }

    // Verify user is the HOD/RM and request is pending
    if (defermentRequest.status !== "pending_hod_review") {
      return NextResponse.json(
        { error: "Deferment request is not pending HOD review" },
        { status: 400 }
      )
    }

    // Get the leave request to check authority
    const { data: leaveRequest } = await admin
      .from("leave_plan_requests")
      .select("hod_user_id, regional_manager_id")
      .eq("id", defermentRequest.leave_plan_request_id)
      .single()

    const isHodOrRm = leaveRequest?.hod_user_id === user.id || leaveRequest?.regional_manager_id === user.id

    if (!isHodOrRm) {
      return NextResponse.json(
        { error: "You are not authorized to approve this deferment" },
        { status: 403 }
      )
    }

    // Update deferment request
    const updatePayload: any = {
      hod_reviewer_id: user.id,
      hod_decision: decision,
      hod_notes: hod_notes || null,
      hod_reviewed_at: new Date().toISOString(),
    }

    if (decision === "approved") {
      updatePayload.status = "hod_approved"
    } else if (decision === "rejected") {
      updatePayload.status = "hod_rejected"
    } else if (decision === "request_change") {
      updatePayload.status = "hod_changes_requested"
      updatePayload.hod_proposed_deferment_year = hod_proposed_deferment_year || null
      updatePayload.hod_proposed_deferment_period = hod_proposed_deferment_period || null
    }

    const { error: updateError } = await admin
      .from("leave_deferment_requests")
      .update(updatePayload)
      .eq("id", deferment_request_id)

    if (updateError) {
      console.error("[v0] Failed to update deferment:", updateError)
      return NextResponse.json({ error: "Failed to process decision" }, { status: 500 })
    }

    // Create notification for staff
    const notificationType = decision === "approved" ? "hod_approved" : decision === "rejected" ? "hod_rejected" : "hod_changes_requested"
    const message =
      decision === "approved"
        ? `Your leave deferment request has been approved by your HOD/Manager.`
        : decision === "rejected"
          ? `Your leave deferment request has been rejected by your HOD/Manager. Reason: ${hod_notes || "No reason provided"}`
          : `Your leave deferment request requires changes. Please review the proposed period: ${hod_proposed_deferment_period}`

    await admin
      .from("leave_deferment_notifications")
      .insert([
        {
          deferment_request_id,
          recipient_id: defermentRequest.user_id,
          type: notificationType,
          message,
        },
      ])

    return NextResponse.json({
      success: true,
      message: `Deferment request ${decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "changes requested"}`,
    })
  } catch (error) {
    console.error("[v0] HOD deferment approval error:", error)
    return NextResponse.json({ error: "Failed to process decision" }, { status: 500 })
  }
}
