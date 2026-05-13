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

    // Check if user is HR Leave Office or admin
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = (userProfile?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")

    if (!["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)) {
      return NextResponse.json(
        { error: "Only HR Leave Office can approve deferrals" },
        { status: 403 }
      )
    }

    const {
      deferment_request_id,
      decision, // 'approved', 'rejected'
      hr_office_notes,
    } = await request.json()

    if (!deferment_request_id || !decision) {
      return NextResponse.json(
        { error: "deferment_request_id and decision are required" },
        { status: 400 }
      )
    }

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision value. Must be 'approved' or 'rejected'" },
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

    // Verify request is HOD approved
    if (defermentRequest.status !== "hod_approved") {
      return NextResponse.json(
        { error: "Deferment request must be HOD approved before HR can action it" },
        { status: 400 }
      )
    }

    // Update deferment request
    const newStatus = decision === "approved" ? "hr_office_approved" : "hr_office_rejected"
    const { error: updateError } = await admin
      .from("leave_deferment_requests")
      .update({
        hr_office_reviewer_id: user.id,
        hr_office_decision: decision,
        hr_office_notes: hr_office_notes || null,
        hr_office_reviewed_at: new Date().toISOString(),
        status: newStatus,
      })
      .eq("id", deferment_request_id)

    if (updateError) {
      console.error("[v0] Failed to update deferment:", updateError)
      return NextResponse.json({ error: "Failed to process decision" }, { status: 500 })
    }

    // If approved, update the original leave request
    if (decision === "approved") {
      await admin
        .from("leave_plan_requests")
        .update({
          is_deferred: true,
          original_leave_year: new Date().getFullYear().toString(),
          deferral_request_id: deferment_request_id,
          deferment_created_at: new Date().toISOString(),
          status: "hr_approved", // Keep as approved but mark as deferred
        })
        .eq("id", defermentRequest.leave_plan_request_id)
    }

    // Create notification for staff
    const message =
      decision === "approved"
        ? `Your leave deferment request has been approved by HR Leave Office. The leave has been deferred to ${defermentRequest.requested_deferment_period}.`
        : `Your leave deferment request has been rejected by HR Leave Office. Reason: ${hr_office_notes || "No reason provided"}`

    await admin
      .from("leave_deferment_notifications")
      .insert([
        {
          deferment_request_id,
          recipient_id: defermentRequest.user_id,
          type: decision === "approved" ? "completed" : "hr_office_rejected",
          message,
        },
      ])

    return NextResponse.json({
      success: true,
      message: `Deferment request ${decision === "approved" ? "approved" : "rejected"}`,
    })
  } catch (error) {
    console.error("[v0] HR deferment approval error:", error)
    return NextResponse.json({ error: "Failed to process decision" }, { status: 500 })
  }
}
