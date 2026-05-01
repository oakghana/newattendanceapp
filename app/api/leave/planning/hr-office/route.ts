import { NextRequest, NextResponse } from "next/server"
import { notifyLeaveHrOfficeForwarded } from "@/lib/workflow-emails"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrLeaveOfficeRole, isHrApproverRole, HR_OFFICE_PENDING_STATUSES } from "@/lib/leave-planning"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, first_name, last_name, department_id, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String((profile as any).role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    // Allow HR Leave Office role or any HR approver / admin
    const canAct =
      isHrLeaveOfficeRole(role) ||
      isHrApproverRole(role, deptName, deptCode) ||
      role === "admin"

    if (!canAct) {
      return NextResponse.json(
        { error: "Only HR Leave Office staff can perform this action." },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      leave_plan_request_id,
      adjusted_start_date,
      adjusted_end_date,
      adjusted_days,
      adjustment_reason,
      holiday_days_deducted,
      travelling_days_added,
      prior_leave_days_deducted,
      memo_draft_subject,
      memo_draft_body,
      memo_draft_cc,
    } = body

    if (!leave_plan_request_id) {
      return NextResponse.json({ error: "leave_plan_request_id is required." }, { status: 400 })
    }

    if (!adjustment_reason || String(adjustment_reason).trim().length < 5) {
      return NextResponse.json(
        { error: "A detailed adjustment reason is required (this will appear in the memo to staff)." },
        { status: 400 },
      )
    }

    if (!adjusted_start_date || !adjusted_end_date) {
      return NextResponse.json(
        { error: "Adjusted start and end dates are required." },
        { status: 400 },
      )
    }

    // Verify the request exists and is in a state the HR office can process
    const { data: leaveRequest, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, status, requested_days, preferred_start_date, preferred_end_date, leave_type_key, entitlement_days")
      .eq("id", leave_plan_request_id)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found." }, { status: 404 })
    }

    const currentStatus = String((leaveRequest as any).status || "")
    if (!(HR_OFFICE_PENDING_STATUSES as string[]).includes(currentStatus)) {
      return NextResponse.json(
        {
          error: `This request cannot be processed in its current state (${currentStatus}). It must be HOD-approved first.`,
        },
        { status: 400 },
      )
    }

    // Compute final adjusted days from date range if not explicitly provided
    const startDt = new Date(adjusted_start_date)
    const endDt = new Date(adjusted_end_date)
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || endDt < startDt) {
      return NextResponse.json({ error: "Adjusted date range is invalid." }, { status: 400 })
    }
    const computedAdjustedDays =
      adjusted_days != null
        ? Number(adjusted_days)
        : Math.floor((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) + 1

    if (computedAdjustedDays <= 0) {
      return NextResponse.json({ error: "Adjusted days must be greater than zero." }, { status: 400 })
    }

    const entitlementDays = Number((leaveRequest as any).entitlement_days || 0)
    const trimmedReason = String(adjustment_reason || "").trim()
    if (entitlementDays > 0 && computedAdjustedDays > entitlementDays && trimmedReason.length < 10) {
      return NextResponse.json(
        {
          error:
            `Adjusted leave days (${computedAdjustedDays}) exceed recommended entitlement (${entitlementDays}). ` +
            "Provide a clear reason (minimum 10 characters) for this HR Leave Office extension.",
          code: "HR_EXTENSION_REASON_REQUIRED",
          entitlement_days: entitlementDays,
          adjusted_days: computedAdjustedDays,
        },
        { status: 400 },
      )
    }

    const reviewerName = [
      String((profile as any).first_name || ""),
      String((profile as any).last_name || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "HR Leave Office"

    const { error: updateError } = await admin
      .from("leave_plan_requests")
      .update({
        status: "hr_office_forwarded",
        original_requested_days: (leaveRequest as any).requested_days,
        adjusted_days: computedAdjustedDays,
        adjusted_start_date,
        adjusted_end_date,
        adjustment_reason: trimmedReason,
        holiday_days_deducted: Number(holiday_days_deducted || 0),
        travelling_days_added: Number(travelling_days_added || 0),
        prior_leave_days_deducted: Number(prior_leave_days_deducted || 0),
        hr_office_reviewer_id: user.id,
        hr_office_reviewer_name: reviewerName,
        hr_office_reviewed_at: new Date().toISOString(),
        memo_draft_subject: memo_draft_subject ? String(memo_draft_subject).trim() : null,
        memo_draft_body: memo_draft_body ? String(memo_draft_body).trim() : null,
        memo_draft_cc: memo_draft_cc ? String(memo_draft_cc).trim() : null,
        memo_draft_last_edited_by: user.id,
        memo_draft_last_edited_role: "hr_leave_office",
        memo_draft_last_edited_at: new Date().toISOString(),
        // Apply the adjusted dates as the effective dates for HR to finalize
        preferred_start_date: adjusted_start_date,
        preferred_end_date: adjusted_end_date,
        requested_days: computedAdjustedDays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave_plan_request_id)

    if (updateError) {
      console.error("[hr-office] update error:", updateError)
      throw updateError
    }

    // In-app notification to staff
    await admin.from("staff_notifications").insert({
      recipient_id: (leaveRequest as any).user_id,
      type: "leave_plan_hr_office_review",
      title: "Leave Request Reviewed by HR Leave Office",
      message: `Your leave request has been reviewed by HR Leave Office. Adjusted days: ${computedAdjustedDays} (${adjusted_start_date} to ${adjusted_end_date}). Reason: ${trimmedReason}. Your request is now awaiting final HR approval.`,
      data: {
        leave_plan_request_id,
        adjusted_days: computedAdjustedDays,
        adjusted_start_date,
        adjusted_end_date,
        adjustment_reason: trimmedReason,
      },
    }).then(() => {}).catch(() => {}) // Non-fatal


    // Email HR Approvers that a request is ready for final approval
    notifyLeaveHrOfficeForwarded(admin, {
      leavePlanRequestId: leave_plan_request_id,
      staffName: "Staff Member",
      leaveType: String((leaveRequest as any).leave_type_key || "annual"),
      adjustedStartDate: adjusted_start_date,
      adjustedEndDate: adjusted_end_date,
      adjustedDays: computedAdjustedDays,
      reviewerName,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: "Leave request reviewed and forwarded to HR Approvers.",
      adjusted_days: computedAdjustedDays,
    })
  } catch (error) {
    console.error("[hr-office] POST error:", error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to process HR office review: ${msg}` }, { status: 500 })
  }
}
