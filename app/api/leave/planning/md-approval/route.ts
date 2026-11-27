import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { createLeaveResumptionTrackingForLeaveRequest } from "@/lib/leave-resumption-service"
import { isManagerLeaveCategory } from "@/lib/leave-memo-access"

export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await createClientAndGetUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: approver, error: approverError } = await admin
      .from("user_profiles")
      .select("id, role, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle()

    if (approverError || !approver) return NextResponse.json({ error: "Approver profile not found." }, { status: 404 })
    const role = String(approver.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
    if (!['admin', 'administrator', 'managing_director'].includes(role)) {
      return NextResponse.json({ error: "Only the Managing Director or an administrator can approve manager-category leave." }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requestId = String(body.leave_plan_request_id || "").trim()
    if (!requestId) return NextResponse.json({ error: "leave_plan_request_id is required." }, { status: 400 })

    const { data: leaveRequest, error: requestError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, status, workflow_stage, staff_category, leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, requested_days, adjusted_days")
      .eq("id", requestId)
      .maybeSingle()

    if (requestError || !leaveRequest) return NextResponse.json({ error: "Leave request not found." }, { status: 404 })
    const priorStatus = String(leaveRequest.status || "").toLowerCase()
    const priorStage = String(leaveRequest.workflow_stage || "")
    if (!["hr_approved", "approved", "regional_manager_approved"].includes(priorStatus) || priorStage === "md_approved") {
      return NextResponse.json({ error: "This leave request is no longer awaiting Managing Director approval." }, { status: 409 })
    }

    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, staff_category, position")
      .eq("id", leaveRequest.user_id)
      .maybeSingle()

    if (!isManagerLeaveCategory(leaveRequest.staff_category || staffProfile?.staff_category, staffProfile?.position)) {
      return NextResponse.json({ error: "The MD leave queue is reserved for manager-category staff." }, { status: 403 })
    }

    const approvedAt = new Date().toISOString()
    const approverName = `${approver.first_name || ""} ${approver.last_name || ""}`.trim() || "Managing Director"
    let updateQuery: any = admin
      .from("leave_plan_requests")
      .update({ workflow_stage: "md_approved", updated_at: approvedAt })
      .eq("id", requestId)
      .eq("status", priorStatus)
    updateQuery = priorStage
      ? updateQuery.eq("workflow_stage", priorStage)
      : updateQuery.is("workflow_stage", null)
    const { data: updated, error: updateError } = await updateQuery
      .select("id, user_id, status, workflow_stage")
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) return NextResponse.json({ error: "Another approver already finalized this request." }, { status: 409 })

    await admin.from("leave_workflow_audit_events").insert({
      request_id: requestId,
      actor_user_id: user.id,
      event_type: "manager_leave_md_approved",
      from_status: priorStage || priorStatus,
      to_status: "md_approved",
      metadata: { approver_name: approverName, approved_at: approvedAt },
    }).then(({ error }) => {
      if (error) console.error("[leave-md-approval] audit insert failed:", error.message)
    })

    const effectiveStart = String(leaveRequest.adjusted_start_date || leaveRequest.preferred_start_date || "")
    const effectiveEnd = String(leaveRequest.adjusted_end_date || leaveRequest.preferred_end_date || "")
    if (effectiveStart && effectiveEnd) {
      const start = new Date(`${effectiveStart.slice(0, 10)}T00:00:00Z`)
      const end = new Date(`${effectiveEnd.slice(0, 10)}T00:00:00Z`)
      const dates: string[] = []
      for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.push(date.toISOString().slice(0, 10))
      }
      if (dates.length) {
        await admin.from("leave_status").upsert(
          dates.map((date) => ({ user_id: leaveRequest.user_id, date, status: "approved", leave_request_id: requestId })),
          { onConflict: "user_id,date" },
        ).then(({ error }) => {
          if (error) console.warn("[leave-md-approval] could not seed leave status dates:", error.message)
        })
      }
      await admin.from("user_profiles").update({
        leave_status: "approved",
        leave_start_date: effectiveStart.slice(0, 10),
        leave_end_date: effectiveEnd.slice(0, 10),
        updated_at: approvedAt,
      }).eq("id", leaveRequest.user_id).then(({ error }) => {
        if (error) console.warn("[leave-md-approval] could not update staff leave status:", error.message)
      })
      void createLeaveResumptionTrackingForLeaveRequest({ id: requestId, user_id: leaveRequest.user_id, end_date: effectiveEnd.slice(0, 10) }).catch((error) => {
        console.warn("[leave-md-approval] resumption tracking could not be created:", error)
      })
    }

    const { error: staffNotificationError } = await admin.from("staff_notifications").insert({
      recipient_id: leaveRequest.user_id,
      sender_id: user.id,
      sender_role: role,
      sender_label: "Managing Director",
      notification_type: "manager_leave_md_approved",
      message: `Your manager-category leave request has received final Managing Director approval. ${String(leaveRequest.leave_type_key || "annual").toLowerCase().startsWith("annual") ? "The memo will be available in the 14-day window before your leave starts." : "Your leave memo is now available in Memo Console."}`,
      action_url: "/dashboard/secretary-memos",
      data: { leave_plan_request_id: requestId, workflow_stage: "md_approved", approved_at: approvedAt },
      is_read: false,
    })
    if (staffNotificationError) console.warn("[leave-md-approval] staff notification failed:", staffNotificationError.message)

    return NextResponse.json({
      success: true,
      request: updated,
      approvedAt,
      approvedBy: approverName,
      message: "Manager-category leave approved. Memo access follows the configured download window.",
    })
  } catch (error) {
    console.error("[leave-md-approval] POST error:", error)
    return NextResponse.json({ error: "Unable to finalize manager-category leave approval." }, { status: 500 })
  }
}
