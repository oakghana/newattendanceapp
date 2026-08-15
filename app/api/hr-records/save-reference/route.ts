import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { hrRecordsCanReference, isHrRecordsRole, normalizeReference, normalizeWorkflowRole, referenceKey } from "@/lib/hr-workflow"

const MIN_REFERENCE_LENGTH = 3

export async function POST(request: NextRequest) {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createAdminClient()
  const { data: actor } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  const role = normalizeWorkflowRole(actor?.role)
  if (!isHrRecordsRole(role)) {
    return NextResponse.json({ error: "Only the HR Records office can manage memo references." }, { status: 403 })
  }

  const body = await request.json()
  const entity = body.entity === "loan" ? "loan" : "leave"
  const id = String(body.id || "").trim()
  const reference = normalizeReference(body.reference)
  if (!id) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
  if (reference.length < MIN_REFERENCE_LENGTH) return NextResponse.json({ error: "Reference must contain at least 3 characters." }, { status: 400 })

  const table = entity === "loan" ? "loan_requests" : "leave_plan_requests"
  const referenceColumn = entity === "loan" ? "reference_number" : "memo_reference"
  const selectColumns = entity === "loan"
    ? `id, status, workflow_stage, memo_reference_locked, ${referenceColumn}`
    : `id, status, workflow_route, workflow_stage, memo_reference_locked, ${referenceColumn}`
  const { data: rowData, error: fetchError } = await admin.from(table).select(selectColumns).eq("id", id).maybeSingle()
  const row = rowData as any
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 })
  // Regional HR may already have supplied a reference before HR Records receives
  // the request. HR Records must be able to correct that value without reopening
  // or rewinding the workflow stage.
  const existingReference = normalizeReference(String((row as any)[referenceColumn] || ""))
  const regionalLeaveStatuses = new Set(["pending_regional_hr_office_review", "pending_regional_hr_review", "regional_hr_office_review", "regional_hr_approved", "regional_manager_approved", "completed"])
  const route = String((row as any).workflow_route || "").toLowerCase()
  const isRegionalLeave = entity === "leave" && (route === "regional" || regionalLeaveStatuses.has(String(row.status || "").toLowerCase()))
  const isCorrection = Boolean(row.memo_reference_locked || existingReference)
  if (isRegionalLeave) return NextResponse.json({ error: "Regional HR memo references are read-only for HR Records." }, { status: 403 })
  if (!hrRecordsCanReference(row.status)) return NextResponse.json({ error: `Request is not finally approved and ready for HR Records reference assignment (${row.status || "unknown"}).` }, { status: 409 })

  const { data: duplicate, error: duplicateError } = await admin.from(table).select("id").neq("id", id).ilike(referenceColumn, reference).limit(1).maybeSingle()
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicate) return NextResponse.json({ error: "That memo reference is already in use." }, { status: 409 })

  const now = new Date().toISOString()
  const currentStatus = String(row.status || "")
  // The next status must land on a value the destination office's own queue and
  // action endpoint actually recognize as pending work — never a made-up
  // intermediate status. For leave, "pending_hr_records_reference" is the only
  // status that genuinely needs to move once referenced: it is functionally
  // equivalent to "hod_approved" (HOD already approved it; it was only held back
  // for the official memo reference), so referencing it must promote it to
  // "hod_approved" — the exact status HR_OFFICE_PENDING_STATUSES and the HR
  // Leave Office action route (app/api/leave/planning/hr-office/route.ts) both
  // gate on. Requests already sitting at a downstream/final status (hod_approved,
  // hr_office_forwarded, hr_approved, approved, regional_manager_approved, etc.)
  // are left untouched — a reference correction must never rewind their stage.
  const nextStatus =
    entity === "loan"
      ? "referenced"
      : currentStatus === "pending_hr_records_reference"
        ? "hod_approved"
        : currentStatus
  const statusIsAdvancing = nextStatus !== currentStatus
  // Only stamp "awaiting HR Leave Office" when the request is genuinely moving into
  // that queue for the first time. Corrections on requests already approved,
  // rejected, or already forwarded must not be re-stamped into an earlier stage.
  const nextWorkflowStage = entity === "loan" ? "referenced" : statusIsAdvancing ? "pending_hr_leave_processing" : undefined
  const update = isCorrection
    ? { [referenceColumn]: reference, updated_at: now }
    : {
        [referenceColumn]: reference,
        memo_reference_locked: true,
        memo_reference_locked_at: now,
        memo_reference_locked_by: user.id,
        ...(nextWorkflowStage ? { workflow_stage: nextWorkflowStage } : {}),
        status: nextStatus,
        updated_at: now,
      }
  const { data: updated, error: updateError } = await admin.from(table).update(update).eq("id", id).select("id, status, workflow_stage, memo_reference_locked").maybeSingle()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: "Reference was locked by another action. Refresh and try again." }, { status: 409 })

  await admin.from("leave_workflow_audit_events").insert({
    ...(entity === "loan" ? { loan_request_id: id } : { request_id: id }),
    event_type: "reference_assigned_and_forwarded",
    from_status: row.status,
    to_status: nextStatus,
    actor_user_id: user.id,
    metadata: { reference_key: referenceKey(reference), workflow_stage: nextWorkflowStage, destination_office: entity === "loan" ? "hr_loan_office" : "hr_leave_office" },
    created_at: now,
  })
  return NextResponse.json({ success: true, request: updated })
}
