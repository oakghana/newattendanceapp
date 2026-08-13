import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { canManageWorkflowMappings, hrRecordsCanReference, isHrRecordsRole, normalizeReference, normalizeWorkflowRole, referenceKey } from "@/lib/hr-workflow"

const MIN_REFERENCE_LENGTH = 3

export async function POST(request: NextRequest) {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await createAdminClient()
  const { data: actor } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  const role = normalizeWorkflowRole(actor?.role)
  if (!isHrRecordsRole(role) && !canManageWorkflowMappings(role)) {
    return NextResponse.json({ error: "HR Records access required." }, { status: 403 })
  }

  const body = await request.json()
  const entity = body.entity === "loan" ? "loan" : "leave"
  const id = String(body.id || "").trim()
  const reference = normalizeReference(body.reference)
  if (!id) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
  if (reference.length < MIN_REFERENCE_LENGTH) return NextResponse.json({ error: "Reference must contain at least 3 characters." }, { status: 400 })

  const table = entity === "loan" ? "loan_requests" : "leave_plan_requests"
  const referenceColumn = entity === "loan" ? "reference_number" : "memo_reference"
  const { data: row, error: fetchError } = await admin.from(table).select(`id, status, memo_reference_locked, ${referenceColumn}`).eq("id", id).maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 })
  if (row.memo_reference_locked) return NextResponse.json({ error: "This official memo reference is locked and cannot be edited or removed." }, { status: 409 })
  if (!hrRecordsCanReference(row.status)) return NextResponse.json({ error: `Request is not ready for HR Records reference assignment (${row.status || "unknown"}).` }, { status: 409 })

  const { data: duplicate, error: duplicateError } = await admin.from(table).select("id").neq("id", id).ilike(referenceColumn, reference).limit(1).maybeSingle()
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicate) return NextResponse.json({ error: "That memo reference is already in use." }, { status: 409 })

  const now = new Date().toISOString()
  const nextStatus = entity === "loan" ? "referenced" : "hr_office_forwarded"
  const update = {
    [referenceColumn]: reference,
    memo_reference_locked: true,
    memo_reference_locked_at: now,
    memo_reference_locked_by: user.id,
    workflow_stage: entity === "loan" ? "referenced" : "pending_hr_leave_processing",
    status: nextStatus,
    updated_at: now,
  }
  const { data: updated, error: updateError } = await admin.from(table).update(update).eq("id", id).eq("memo_reference_locked", false).select("id, status, workflow_stage, memo_reference_locked").maybeSingle()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: "Reference was locked by another action. Refresh and try again." }, { status: 409 })

  await admin.from("leave_workflow_audit_events").insert({
    ...(entity === "loan" ? { loan_request_id: id } : { request_id: id }),
    event_type: "reference_assigned_and_forwarded",
    from_status: row.status,
    to_status: nextStatus,
    actor_user_id: user.id,
    metadata: { reference_key: referenceKey(reference), workflow_stage: update.workflow_stage },
    created_at: now,
  })
  return NextResponse.json({ success: true, request: updated })
}
