import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isSchemaIssue, requestIsEditable } from "@/lib/loan-workflow"

const LOAN_REQUEST_SUBMISSION_ENABLED = false

function loanSubmissionClosedResponse() {
  return NextResponse.json(
    {
      error: "Loan request module is under management review.",
      message: "New or edited loan applications are temporarily disabled until management gives the green light.",
    },
    { status: 423 },
  )
}

function genRequestNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `LN-${stamp}-${rand}`
}

function requiresProofAttachment(loanTypeKey: string): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  return key.includes("funeral") || key.includes("insurance")
}

function isQualifiedForLoan(loanTypeKey: string, staffRank?: string | null): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  const rank = String(staffRank || "").toLowerCase()

  const isSeniorOrAbove = /senior|\bsr\b|sr\.|manager|head|director|regional/.test(rank)
  const isManagerOrAbove = /manager|head|director|regional/.test(rank)

  if (key.includes("_manager")) return isManagerOrAbove
  if (key.includes("_senior")) return isSeniorOrAbove
  return true
}

async function addTimeline(admin: any, loanRequestId: string, actorId: string, actorRole: string, actionKey: string, fromStatus: string | null, toStatus: string | null, note?: string | null) {
  await admin.from("loan_request_timeline").insert({
    loan_request_id: loanRequestId,
    actor_id: actorId,
    actor_role: actorRole,
    action_key: actionKey,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
  })
}

