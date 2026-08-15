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
  if (!hrRecordsCanReference(row.status, entity)) return NextResponse.json({ error: `Request is not finally approved and ready for HR Records reference assignment (${row.status || "unknown"}).` }, { status: 409 })

  const { data: duplicate, error: duplicateError } = await admin.from(table).select("id").neq("id", id).ilike(referenceColumn, reference).limit(1).maybeSingle()
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicate) return NextResponse.json({ error: "That memo reference is already in use." }, { status: 409 })

  const now = new Date().toISOString()
  const currentStatus = String(row.status || "")
  // HR Records is the FINAL stage of both pipelines it serves, so assigning the
  // official reference must always land the request on a genuinely terminal
  // status — never send it back into an earlier queue (e.g. HR Leave Office or
  // Director HR). For leave, "hr_approved" (label: "Approved") is that terminal
  // status; "pending_hr_records_reference" (the dedicated self-leave HR Records
  // stage, reached only after HR Executive has already forwarded the request)
  // is promoted to the same terminal "hr_approved" status once referenced. For
  // loans, "referenced" is the terminal status HR Records lands the request on
  // once the Director HR / Managing Director approval ("approved_director") has
  // been officially referenced. Requests already sitting at a downstream/final
  // status (hr_approved, approved, regional_manager_approved, referenced, etc.)
  // are left untouched — a reference correction must never rewind their stage.
  const nextStatus =
    entity === "loan"
      ? "referenced"
      : currentStatus === "pending_hr_records_reference"
        ? "hr_approved"
        : currentStatus
  const nextWorkflowStage = entity === "loan" ? "referenced" : undefined
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
    metadata: { reference_key: referenceKey(reference), workflow_stage: nextWorkflowStage, destination_office: "completed" },
    created_at: now,
  })
  return NextResponse.json({ success: true, request: updated })
}
