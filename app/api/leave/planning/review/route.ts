import { NextRequest, NextResponse } from "next/server"
import { notifyLeaveHodApproved, notifyLeaveHodDecision } from "@/lib/workflow-emails"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { calculateRequestedDays, summarizeManagerReviewStatus, type LeavePlanReviewDecision } from "@/lib/leave-planning"
import { isAnnualLeave, isExcludedLocation } from "@/lib/hr-workflow"

function isSchemaIssue(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "").toLowerCase()
  return code === "PGRST205" || code === "PGRST108" || code === "42P01" || code === "42703" || message.includes("does not exist")
}

function schemaIssueResponse(error?: any) {
  const code = error?.code || "unknown"
  const message = String(error?.message || "Database schema error")
  return NextResponse.json(
    {
      error: `Leave approval database error (${code}): ${message}`,
      databaseCode: code,
      needsMigration: false,
      needsSchemaCacheRefresh: true,
    },
    { status: 503 },
  )
}

function normalizeDecision(action: string): LeavePlanReviewDecision | null {
  if (action === "approve") return "approved"
  if (action === "forward_to_regional_manager") return "recommend_change"
  if (action === "recommend_change") return "recommend_change"
  if (action === "reject") return "rejected"
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, assigned_location_id, region_id, first_name, last_name, position, signature_data_url")
      .eq("id", user.id)
      .single()

    if (profileError && isSchemaIssue(profileError)) {
      return schemaIssueResponse(profileError)
    }

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")

    if (!["regional_manager", "department_head", "hr", "hr_office", "hr_leave_office", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(role)) {
      return NextResponse.json({ error: "Only regional managers and department heads can review this request." }, { status: 403 })
    }

    const body = await request.json()
    const { leave_plan_request_id, action, recommendation, adjusted_preferred_start_date, adjusted_preferred_end_date, memo_reference, adjustment_breakdown } = body

    if (!leave_plan_request_id || !action) {
      return NextResponse.json({ error: "leave_plan_request_id and action are required." }, { status: 400 })
    }

    const isRegionalHr = ["hr", "hr_office", "hr_leave_office", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(role)
    const isRegionalForward = action === "forward_to_regional_manager"
    if (isRegionalForward && !isRegionalHr) {
      return NextResponse.json({ error: "Only the assigned Regional HR Office can forward a regional leave request to the Regional Manager." }, { status: 403 })
    }
    const decision = isRegionalForward ? "approved" : normalizeDecision(action)
    if (!decision) {
      return NextResponse.json({ error: "Invalid action. Use approve, recommend_change, or reject." }, { status: 400 })
    }

    if (decision !== "approved" && !recommendation) {
      return NextResponse.json({ error: "Recommendation is required for change request or rejection." }, { status: 400 })
    }

    if (isRegionalForward && (!adjusted_preferred_start_date || !adjusted_preferred_end_date)) {
      return NextResponse.json({ error: "Adjusted start date and end date are required before forwarding to the Regional Manager." }, { status: 400 })
    }

    const isRegionalManagerApproval = role === "regional_manager"
    const isRegionalRequest = action === "forward_to_regional_manager"
      || String(body.workflow_route || "").toLowerCase() === "regional"
    if (isRegionalManagerApproval && isRegionalRequest && decision === "approved" && !isRegionalForward) {
      const profileHasSignature = Boolean(String((profile as any).signature_data_url || "").trim())

      if (!profileHasSignature) {
        return NextResponse.json({ error: "Save your Regional Manager signature in your profile before approving this regional leave request." }, { status: 400 })
      }
    }

    if (decision === "recommend_change" && !isRegionalForward && (!adjusted_preferred_start_date || !adjusted_preferred_end_date)) {
      return NextResponse.json(
        { error: "Adjusted start and end dates are required when recommending changes." },
        { status: 400 },
      )
    }

    const { data: reviews, error: reviewError } = await admin
      .from("leave_plan_reviews")
      .select("id")
      .eq("leave_plan_request_id", leave_plan_request_id)
      .eq("reviewer_id", user.id)

    if (reviewError && isSchemaIssue(reviewError)) {
      return schemaIssueResponse(reviewError)
    }

    if (reviewError || !reviews || reviews.length === 0) {
      const isRegionalHr = ["hr", "hr_office", "hr_leave_office", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(role)
      if (!isRegionalHr) {
        return NextResponse.json({ error: "Review assignment not found for this manager." }, { status: 404 })
      }

      const { data: targetRequest, error: targetRequestError } = await admin
        .from("leave_plan_requests")
        .select("id, user_id, leave_type_key, workflow_route, workflow_stage, status, regional_hr_office_user_id, user_profiles:user_id(assigned_location_id, region_id)")
        .eq("id", leave_plan_request_id)
        .maybeSingle()

      if (targetRequestError || !targetRequest) {
        return NextResponse.json({ error: "Leave request not found." }, { status: 404 })
      }
      if (isRegionalForward && (targetRequest as any).regional_hr_office_user_id && (targetRequest as any).regional_hr_office_user_id !== user.id) {
        return NextResponse.json({ error: "This request is assigned to another Regional HR Office." }, { status: 403 })
      }
      const targetProfile = Array.isArray(targetRequest.user_profiles) ? targetRequest.user_profiles[0] : targetRequest.user_profiles
      const sameScope =
        (profile.assigned_location_id && targetProfile?.assigned_location_id === profile.assigned_location_id) ||
        ((profile as any).region_id && targetProfile?.region_id === (profile as any).region_id)
      if (!sameScope) {
        return NextResponse.json({ error: "This request is outside your assigned location or region." }, { status: 403 })
      }

      if (!isRegionalForward) {
        const { error: assignmentError } = await admin.from("leave_plan_reviews").insert({
          leave_plan_request_id,
          reviewer_id: user.id,
          reviewer_role: role,
          decision: "pending",
        })
        if (assignmentError) throw assignmentError
      }
    }

    // Update all review records for this manager for this request
    const { error: updateReviewError } = await admin
      .from("leave_plan_reviews")
      .update({
        decision,
        recommendation: recommendation || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("leave_plan_request_id", leave_plan_request_id)
      .eq("reviewer_id", user.id)

    if (updateReviewError) {
      if (isSchemaIssue(updateReviewError)) {
        return schemaIssueResponse(updateReviewError)
      }
      throw updateReviewError
    }

    const { data: leavePlan, error: leavePlanError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, preferred_start_date, preferred_end_date, entitlement_days, workflow_route, leave_type_key, requested_days, user_profiles:user_id(assigned_location_id, region_id)")
      .eq("id", leave_plan_request_id)
      .single()

    if (leavePlanError && isSchemaIssue(leavePlanError)) {
      return schemaIssueResponse(leavePlanError)
    }

    if (leavePlanError || !leavePlan) {
      return NextResponse.json({ error: "Leave plan request not found." }, { status: 404 })
    }

    const isRegionalWorkflow = String((leavePlan as any).workflow_route || "").toLowerCase() === "regional"
    if (isRegionalForward && !isRegionalWorkflow) {
      return NextResponse.json({ error: "This leave request is not marked for the regional workflow." }, { status: 400 })
    }

    if (isRegionalManagerApproval && isRegionalRequest) {
      const staffProfile = Array.isArray((leavePlan as any).user_profiles) ? (leavePlan as any).user_profiles[0] : (leavePlan as any).user_profiles
      const sameScope =
        (profile.assigned_location_id && staffProfile?.assigned_location_id === profile.assigned_location_id) ||
        ((profile as any).region_id && staffProfile?.region_id === (profile as any).region_id)
      if (!sameScope) {
        return NextResponse.json({ error: "This regional request is outside your assigned region or location." }, { status: 403 })
      }
    }

    let nextStartDate = leavePlan.preferred_start_date
    let nextEndDate = leavePlan.preferred_end_date
    let nextRequestedDays = calculateRequestedDays(nextStartDate, nextEndDate)
    let effectiveEntitlement = Number(leavePlan.entitlement_days || 0)

    if (isRegionalForward || decision === "recommend_change") {
      nextStartDate = adjusted_preferred_start_date
      nextEndDate = adjusted_preferred_end_date
      nextRequestedDays = calculateRequestedDays(nextStartDate, nextEndDate)

      if (nextRequestedDays <= 0) {
        return NextResponse.json({ error: "Adjusted leave date range is invalid." }, { status: 400 })
      }

      const entitlementDays = Number(leavePlan.entitlement_days || 0)
      const outstandingDays = Number(adjustment_breakdown?.outstanding_days || 0)
      effectiveEntitlement = entitlementDays + outstandingDays
      if (effectiveEntitlement > 0 && nextRequestedDays > effectiveEntitlement) {
        return NextResponse.json(
          {
            error: outstandingDays > 0
              ? `Adjusted request (${nextRequestedDays} day(s)) exceeds entitlement plus outstanding days (${effectiveEntitlement} day(s)).`
              : `Adjusted request (${nextRequestedDays} day(s)) exceeds entitlement (${entitlementDays} day(s)).`,
          },
          { status: 400 },
        )
      }
    }

    const { data: allReviews, error: allReviewsError } = await admin
      .from("leave_plan_reviews")
      .select("decision, recommendation")
      .eq("leave_plan_request_id", leave_plan_request_id)

    if (allReviewsError) {
      if (isSchemaIssue(allReviewsError)) {
        return schemaIssueResponse(allReviewsError)
      }
      throw allReviewsError
    }

    const decisions = (allReviews || []).map((r: any) => r.decision as LeavePlanReviewDecision)
    const nextStatus = summarizeManagerReviewStatus(decisions)

    const mergedRecommendations = (allReviews || [])
      .map((r: any) => r.recommendation)
      .filter((r: string | null) => !!r)
      .join("\n\n")

    const isRegionalManagerApprovalComplete = isRegionalWorkflow && isRegionalManagerApproval && decision === "approved" && !isRegionalForward
    const isDepartmentHeadApproval = decision === "approved" && !isRegionalForward && !isRegionalManagerApproval
    const mustUseHrRecordsReference = !isRegionalWorkflow && isDepartmentHeadApproval && !isAnnualLeave((leavePlan as any).leave_type_key) && !isExcludedLocation((leavePlan as any).assigned_location_name)
    const requestUpdatePayload: Record<string, any> = {
      status: isRegionalForward ? "pending_regional_manager_approval" : isRegionalManagerApprovalComplete ? "approved" : mustUseHrRecordsReference ? "pending_hr_records_reference" : nextStatus,
      ...(isRegionalManagerApprovalComplete ? { workflow_stage: "completed", memo_generated: true, memo_generated_at: new Date().toISOString(), hr_approver_id: user.id } : {}),
      ...(mustUseHrRecordsReference ? { workflow_stage: "pending_hr_records_reference" } : {}),
      manager_recommendation: mergedRecommendations || null,
      ...(isRegionalForward && isAnnualLeave((leavePlan as any).leave_type_key) ? {
        entitlement_days: effectiveEntitlement,
        outstanding_leave_days_added: Number(adjustment_breakdown?.outstanding_days || 0),
        travelling_days_added: Number(adjustment_breakdown?.travelling_days || 0),
        adjustment_breakdown: adjustment_breakdown || {},
        adjustment_reason: String(recommendation || "").trim() || null,
      } : {}),
      ...(isRegionalForward && String(memo_reference || "").trim() ? { memo_reference: String(memo_reference).trim() } : {}),
      updated_at: new Date().toISOString(),
    }

    // Only send columns that are part of the leave-planning table contract.
    // Approval must not fail because optional memo/signature columns are absent.
    const leavePlanColumns = new Set([
      "status", "workflow_stage", "manager_recommendation", "memo_reference", "updated_at", "entitlement_days", "outstanding_leave_days_added", "travelling_days_added", "adjustment_breakdown", "adjustment_reason",
      "memo_generated", "memo_generated_at", "hr_approver_id", "hod_reviewer_id", "hod_reviewed_at",
      "hod_decision", "preferred_start_date", "preferred_end_date", "requested_days",
      "hr_approver_name", "hr_signature_data_url", "hr_approved_at", "hr_approval_note",
    ])
    for (const key of Object.keys(requestUpdatePayload)) {
      if (!leavePlanColumns.has(key)) delete requestUpdatePayload[key]
    }

    if (isRegionalManagerApprovalComplete) {
      const signerName = `${String((profile as any).first_name || "").trim()} ${String((profile as any).last_name || "").trim()}`.trim()
      const { data: signerSignature } = await admin
        .from("approval_signature_registry")
        .select("signature_data_url")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      requestUpdatePayload.hr_approver_name = signerName || "Regional Manager"
      const savedSignature = signerSignature?.signature_data_url || (profile as any).signature_data_url || null
      requestUpdatePayload.hr_signature_data_url = savedSignature
      requestUpdatePayload.hr_approver_id = user.id
      requestUpdatePayload.hr_approved_at = new Date().toISOString()
      requestUpdatePayload.hr_approval_note = "Approved by the Regional Manager under the regional non-annual leave workflow."
    }

    if (decision === "approved" && (nextStatus === "hod_approved" || nextStatus === "manager_confirmed")) {
      requestUpdatePayload.hod_reviewer_id = user.id
      requestUpdatePayload.hod_reviewed_at = new Date().toISOString()
      requestUpdatePayload.hod_decision = "approved"
    } else if (decision === "rejected") {
      requestUpdatePayload.hod_decision = "rejected"
    } else if (decision === "recommend_change") {
      requestUpdatePayload.hod_decision = "changes_requested"
    }

    if (isRegionalForward || decision === "recommend_change") {
      requestUpdatePayload.preferred_start_date = nextStartDate
      requestUpdatePayload.preferred_end_date = nextEndDate
      requestUpdatePayload.requested_days = nextRequestedDays
    }

    const { error: requestUpdateError } = await admin
      .from("leave_plan_requests")
      .update(requestUpdatePayload)
      .eq("id", leave_plan_request_id)

    if (requestUpdateError) {
      if (isSchemaIssue(requestUpdateError)) {
        return schemaIssueResponse(requestUpdateError)
      }
      throw requestUpdateError
    }

    if ((decision === "recommend_change" || decision === "rejected") && !isRegionalForward) {
      const title = decision === "recommend_change" ? "Leave Plan Changes Requested" : "Leave Plan Rejected"
      const message =
        decision === "recommend_change"
          ? `${profile.role === "regional_manager" ? "Regional Manager" : "Department Head"} requested updates to your leave plan (${nextStartDate} to ${nextEndDate}). Reason: ${recommendation}`
          : `${profile.role === "regional_manager" ? "Regional Manager" : "Department Head"} rejected your leave plan request. Reason: ${recommendation}`

      // In-app notification
      await admin.from("staff_notifications").insert({
        recipient_id: leavePlan.user_id,
        type: "leave_plan_manager_review",
        title,
        message,
        data: {
          leave_plan_request_id,
          decision,
          adjusted_preferred_start_date: decision === "recommend_change" ? nextStartDate : null,
          adjusted_preferred_end_date: decision === "recommend_change" ? nextEndDate : null,
          recommendation: recommendation || null,
        },
        is_read: false,
      })

      // Email notification to staff
      const hodName = `${(profile as any).first_name || ""} ${(profile as any).last_name || ""}`.trim() || (profile as any).role || "HOD"
      notifyLeaveHodDecision(admin, {
        staffUserId: leavePlan.user_id,
        staffName: "Staff Member",
        decision: decision as "rejected" | "recommend_change",
        hodName,
        reason: recommendation || "",
        leavePlanRequestId: leave_plan_request_id,
      }).catch(() => {})
    }

    // If fully approved by all HODs → notify HR Leave Office
    if (!isRegionalManagerApprovalComplete && (nextStatus === "hod_approved" || nextStatus === "manager_confirmed")) {
      const hodName = `${(profile as any).first_name || ""} ${(profile as any).last_name || ""}`.trim() || "HOD"
      notifyLeaveHodApproved(admin, {
        leavePlanRequestId: leave_plan_request_id,
        staffName: "Staff Member",
        leaveType: String((leavePlan as any).leave_type_key || "annual"),
        startDate: String((leavePlan as any).preferred_start_date || ""),
        endDate: String((leavePlan as any).preferred_end_date || ""),
        requestedDays: Number((leavePlan as any).requested_days || 0),
        hodName,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, status: isRegionalManagerApprovalComplete ? "approved" : nextStatus })
  } catch (error) {
    if (isSchemaIssue(error)) {
      return schemaIssueResponse(error)
    }
    console.error("[v0] Leave planning manager review error:", error)
    return NextResponse.json({
      error: `Leave approval failed: ${String((error as any)?.message || error || "Unknown database error")}`,
      databaseCode: (error as any)?.code || null,
      hint: (error as any)?.hint || null,
      details: (error as any)?.details || null,
    }, { status: 500 })
  }
}