async function notifyUsers(admin: any, userIds: string[], title: string, message: string, type = "loan_update", data: any = {}) {
  if (!userIds.length) return
  const rows = userIds.map((uid) => ({
    user_id: uid,
    title,
    message,
    type,
    data,
    is_read: false,
  }))
  await admin.from("staff_notifications").insert(rows)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!LOAN_REQUEST_SUBMISSION_ENABLED) {
      return loanSubmissionClosedResponse()
    }

    const body = await request.json()
    const { loan_type_key, requested_amount, reason, supporting_document_url } = body || {}

    if (!loan_type_key) {
      return NextResponse.json({ error: "loan_type_key is required" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, email, role, position, department_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: loanType, error: typeError } = await admin
      .from("loan_types")
      .select("loan_key, loan_label, requires_committee, requires_fd_check, fixed_amount")
      .eq("loan_key", loan_type_key)
      .eq("is_active", true)
      .single()

    if (typeError || !loanType) {
      return NextResponse.json({ error: "Loan type not found or inactive" }, { status: 404 })
    }

    if (!isQualifiedForLoan(loanType.loan_key, (profile as any).position)) {
      return NextResponse.json(
        { error: "You are not qualified for this loan type based on current rank." },
        { status: 403 },
      )
    }

    if (requiresProofAttachment(loanType.loan_key) && !supporting_document_url) {
      return NextResponse.json(
        {
          error: "Proof attachment is required for funeral and insurance loan requests.",
        },
        { status: 400 },
      )
    }

    const payload = {
      request_number: genRequestNumber(),
      user_id: user.id,
      department_id: (profile as any).department_id || null,
      corporate_email: (profile as any).email || user.email || null,
      staff_number: (profile as any).employee_id || null,
      staff_rank: (profile as any).position || null,
      loan_type_key: loanType.loan_key,
      loan_type_label: loanType.loan_label,
      fixed_amount: (loanType as any).fixed_amount || null,
      requested_amount: (loanType as any).fixed_amount || Number(requested_amount || 0) || null,
      reason: String(reason || "").trim() || null,
      supporting_document_url: supporting_document_url || null,
      committee_required: Boolean(loanType.requires_committee),
      requires_fd_check: loanType.requires_fd_check !== false,
      status: "pending_hod",
      submitted_at: new Date().toISOString(),
    }

    const { data: inserted, error: insertError } = await admin.from("loan_requests").insert(payload).select("*").single()

    if (insertError) {
      if (isSchemaIssue(insertError)) {
        return NextResponse.json(
          {
            error: "Loan module schema missing",
            message: "Run scripts/051_loan_module_workflow.sql in Supabase SQL Editor.",
          },
          { status: 500 },
        )
      }
      throw insertError
    }

    await addTimeline(admin, inserted.id, user.id, String((profile as any).role || "staff"), "staff_submit", null, "pending_hod", reason)

    const { data: hods } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", ["department_head", "regional_manager", "admin"])
      .eq("is_active", true)

    const recipients = (hods || []).map((r: any) => r.id)
    await notifyUsers(
      admin,
      recipients,
      "New Loan Request Pending HOD Review",
      `${(profile as any).first_name} ${(profile as any).last_name} submitted ${loanType.loan_label}.`,
      "loan_hod_pending",
      { request_id: inserted.id, request_number: inserted.request_number },
    )

    await notifyUsers(
      admin,
      [user.id],
      "Loan Request Submitted",
      `Your ${loanType.loan_label} request has been submitted and is pending HOD review.`,
      "loan_staff_submitted",
      { request_id: inserted.id, request_number: inserted.request_number },
    )

    return NextResponse.json({ success: true, data: inserted })
  } catch (error: any) {
    console.error("loan request post error", error)
    return NextResponse.json({ error: error?.message || "Failed to submit loan request" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!LOAN_REQUEST_SUBMISSION_ENABLED) {
      return loanSubmissionClosedResponse()
    }

    const body = await request.json()
    const { id, loan_type_key, requested_amount, reason, supporting_document_url } = body || {}

    if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 })

    const { data: existing, error: existingError } = await admin
      .from("loan_requests")
      .select("id, user_id, status, loan_type_key, supporting_document_url")
      .eq("id", id)
      .single()

    if (existingError || !existing) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!requestIsEditable(existing.status)) {
      return NextResponse.json({ error: "Request can no longer be edited at this stage" }, { status: 400 })
    }

    const incomingSupportDoc = supporting_document_url ?? existing.supporting_document_url ?? null

    let updatePayload: any = {
      requested_amount: Number(requested_amount || 0) || null,
      reason: String(reason || "").trim() || null,
      supporting_document_url: incomingSupportDoc,
      updated_at: new Date().toISOString(),
    }

    if (loan_type_key) {
      const { data: loanType } = await admin
        .from("loan_types")
        .select("loan_key, loan_label, requires_committee, requires_fd_check, fixed_amount")
        .eq("loan_key", loan_type_key)
        .eq("is_active", true)
        .single()

      if (loanType) {
        if (!isQualifiedForLoan(loanType.loan_key, (existing as any).staff_rank)) {
          return NextResponse.json(
            { error: "You are not qualified for this loan type based on current rank." },
            { status: 403 },
          )
        }
        updatePayload.loan_type_key = loanType.loan_key
        updatePayload.loan_type_label = loanType.loan_label
        updatePayload.committee_required = Boolean(loanType.requires_committee)
        updatePayload.requires_fd_check = loanType.requires_fd_check !== false
        updatePayload.fixed_amount = (loanType as any).fixed_amount || null
        updatePayload.requested_amount = (loanType as any).fixed_amount || null
      }
    }

    const finalLoanTypeKey = String(updatePayload.loan_type_key || existing.loan_type_key || "")
    if (requiresProofAttachment(finalLoanTypeKey) && !updatePayload.supporting_document_url) {
      return NextResponse.json(
        {
          error: "Proof attachment is required for funeral and insurance loan requests.",
        },
        { status: 400 },
      )
    }

    const { data: updated, error: updateError } = await admin
      .from("loan_requests")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single()

    if (updateError) throw updateError

    await addTimeline(admin, id, user.id, "staff", "staff_edit", existing.status, existing.status, "Staff updated request")

    return NextResponse.json({ success: true, data: updated })
  } catch (error: any) {
    console.error("loan request put error", error)
    return NextResponse.json({ error: error?.message || "Failed to update request" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!LOAN_REQUEST_SUBMISSION_ENABLED) {
      return loanSubmissionClosedResponse()
    }

    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 })

    const { data: existing, error: existingError } = await admin
      .from("loan_requests")
      .select("id, user_id, status")
      .eq("id", id)
      .single()

    if (existingError || !existing) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!requestIsEditable(existing.status)) {
      return NextResponse.json({ error: "Request can no longer be deleted at this stage" }, { status: 400 })
    }

    const { error: deleteError } = await admin.from("loan_requests").delete().eq("id", id)
    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("loan request delete error", error)
    return NextResponse.json({ error: error?.message || "Failed to delete request" }, { status: 500 })
  }
}
