import { NextRequest, NextResponse } from "next/server"
import { notifyLeaveHrApproved, notifyLeaveHrRejected } from "@/lib/workflow-emails"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrApproverRole, buildHologramCode } from "@/lib/leave-planning"
import crypto from "crypto"

const HR_APPROVE_ELIGIBLE = ["hr_office_forwarded", "manager_confirmed", "hod_approved"] as const

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
      .select("id, role, first_name, last_name, position, department_id, departments(name, code)")
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

    if (!isHrApproverRole(role, deptName, deptCode) && role !== "admin") {
      return NextResponse.json(
        { error: "Only HR Approvers and admins can issue final leave approvals." },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      leave_plan_request_id,
      action, // "approve" | "reject"
      note,
      hr_signature_mode,
      hr_signature_text,
      hr_signature_image_url,
      hr_signature_data_url,
      memo_draft_subject,
      memo_draft_body,
      memo_draft_cc,
    } = body

    const memoDraftPatch = {
      memo_draft_subject: memo_draft_subject ? String(memo_draft_subject).trim() : null,
      memo_draft_body: memo_draft_body ? String(memo_draft_body).trim() : null,
      memo_draft_cc: memo_draft_cc ? String(memo_draft_cc).trim() : null,
      memo_draft_last_edited_by: user.id,
      memo_draft_last_edited_role: "hr_approver",
      memo_draft_last_edited_at: new Date().toISOString(),
    }

    if (!leave_plan_request_id || !action) {
      return NextResponse.json({ error: "leave_plan_request_id and action are required." }, { status: 400 })
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Action must be 'approve' or 'reject'." }, { status: 400 })
    }

    const { data: leaveRequest, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select("*")
      .eq("id", leave_plan_request_id)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found." }, { status: 404 })
    }

    const currentStatus = String((leaveRequest as any).status || "")
    if (!(HR_APPROVE_ELIGIBLE as readonly string[]).includes(currentStatus)) {
      return NextResponse.json(
        {
          error: `This request cannot be finalized in its current state (${currentStatus}).`,
        },
        { status: 400 },
      )
    }

    const approverName = [
      String((profile as any).first_name || ""),
      String((profile as any).last_name || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "HR Approver"

    const now = new Date().toISOString()

    if (action === "reject") {
      await admin
        .from("leave_plan_requests")
        .update({
          status: "hr_rejected",
          hr_approver_id: user.id,
          hr_approver_name: approverName,
          hr_approved_at: now,
          hr_approval_note: note || null,
          ...memoDraftPatch,
          updated_at: now,
        })
        .eq("id", leave_plan_request_id)

      // In-app notification
      await admin.from("staff_notifications").insert({
        recipient_id: (leaveRequest as any).user_id,
        type: "leave_plan_hr_rejected",
        title: "Leave Request Not Approved",
        message: `Your leave request has been rejected by HR. ${note ? `Reason: ${note}` : ""}`,
        data: { leave_plan_request_id, action: "reject", note: note || null },
      }).then(() => {}).catch(() => {})

      // Email notification
      notifyLeaveHrRejected(admin, {
        staffUserId: (leaveRequest as any).user_id,
        staffName: "Staff Member",
        approverName,
        note: note || "",
      }).catch(() => {})

      return NextResponse.json({ success: true, message: "Leave request rejected." })
    }

    // === APPROVE ===
    // Generate a secure memo token for PDF download
    const memoToken = crypto.randomBytes(32).toString("hex")

    const effectiveStart = String((leaveRequest as any).adjusted_start_date || (leaveRequest as any).preferred_start_date || "")
    const effectiveEnd = String((leaveRequest as any).adjusted_end_date || (leaveRequest as any).preferred_end_date || "")
    const effectiveDays = Number((leaveRequest as any).adjusted_days || (leaveRequest as any).requested_days || 0)

    const { error: approveError } = await admin
      .from("leave_plan_requests")
      .update({
        status: "hr_approved",
        hr_approver_id: user.id,
        hr_approver_name: approverName,
        hr_approved_at: now,
        hr_approval_note: note || null,
        ...memoDraftPatch,
        memo_token: memoToken,
        memo_generated_at: now,
        hr_signature_mode: hr_signature_mode || "typed",
        hr_signature_text: hr_signature_text || null,
        hr_signature_image_url: hr_signature_image_url || null,
        hr_signature_data_url: hr_signature_data_url || null,
        hr_signature_hologram_code: buildHologramCode("HR"),
        updated_at: now,
      })
      .eq("id", leave_plan_request_id)

    if (approveError) {
      console.error("[hr-approve] approve update error:", approveError)
      throw approveError
    }

    // Update leave_status entries (one per date in the approved range)
    if (effectiveStart && effectiveEnd) {
      try {
        const startDt = new Date(effectiveStart)
        const endDt = new Date(effectiveEnd)
        const dateRows: any[] = []
        for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
          dateRows.push({
            user_id: (leaveRequest as any).user_id,
            leave_date: d.toISOString().slice(0, 10),
            leave_type: String((leaveRequest as any).leave_type_key || "annual"),
            leave_plan_request_id,
            status: "approved",
          })
        }
        if (dateRows.length > 0) {
          await admin.from("leave_status").upsert(dateRows, { onConflict: "user_id,leave_date" })
        }
      } catch {
        // Non-fatal – leave_status table may not exist yet
      }
    }

    // Update user_profiles leave info
    try {
      await admin
        .from("user_profiles")
        .update({
          leave_status: "approved",
          leave_start_date: effectiveStart || null,
          leave_end_date: effectiveEnd || null,
          updated_at: now,
        })
        .eq("id", (leaveRequest as any).user_id)
    } catch {
      // Non-fatal
    }

    // In-app notification
    await admin.from("staff_notifications").insert({
      recipient_id: (leaveRequest as any).user_id,
      type: "leave_plan_hr_approved",
      title: "Leave Request Approved",
      message: `Your leave request (${effectiveStart} to ${effectiveEnd}, ${effectiveDays} day(s)) has been approved by HR. Your leave memo is ready for download.`,
      data: {
        leave_plan_request_id,
        action: "approve",
        memo_token: memoToken,
        effective_start: effectiveStart,
        effective_end: effectiveEnd,
        effective_days: effectiveDays,
      },
    }).then(() => {}).catch(() => {})

    // Email notification (staff + HOD)
    notifyLeaveHrApproved(admin, {
      leavePlanRequestId: leave_plan_request_id,
      staffUserId: (leaveRequest as any).user_id,
      staffName: "Staff Member",
      leaveType: String((leaveRequest as any).leave_type_key || "annual"),
      effectiveStart,
      effectiveEnd,
      effectiveDays,
      approverName,
      memoToken,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: "Leave request approved and memo generated.",
      memo_token: memoToken,
      leave_plan_request_id,
    })
  } catch (error) {
    console.error("[hr-approve] POST error:", error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to finalize leave approval: ${msg}` }, { status: 500 })
  }
}
