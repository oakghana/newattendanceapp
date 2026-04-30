import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { validateMeaningfulText } from "@/lib/meaningful-text"
import { isSchemaIssue, normalizeRole, requestIsEditable } from "@/lib/loan-workflow"

const LOAN_REQUEST_SUBMISSION_ENABLED = true

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

function isInsuranceOrFuneralLoan(loanTypeKey: string): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  return key.includes("funeral") || key.includes("insurance")
}

function isQualifiedForLoan(loanTypeKey: string, staffRank?: string | null): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  const rank = String(staffRank || "").toLowerCase()

  // Officer rank and above qualifies for Senior loans
  // Manager rank and above qualifies for Manager loans
  // All other ranks (junior, nsp, intern, etc.) qualify for Junior loans only
  const isSeniorOrAbove = /senior|\bsr\b|sr\.|officer|\bofc\b|manager|head|director|regional/.test(rank)
  const isManagerOrAbove = /manager|head|director|regional/.test(rank)

  if (key.includes("_manager")) return isManagerOrAbove
  if (key.includes("_senior")) return isSeniorOrAbove
  return true
}

function shouldRetryWithoutLocationColumns(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase()
  return msg.includes("staff_location_id") || msg.includes("staff_location_name") || msg.includes("staff_district_name") || msg.includes("staff_location_address")
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

    const body = await request.json()
    const { loan_type_key, requested_amount, reason, supporting_document_url } = body || {}

    if (!loan_type_key) {
      return NextResponse.json({ error: "loan_type_key is required" }, { status: 400 })
    }

    const normalizedReason = String(reason || "").trim()
    if (normalizedReason.length > 0) {
      const reasonValidation = validateMeaningfulText(normalizedReason, {
        fieldLabel: "Loan request reason",
        minLength: 10,
      })
      if (!reasonValidation.ok) {
        return NextResponse.json({ error: reasonValidation.error }, { status: 400 })
      }
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, email, role, position, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = normalizeRole((profile as any).role)

    if (!LOAN_REQUEST_SUBMISSION_ENABLED) {
      return loanSubmissionClosedResponse()
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

    if (!isQualifiedForLoan(loanType.loan_key, (profile as any).position) && role !== "admin") {
      return NextResponse.json(
        { error: "You are not qualified for this loan type based on current rank." },
        { status: 403 },
      )
    }

    const todayIso = new Date().toISOString().slice(0, 10)
    const { data: activeLeaveRows, error: leaveError } = await admin
      .from("leave_requests")
      .select("id, status, start_date, end_date")
      .eq("user_id", user.id)
      .in("status", ["approved", "hr_approved", "active", "on_leave"])
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)

    if (!leaveError && (activeLeaveRows || []).length > 0) {
      if (!isInsuranceOrFuneralLoan(loanType.loan_key)) {
        return NextResponse.json(
          {
            error:
              "You are currently on leave. Only insurance or funeral loans are allowed while on leave. For other loan types, submit a reason for HOD pre-approval first.",
          },
          { status: 403 },
        )
      }

      if (!normalizedReason) {
        return NextResponse.json(
          {
            error:
              "Reason is required for leave-period loan requests so HOD can review and approve properly.",
          },
          { status: 400 },
        )
      }
    }

    if (requiresProofAttachment(loanType.loan_key) && !supporting_document_url) {
      return NextResponse.json(
        {
          error: "Proof attachment is required for funeral and insurance loan requests.",
        },
        { status: 400 },
      )
    }

    let locationSnapshot: any = {
      staff_location_id: (profile as any).assigned_location_id || null,
      staff_location_name: null,
      staff_location_address: null,
      staff_district_name: null,
    }

    if ((profile as any).assigned_location_id) {
      const { data: locationRow } = await admin
        .from("geofence_locations")
        .select("id, name, address, districts(name)")
        .eq("id", (profile as any).assigned_location_id)
        .maybeSingle()

      locationSnapshot = {
        staff_location_id: (profile as any).assigned_location_id,
        staff_location_name: (locationRow as any)?.name || null,
        staff_location_address: (locationRow as any)?.address || null,
        staff_district_name: (locationRow as any)?.districts?.name || null,
      }
    }

    const assignedHodIds: string[] = []

    const { data: linkageRows } = await admin
      .from("loan_hod_linkages")
      .select("hod_user_id")
      .eq("staff_user_id", user.id)
      .limit(20)

    for (const row of linkageRows || []) {
      const hodId = (row as any)?.hod_user_id
      if (hodId && !assignedHodIds.includes(hodId)) assignedHodIds.push(hodId)
    }

    if (assignedHodIds.length === 0 && role === "it_admin") {
      const { data: adminApprovers } = await admin
        .from("user_profiles")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true)
        .limit(20)

      for (const approver of adminApprovers || []) {
        const approverId = (approver as any)?.id
        if (approverId && !assignedHodIds.includes(approverId)) assignedHodIds.push(approverId)
      }
    }

    if (assignedHodIds.length === 0 && (profile as any).assigned_location_id) {
      const { data: locationHods } = await admin
        .from("user_profiles")
        .select("id, role")
        .eq("assigned_location_id", (profile as any).assigned_location_id)
        .in("role", ["regional_manager", "department_head"])
        .eq("is_active", true)
        .limit(20)

      for (const hod of locationHods || []) {
        const id = (hod as any)?.id
        if (id && !assignedHodIds.includes(id)) assignedHodIds.push(id)
      }
    }

    if (assignedHodIds.length === 0 && (profile as any).department_id) {
      const { data: deptHods } = await admin
        .from("user_profiles")
        .select("id")
        .eq("department_id", (profile as any).department_id)
        .eq("role", "department_head")
        .eq("is_active", true)
        .limit(20)
      for (const hod of deptHods || []) {
        const id = (hod as any)?.id
        if (id && !assignedHodIds.includes(id)) assignedHodIds.push(id)
      }
    }

    const assignedHodId = assignedHodIds[0] || null

    const payload = {
      request_number: genRequestNumber(),
      user_id: user.id,
      department_id: (profile as any).department_id || null,
      corporate_email: (profile as any).email || user.email || null,
      staff_number: (profile as any).employee_id || null,
      staff_rank: (profile as any).position || null,
      ...locationSnapshot,
      loan_type_key: loanType.loan_key,
      loan_type_label: loanType.loan_label,
      fixed_amount: (loanType as any).fixed_amount || null,
      requested_amount: (loanType as any).fixed_amount || Number(requested_amount || 0) || null,
      reason: normalizedReason || null,
      supporting_document_url: supporting_document_url || null,
      committee_required: Boolean(loanType.requires_committee),
      requires_fd_check: loanType.requires_fd_check !== false,
      status: "pending_hod",
      hod_reviewer_id: assignedHodId,
      submitted_at: new Date().toISOString(),
    }

    let { data: inserted, error: insertError } = await admin.from("loan_requests").insert(payload).select("*").single()

    if (insertError && isSchemaIssue(insertError) && shouldRetryWithoutLocationColumns(insertError)) {
      const fallbackPayload = {
        ...payload,
        staff_location_id: undefined,
        staff_location_name: undefined,
        staff_location_address: undefined,
        staff_district_name: undefined,
      }
      const retry = await admin.from("loan_requests").insert(fallbackPayload).select("*").single()
      inserted = retry.data as any
      insertError = retry.error as any
    }

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

    const { data: admins } = await admin
      .from("user_profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)

    const recipients = Array.from(new Set([...assignedHodIds, ...(admins || []).map((r: any) => r.id)].filter(Boolean))) as string[]
    await notifyUsers(
      admin,
      recipients,
      "New Loan Request Pending HOD Review",
      `${(profile as any).first_name} ${(profile as any).last_name} submitted ${loanType.loan_label}.${assignedHodId ? " Assigned to your HOD queue." : ""}`,
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

    const body = await request.json()
    const { id, loan_type_key, requested_amount, reason, supporting_document_url } = body || {}

    if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 })

    const normalizedReason = String(reason || "").trim()
    if (normalizedReason.length > 0) {
      const reasonValidation = validateMeaningfulText(normalizedReason, {
        fieldLabel: "Loan request reason",
        minLength: 10,
      })
      if (!reasonValidation.ok) {
        return NextResponse.json({ error: reasonValidation.error }, { status: 400 })
      }
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const role = normalizeRole((profile as any).role)

    if (!LOAN_REQUEST_SUBMISSION_ENABLED) {
      return loanSubmissionClosedResponse()
    }

    const { data: existing, error: existingError } = await admin
      .from("loan_requests")
      .select("id, user_id, status, loan_type_key, supporting_document_url, staff_rank")
      .eq("id", id)
      .single()

    if (existingError || !existing) return NextResponse.json({ error: "Request not found" }, { status: 404 })

    // Only the request owner or admin can edit
    if (existing.user_id !== user.id && role !== "admin") {
      return NextResponse.json({ error: "You can only edit your own loan requests." }, { status: 403 })
    }

    if (!requestIsEditable(existing.status)) {
      return NextResponse.json({ error: "Request can no longer be edited at this stage" }, { status: 400 })
    }

    const incomingSupportDoc = supporting_document_url ?? existing.supporting_document_url ?? null

    let updatePayload: any = {
      requested_amount: Number(requested_amount || 0) || null,
      reason: normalizedReason || null,
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
        if (!isQualifiedForLoan(loanType.loan_key, (existing as any).staff_rank) && role !== "admin") {
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
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const role = normalizeRole((profile as any).role)

    const body = await request.json()
    const deleteAll = Boolean(body?.all)
    const id = String(body?.id || "")

    if (deleteAll) {
      if (role !== "admin") return NextResponse.json({ error: "Only admin can delete all loan requests" }, { status: 403 })

      const { error: clearTimelineError } = await admin.from("loan_request_timeline").delete().neq("id", "")
      if (clearTimelineError) throw clearTimelineError

      const { error: clearRequestsError } = await admin.from("loan_requests").delete().neq("id", "")
      if (clearRequestsError) throw clearRequestsError

      return NextResponse.json({ success: true, cleared: true })
    }

    if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 })

    const { data: existing, error: existingError } = await admin
      .from("loan_requests")
      .select("id, user_id, status")
      .eq("id", id)
      .single()

    if (existingError || !existing) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (role !== "admin" && existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (role !== "admin" && !requestIsEditable(existing.status)) {
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
