import { NextRequest, NextResponse } from "next/server"
import { notifyLeaveHodApproved, notifyLeaveHodDecision } from "@/lib/workflow-emails"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { calculateRequestedDays, summarizeManagerReviewStatus, type LeavePlanReviewDecision } from "@/lib/leave-planning"

function isSchemaIssue(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "").toLowerCase()
  return code === "PGRST205" || code === "PGRST108" || code === "42P01" || code === "42703" || message.includes("does not exist")
}

function schemaIssueResponse() {
  return NextResponse.json(
    {
      error:
        "Leave planning tables are not visible in API schema cache. Run scripts 038_leave_planning_2026_2027_workflow.sql and 039_leave_policy_catalog.sql, then reload Supabase API schema cache.",
      needsMigration: true,
      needsSchemaCacheRefresh: true,
    },
    { status: 503 },
  )
}

function normalizeDecision(action: string): LeavePlanReviewDecision | null {
  if (action === "approve") return "approved"
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
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (profileError && isSchemaIssue(profileError)) {
      return schemaIssueResponse()
    }

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")

    if (!["regional_manager", "department_head"].includes(role)) {
      return NextResponse.json({ error: "Only regional managers and department heads can review this request." }, { status: 403 })
    }

    const body = await request.json()
    const { leave_plan_request_id, action, recommendation, adjusted_preferred_start_date, adjusted_preferred_end_date } = body

    if (!leave_plan_request_id || !action) {
      return NextResponse.json({ error: "leave_plan_request_id and action are required." }, { status: 400 })
    }

    const decision = normalizeDecision(action)
    if (!decision) {
      return NextResponse.json({ error: "Invalid action. Use approve, recommend_change, or reject." }, { status: 400 })
    }

    if (decision !== "approved" && !recommendation) {
      return NextResponse.json({ error: "Recommendation is required for change request or rejection." }, { status: 400 })
    }

    if (decision === "recommend_change" && (!adjusted_preferred_start_date || !adjusted_preferred_end_date)) {
      return NextResponse.json(
        { error: "Adjusted start and end dates are required when recommending changes." },
        { status: 400 },
      )
    }

    const { data: review, error: reviewError } = await admin
      .from("leave_plan_reviews")
      .select("id")
      .eq("leave_plan_request_id", leave_plan_request_id)
      .eq("reviewer_id", user.id)
      .single()

    if (reviewError && isSchemaIssue(reviewError)) {
      return schemaIssueResponse()
    }

    if (reviewError || !review) {
      return NextResponse.json({ error: "Review assignment not found for this manager." }, { status: 404 })
    }

    const { data: leavePlan, error: leavePlanError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, preferred_start_date, preferred_end_date, entitlement_days")
      .eq("id", leave_plan_request_id)
      .single()

    if (leavePlanError && isSchemaIssue(leavePlanError)) {
      return schemaIssueResponse()
    }

    if (leavePlanError || !leavePlan) {
      return NextResponse.json({ error: "Leave plan request not found." }, { status: 404 })
    }

    let nextStartDate = leavePlan.preferred_start_date
    let nextEndDate = leavePlan.preferred_end_date
    let nextRequestedDays = calculateRequestedDays(nextStartDate, nextEndDate)

    if (decision === "recommend_change") {
      nextStartDate = adjusted_preferred_start_date
      nextEndDate = adjusted_preferred_end_date
      nextRequestedDays = calculateRequestedDays(nextStartDate, nextEndDate)

      if (nextRequestedDays <= 0) {
        return NextResponse.json({ error: "Adjusted leave date range is invalid." }, { status: 400 })
      }

      const entitlementDays = Number(leavePlan.entitlement_days || 0)
      if (entitlementDays > 0 && nextRequestedDays > entitlementDays) {
        return NextResponse.json(
          {
            error: `Adjusted request (${nextRequestedDays} day(s)) exceeds entitlement (${entitlementDays} day(s)).`,
          },
          { status: 400 },
        )
      }
    }

    const { error: updateReviewError } = await admin
      .from("leave_plan_reviews")
      .update({
        decision,
        recommendation: recommendation || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", review.id)

    if (updateReviewError) {
      if (isSchemaIssue(updateReviewError)) {
        return schemaIssueResponse()
      }
      throw updateReviewError
    }

    const { data: allReviews, error: allReviewsError } = await admin
      .from("leave_plan_reviews")
      .select("decision, recommendation")
      .eq("leave_plan_request_id", leave_plan_request_id)

    if (allReviewsError) {
      if (isSchemaIssue(allReviewsError)) {
        return schemaIssueResponse()
      }
      throw allReviewsError
    }

    const decisions = (allReviews || []).map((r: any) => r.decision as LeavePlanReviewDecision)
    const nextStatus = summarizeManagerReviewStatus(decisions)

    const mergedRecommendations = (allReviews || [])
      .map((r: any) => r.recommendation)
      .filter((r: string | null) => !!r)
      .join("\n\n")

    const requestUpdatePayload: Record<string, any> = {
      status: nextStatus,
      manager_recommendation: mergedRecommendations || null,
      updated_at: new Date().toISOString(),
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

    if (decision === "recommend_change") {
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
        return schemaIssueResponse()
      }
      throw requestUpdateError
    }

    if (decision === "recommend_change" || decision === "rejected") {
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
    if (nextStatus === "hod_approved" || nextStatus === "manager_confirmed") {
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

    return NextResponse.json({ success: true, status: nextStatus })
  } catch (error) {
    if (isSchemaIssue(error)) {
      return schemaIssueResponse()
    }
    console.error("[v0] Leave planning manager review error:", error)
    return NextResponse.json({ error: "Failed to review leave planning request." }, { status: 500 })
  }
}
