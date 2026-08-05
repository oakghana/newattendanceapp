import { NextRequest, NextResponse } from "next/server"
import { notifyLeaveHrApproved, notifyLeaveHrRejected } from "@/lib/workflow-emails"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrApproverRole, buildHologramCode } from "@/lib/leave-planning"
import { renderTemplate } from "@/lib/leave-templates"
import { createLeaveResumptionTrackingForLeaveRequest } from "@/lib/leave-resumption-service"
import crypto from "crypto"

// Statuses the HR approver sees in their queue (pending action or already actioned)
const HR_APPROVE_ELIGIBLE = ["hr_office_forwarded", "manager_confirmed", "hod_approved"] as const
const HR_APPROVED_STATUSES = ["hr_approved", "hr_rejected"] as const

export async function GET(request: NextRequest) {
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
        { error: "Only HR Approvers and admins can view HR approval requests." },
        { status: 403 },
      )
    }

    // HR approver roles see ALL requests in eligible statuses (no per-user assignment filter).
    // This ensures the HR executive can see every request forwarded by the HR Leave Office.
    const allEligible = [...HR_APPROVE_ELIGIBLE, ...HR_APPROVED_STATUSES]

    const { data: requests, error: requestError } = await admin
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        status,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        requested_days,
        adjusted_days,
        original_requested_days,
        reason,
        adjustment_reason,
        travelling_days_added,
        leave_year_period,
        memo_draft_subject,
        memo_draft_body,
        memo_draft_cc,
        memo_token,
        memo_generated_at,
        hr_approver_id,
        hr_approver_name,
        hr_approved_at,
        hr_approval_note,
        submitted_at,
        created_at,
        updated_at
      `)
      .in("status", allEligible)
      .order("created_at", { ascending: false })

    if (requestError) {
      console.error("[v0] Error fetching requests:", requestError)
      throw requestError
    }

    // Fetch user details separately to avoid join issues
    const userIds = (requests || []).map((r: any) => r.user_id).filter(Boolean)
    let usersMap: Record<string, any> = {}
    
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, email, department_id, hire_date, date_of_appointment, years_of_service, departments(id, name, code)")
        .in("id", userIds)
      
      if (!usersError && users) {
        usersMap = Object.fromEntries(users.map((u: any) => [u.id, u]))
      }
    }

    // Merge user data into requests
    const enrichedRequests = (requests || []).map((req: any) => ({
      ...req,
      user: usersMap[req.user_id] || null,
    }))

    // Include HR executive profile for signature check and signer block
    const { data: hrProfile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, position, signature_data_url, signature_text, signature_mode")
      .eq("id", user.id)
      .single()

    const signerName = [
      String((hrProfile as any)?.first_name || ""),
      String((hrProfile as any)?.last_name || ""),
    ].filter(Boolean).join(" ").trim() || "HR Executive"
    const signerPosition = String((hrProfile as any)?.position || "HR MANAGER").toUpperCase()

    // Resolve signature: user_profiles first, then approval_signature_registry
    let signerSignatureDataUrl = String((hrProfile as any)?.signature_data_url || "").trim() || null
    let hasStoredSignature =
      signerSignatureDataUrl !== null ||
      String((hrProfile as any)?.signature_text || "").trim().length > 0

    if (!hasStoredSignature) {
      // Fall back to approval_signature_registry — no domain/stage filter so signatures
      // saved via Profile Settings (any domain) are also matched.
      const { data: registryRows } = await admin
        .from("approval_signature_registry")
        .select("signature_mode, signature_text, signature_data_url, is_active, approval_stage, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

      const bestSig = pickBestSignature(registryRows || [])
      if (bestSig) {
        signerSignatureDataUrl = String((bestSig as any)?.signature_data_url || "").trim() || null
        hasStoredSignature =
          signerSignatureDataUrl !== null ||
          String((bestSig as any)?.signature_text || "").trim().length > 0
      }
    }

    return NextResponse.json({
      requests: enrichedRequests || [],
      count: (enrichedRequests || []).length,
      user_id: user.id,
      role,
      has_stored_signature: hasStoredSignature,
      signer_name: signerName,
      signer_position: signerPosition,
      signer_signature_data_url: signerSignatureDataUrl,
    })
  } catch (error) {
    console.error("[v0] GET /api/leave/planning/hr-approve error:", error)
    let msg = "Unknown error"
    if (error instanceof Error) {
      msg = error.message
    } else if (typeof error === "object" && error !== null) {
      msg = JSON.stringify(error)
    } else {
      msg = String(error)
    }
    console.error("[v0] Error message:", msg)
    return NextResponse.json({ error: `Failed to fetch HR approval requests: ${msg}` }, { status: 500 })
  }
}

function leaveTypeLabel(key: string): string {
  const map: Record<string, string> = {
    annual: "Annual Leave",
    sick: "Sick Leave",
    maternity: "Maternity Leave",
    paternity: "Paternity Leave",
    study: "Study Leave",
    compassionate: "Compassionate Leave",
    part_leave: "Part Leave",
    no_pay: "Leave Without Pay",
    casual: "Casual Leave",
  }
  return map[key] || String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-GH", { day: "2-digit", month: "long", year: "numeric" })
}

function getApprovalTemplateKey(leaveTypeKey: string) {
  const normalized = String(leaveTypeKey || "annual").toLowerCase()
  if (normalized === "leave_of_absence") return "leave_of_absence_approval"
  if (normalized === "sick") return "sick_leave_approval"
  if (normalized === "no_pay") return "leave_of_absence"
  return "annual_leave_approval"
}

function pickBestSignature(rows: any[]): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const active = rows.filter((row) => row?.is_active !== false)
  const pool = active.length > 0 ? active : rows

  const score = (row: any) => {
    const mode = String(row?.signature_mode || "").toLowerCase()
    const hasImage = (mode === "draw" || mode === "upload") && String(row?.signature_data_url || "").trim().length > 0
    const hasTyped = mode === "typed" && String(row?.signature_text || "").trim().length > 0
    const stage = String(row?.approval_stage || "").toLowerCase()
    const stageBoost = stage === "hr_approver" ? 50 : 0
    return (hasImage ? 100 : hasTyped ? 10 : 0) + stageBoost
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] || null
}

async function fetchTemplate(admin: any, templateKey: string) {
  const { data } = await admin
    .from("leave_memo_templates")
    .select("template_key, subject_template, body_template, cc_recipients")
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .maybeSingle()
  return data
}

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
      hr_approved_start_date,
      hr_approved_end_date,
      hr_approved_days,
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
    const TERMINAL_STATUSES = ["hr_approved", "hr_rejected", "cancelled"]
    
    // Block duplicate processing
    if ((TERMINAL_STATUSES as readonly string[]).includes(currentStatus)) {
      // Log duplicate attempt for audit
      const auditEntry = {
        action: "duplicate_approval_attempt",
        table_name: "leave_plan_requests",
        record_id: leave_plan_request_id,
        user_id: user.id,
        details: {
          attempted_action: action,
          current_status: currentStatus,
          requested_at: new Date().toISOString(),
          approver_name: approverName,
          leave_year: (leaveRequest as any).leave_year_period,
        },
        created_at: new Date().toISOString(),
      }
      
      await admin.from("audit_logs").insert(auditEntry).catch((e) => {
        console.warn("[v0] Failed to log duplicate attempt:", e)
      })
      
      return NextResponse.json(
        {
          error: "This leave request has already been processed and cannot be processed again.",
          code: "ALREADY_PROCESSED",
          current_status: currentStatus,
        },
        { status: 409 },
      )
    }
    
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

    // Priority 0: inline signature supplied in this request body
    const inlineSigMode = hr_signature_mode ? String(hr_signature_mode).toLowerCase().trim() : ""
    const inlineSigText = hr_signature_text ? String(hr_signature_text).trim() : ""
    const inlineSigDataUrl = hr_signature_data_url ? String(hr_signature_data_url).trim() : ""
    const hasInlineSignature = inlineSigDataUrl.length > 0 || inlineSigText.length > 0

    // Priority 1: user_profiles.signature_data_url (set via Profile Settings > Signature)
    const { data: signerProfile } = await admin
      .from("user_profiles")
      .select("signature_data_url, signature_text, signature_mode")
      .eq("id", user.id)
      .single()

    let resolvedSigMode = inlineSigMode || String((signerProfile as any)?.signature_mode || "draw").toLowerCase()
    let resolvedSigText = hasInlineSignature ? inlineSigText : String((signerProfile as any)?.signature_text || "").trim()
    let resolvedSigDataUrl = hasInlineSignature ? inlineSigDataUrl : String((signerProfile as any)?.signature_data_url || "").trim()

    const hasProfileSignature = resolvedSigDataUrl.length > 0 || resolvedSigText.length > 0

    if (!hasProfileSignature) {
      // Priority 2: fall back to approval_signature_registry — no workflow_domain or
      // approval_stage filter so signatures saved via Profile Settings are also found.
      const { data: approverSignatureRows } = await admin
        .from("approval_signature_registry")
        .select("workflow_domain, approval_stage, signature_mode, signature_text, signature_data_url, is_active, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

      const approverSignature = pickBestSignature(approverSignatureRows || [])
      if (approverSignature) {
        resolvedSigMode = String((approverSignature as any)?.signature_mode || "typed").trim().toLowerCase()
        resolvedSigText = String((approverSignature as any)?.signature_text || "").trim()
        resolvedSigDataUrl = String((approverSignature as any)?.signature_data_url || "").trim()
      }
    }

    // Valid if there is either a data URL (draw/upload) or typed text
    const hasAnySignature = resolvedSigDataUrl.length > 0 || resolvedSigText.length > 0

    const now = new Date().toISOString()
    const effectiveStart = String((leaveRequest as any).adjusted_start_date || (leaveRequest as any).preferred_start_date || "")
    const effectiveEnd = String((leaveRequest as any).adjusted_end_date || (leaveRequest as any).preferred_end_date || "")
    const effectiveDays = Number((leaveRequest as any).adjusted_days || (leaveRequest as any).requested_days || 0)
    const approvedMonths = Number((leaveRequest as any).approved_months || Math.max(1, Math.round(effectiveDays / 30)))
    const returnDate = new Date(effectiveEnd)
    if (!Number.isNaN(returnDate.getTime())) {
      returnDate.setDate(returnDate.getDate() + 1)
      if (returnDate.getDay() === 6) returnDate.setDate(returnDate.getDate() + 2)
      if (returnDate.getDay() === 0) returnDate.setDate(returnDate.getDate() + 1)
    }

    const { data: applicantProfile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, employee_id, staff_number")
      .eq("id", (leaveRequest as any).user_id)
      .maybeSingle()

    const staffName = [
      String((applicantProfile as any)?.first_name || ""),
      String((applicantProfile as any)?.last_name || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Staff Member"

    const templateData = {
      staff_name: staffName,
      staff_number: String((applicantProfile as any)?.employee_id || (applicantProfile as any)?.staff_number || ""),
      leave_type: leaveTypeLabel(String((leaveRequest as any).leave_type_key || "annual")),
      leave_year_period: String((leaveRequest as any).leave_year_period || "2026/2027"),
      leave_start_date: fmtDate(effectiveStart),
      leave_end_date: fmtDate(effectiveEnd),
      approved_days: effectiveDays,
      approved_months: approvedMonths,
      approved_months_text: `${approvedMonths} (${approvedMonths}) month${approvedMonths === 1 ? "" : "s"}`,
      submitted_date: fmtDate((leaveRequest as any).submitted_at || (leaveRequest as any).created_at || now),
      return_to_work_date: fmtDate(returnDate.toISOString()),
      travelling_days: Number((leaveRequest as any).travelling_days_added || 0),
      travelling_days_info: Number((leaveRequest as any).travelling_days_added || 0) > 0 ? `Travelling Days: ${Number((leaveRequest as any).travelling_days_added || 0)} day(s)\n` : "",
      adjustment_details: (leaveRequest as any).adjustment_reason
        ? `Adjustment Details: ${(leaveRequest as any).adjustment_reason}\n\n`
        : "",
      rejection_reason: note || "Management could not approve the request at this time.",
    }

    const approvalTemplate = await fetchTemplate(admin, getApprovalTemplateKey(String((leaveRequest as any).leave_type_key || "annual")))
    const rejectionTemplate = await fetchTemplate(admin, "leave_rejection")

    const fallbackApprovalSubject = approvalTemplate?.subject_template
      ? renderTemplate(String(approvalTemplate.subject_template), templateData)
      : null
    const fallbackApprovalBody = approvalTemplate?.body_template
      ? renderTemplate(String(approvalTemplate.body_template), templateData)
      : null
    const fallbackApprovalCc = approvalTemplate?.cc_recipients ? String(approvalTemplate.cc_recipients) : null

    const fallbackRejectionSubject = rejectionTemplate?.subject_template
      ? renderTemplate(String(rejectionTemplate.subject_template), templateData)
      : null
    const fallbackRejectionBody = rejectionTemplate?.body_template
      ? renderTemplate(String(rejectionTemplate.body_template), templateData)
      : null
    const fallbackRejectionCc = rejectionTemplate?.cc_recipients ? String(rejectionTemplate.cc_recipients) : null

    const providedSubject = memo_draft_subject ? String(memo_draft_subject).trim() : ""
    const providedBody = memo_draft_body ? String(memo_draft_body).trim() : ""
    const providedCc = memo_draft_cc ? String(memo_draft_cc).trim() : ""

    const rawResolvedSubject = providedSubject
      || fallbackApprovalSubject
      || String((leaveRequest as any).memo_draft_subject || "").trim()
    const leaveTypeKey = String((leaveRequest as any).leave_type_key || "annual").toLowerCase()
    const resolvedSubject = leaveTypeKey === "annual"
      ? rawResolvedSubject
      : `RE: ${leaveTypeLabel(leaveTypeKey).toUpperCase()} LEAVE`

    const resolvedBody = providedBody
      || fallbackApprovalBody
      || String((leaveRequest as any).memo_draft_body || "").trim()

    const resolvedCc = providedCc
      || fallbackApprovalCc
      || String((leaveRequest as any).memo_draft_cc || "").trim()

    const rawResolvedRejectSubject = memo_draft_subject
      ? String(memo_draft_subject).trim()
      : String((leaveRequest as any).memo_draft_subject || "").trim() || fallbackRejectionSubject
    const resolvedRejectSubject = leaveTypeKey === "annual"
      ? rawResolvedRejectSubject
      : `RE: ${leaveTypeLabel(leaveTypeKey).toUpperCase()} LEAVE`

    const resolvedRejectBody = memo_draft_body
      ? String(memo_draft_body).trim()
      : String((leaveRequest as any).memo_draft_body || "").trim() || fallbackRejectionBody

    const resolvedRejectCc = memo_draft_cc
      ? String(memo_draft_cc).trim()
      : String((leaveRequest as any).memo_draft_cc || "").trim() || fallbackRejectionCc

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
          memo_draft_subject: resolvedRejectSubject,
          memo_draft_body: resolvedRejectBody,
          memo_draft_cc: resolvedRejectCc,
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

    if (!hasAnySignature) {
      return NextResponse.json(
        {
          error:
            "No saved signature found for your account. Please upload your signature in Profile Settings > Signature before approving leave requests.",
        },
        { status: 400 },
      )
    }

    const finalSigText = resolvedSigText.length > 0 ? resolvedSigText : null
    const finalSigDataUrl = resolvedSigDataUrl.length > 0 ? resolvedSigDataUrl : null

    // Build update object — only include hr_approved_* fields if they have values
    const updatePayload: any = {
      status: "hr_approved",
      hr_approver_id: user.id,
      hr_approver_name: approverName,
      hr_approved_at: now,
      hr_approval_note: note || null,
      ...memoDraftPatch,
      memo_draft_subject: resolvedSubject,
      memo_draft_body: resolvedBody,
      memo_draft_cc: resolvedCc,
      memo_token: memoToken,
      memo_generated_at: now,
      hr_signature_mode: resolvedSigMode,
      hr_signature_text: finalSigText,
      hr_signature_image_url: null,
      hr_signature_data_url: finalSigDataUrl,
      hr_signature_hologram_code: buildHologramCode("HR"),
      updated_at: now,
    }
    
    // Add HR executive date overrides if provided (safe to omit if columns don't exist yet)
    if (hr_approved_start_date) updatePayload.hr_approved_start_date = String(hr_approved_start_date).slice(0, 10)
    if (hr_approved_end_date) updatePayload.hr_approved_end_date = String(hr_approved_end_date).slice(0, 10)
    if (hr_approved_days !== null && hr_approved_days !== undefined) updatePayload.hr_approved_days = Number(hr_approved_days)

    const { error: approveError } = await admin
      .from("leave_plan_requests")
      .update(updatePayload)
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

    // ── Create leave resumption tracking record ───────────────────────────
    // This seeds the leave_resumption_notifications table so the escalation
    // cron can detect non-resumption and notify HOD/RM/HR roles automatically.
    createLeaveResumptionTrackingForLeaveRequest({
      id: leave_plan_request_id,
      user_id: (leaveRequest as any).user_id,
      end_date: effectiveEnd,
    }).catch(() => {})

    // ── Notify HOD, Regional Manager, HR Leave Office of this approval ────
    // Fetch key role holders so they are aware the staff will be on leave.
    const staffUserId = (leaveRequest as any).user_id
    ;(async () => {
      try {
        const leaveTypeLabel2 = leaveTypeLabel(String((leaveRequest as any).leave_type_key || "annual"))
        // Get HOD/RM linked to this staff member
        const { data: hodLinks } = await admin
          .from("loan_hod_linkages")
          .select("hod_user_id")
          .eq("staff_user_id", staffUserId)
        const hodIds = (hodLinks || []).map((h: any) => h.hod_user_id).filter(Boolean)

        // Get all HR Leave Office + HR Executive users
        const { data: hrRoleUsers } = await admin
          .from("user_profiles")
          .select("id")
          .in("role", ["hr_leave_office", "hr_executive", "director_hr", "department_head", "regional_manager"])
          .eq("is_active", true)
        const hrIds = (hrRoleUsers || []).map((u: any) => u.id).filter(Boolean)

        const allRecipients = [...new Set([...hodIds, ...hrIds])].filter(
          (id) => id !== user.id && id !== staffUserId
        )

        if (allRecipients.length > 0) {
          const notifRows = allRecipients.map((recipientId: string) => ({
            recipient_id: recipientId,
            sender_id: user.id,
            sender_role: "hr_executive",
            sender_label: "HR Leave System",
            message: `${staffName} has been granted ${leaveTypeLabel2} from ${fmtDate(effectiveStart)} to ${fmtDate(effectiveEnd)} (${effectiveDays} day(s)). They are expected to resume duty on ${fmtDate(returnDate.toISOString())}.`,
            notification_type: "leave_hr_approved",
            is_read: false,
          }))
          await admin.from("staff_notifications").insert(notifRows).catch(() => {})
        }
      } catch {
        // Non-fatal — don't block the response
      }
    })()

    return NextResponse.json({
      success: true,
      message: "Leave request approved and memo generated.",
      memo_token: memoToken,
      leave_plan_request_id,
    })
  } catch (error) {
    console.error("[hr-approve] POST error:", error)
    let msg = "Unknown error"
    if (error instanceof Error) {
      msg = error.message
    } else if (typeof error === "string") {
      msg = error
    } else if (error && typeof error === "object") {
      msg = JSON.stringify(error)
    }
    return NextResponse.json({ error: `Failed to finalize leave approval: ${msg}` }, { status: 500 })
  }
}
