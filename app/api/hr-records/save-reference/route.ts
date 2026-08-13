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
  const { data: row, error: fetchError } = await admin.from(table).select(`id, status, memo_reference_locked, ${referenceColumn}`).eq("id", id).maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 })
  const isCorrection = Boolean(row.memo_reference_locked)
  if (!isCorrection && !hrRecordsCanReference(row.status)) return NextResponse.json({ error: `Request is not ready for HR Records reference assignment (${row.status || "unknown"}).` }, { status: 409 })

  const { data: duplicate, error: duplicateError } = await admin.from(table).select("id").neq("id", id).ilike(referenceColumn, reference).limit(1).maybeSingle()
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicate) return NextResponse.json({ error: "That memo reference is already in use." }, { status: 409 })

  const now = new Date().toISOString()
  const nextStatus = entity === "loan" ? "referenced" : "hr_office_forwarded"
  const nextWorkflowStage = entity === "loan" ? "referenced" : "pending_hr_leave_processing"
  const update = isCorrection
    ? { [referenceColumn]: reference, updated_at: now }
    : {
        [referenceColumn]: reference,
        memo_reference_locked: true,
        memo_reference_locked_at: now,
        memo_reference_locked_by: user.id,
        workflow_stage: nextWorkflowStage,
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
