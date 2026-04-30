import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrLeaveOfficeRole, isHrApproverRole, isHrDepartment, HR_OFFICE_PENDING_STATUSES } from "@/lib/leave-planning"

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
        adjustment_reason: adjustment_reason.trim(),
        holiday_days_deducted: Number(holiday_days_deducted || 0),
        travelling_days_added: Number(travelling_days_added || 0),
        prior_leave_days_deducted: Number(prior_leave_days_deducted || 0),
        hr_office_reviewer_id: user.id,
        hr_office_reviewer_name: reviewerName,
        hr_office_reviewed_at: new Date().toISOString(),
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

    // Notify the staff member
    await admin.from("staff_notifications").insert({
      recipient_id: (leaveRequest as any).user_id,
      type: "leave_plan_hr_office_review",
      title: "Leave Request Reviewed by HR Leave Office",
      message: `Your leave request has been reviewed by HR Leave Office. Adjusted days: ${computedAdjustedDays} (${adjusted_start_date} to ${adjusted_end_date}). Reason: ${adjustment_reason.trim()}. Your request is now awaiting final HR approval.`,
      data: {
        leave_plan_request_id,
        adjusted_days: computedAdjustedDays,
        adjusted_start_date,
        adjusted_end_date,
        adjustment_reason: adjustment_reason.trim(),
      },
    }).then(() => {}).catch(() => {}) // Non-fatal

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
