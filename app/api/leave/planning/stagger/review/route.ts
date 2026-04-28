import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
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
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
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
      return NextResponse.json({ error: "Only managers can review stagger requests." }, { status: 403 })
    }

    const body = await request.json()
    const { leave_plan_stagger_request_id, action, recommendation, adjusted_requested_start_date, adjusted_requested_end_date } = body

    if (!leave_plan_stagger_request_id || !action) {
      return NextResponse.json({ error: "leave_plan_stagger_request_id and action are required." }, { status: 400 })
    }

    const decision = normalizeDecision(action)
    if (!decision) {
      return NextResponse.json({ error: "Invalid action. Use approve, recommend_change, or reject." }, { status: 400 })
    }

    if (decision !== "approved" && !recommendation) {
      return NextResponse.json({ error: "Recommendation is required for change request or rejection." }, { status: 400 })
    }

    if (decision === "recommend_change" && (!adjusted_requested_start_date || !adjusted_requested_end_date)) {
      return NextResponse.json(
        { error: "Adjusted stagger start and end dates are required when recommending changes." },
        { status: 400 },
      )
    }

    const { data: review, error: reviewError } = await supabase
      .from("leave_plan_stagger_reviews")
      .select("id")
      .eq("leave_plan_stagger_request_id", leave_plan_stagger_request_id)
      .eq("reviewer_id", user.id)
      .single()

    if (reviewError && isSchemaIssue(reviewError)) {
      return schemaIssueResponse()
    }

    if (reviewError || !review) {
      return NextResponse.json({ error: "Review assignment not found for this manager." }, { status: 404 })
    }

    const { data: staggerRequest, error: staggerRequestError } = await supabase
      .from("leave_plan_stagger_requests")
      .select("id, user_id, requested_start_date, requested_end_date, entitlement_days")
      .eq("id", leave_plan_stagger_request_id)
      .single()

    if (staggerRequestError && isSchemaIssue(staggerRequestError)) {
      return schemaIssueResponse()
    }

    if (staggerRequestError || !staggerRequest) {
      return NextResponse.json({ error: "Stagger request not found." }, { status: 404 })
    }

    let nextStartDate = staggerRequest.requested_start_date
    let nextEndDate = staggerRequest.requested_end_date

    if (decision === "recommend_change") {
      nextStartDate = adjusted_requested_start_date
      nextEndDate = adjusted_requested_end_date
      const adjustedDays = calculateRequestedDays(nextStartDate, nextEndDate)

      if (adjustedDays <= 0) {
        return NextResponse.json({ error: "Adjusted stagger leave date range is invalid." }, { status: 400 })
      }

      const entitlementDays = Number(staggerRequest.entitlement_days || 0)
      if (entitlementDays > 0 && adjustedDays > entitlementDays) {
        return NextResponse.json(
          {
            error: `Adjusted stagger request (${adjustedDays} day(s)) exceeds entitlement (${entitlementDays} day(s)).`,
          },
          { status: 400 },
        )
      }
    }

    const { error: updateReviewError } = await supabase
      .from("leave_plan_stagger_reviews")
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

    const { data: allReviews, error: allReviewsError } = await supabase
      .from("leave_plan_stagger_reviews")
      .select("decision, recommendation")
      .eq("leave_plan_stagger_request_id", leave_plan_stagger_request_id)

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

    if (decision === "recommend_change") {
      requestUpdatePayload.requested_start_date = nextStartDate
      requestUpdatePayload.requested_end_date = nextEndDate
    }

    const { error: requestUpdateError } = await supabase
      .from("leave_plan_stagger_requests")
      .update(requestUpdatePayload)
      .eq("id", leave_plan_stagger_request_id)

    if (requestUpdateError) {
      if (isSchemaIssue(requestUpdateError)) {
        return schemaIssueResponse()
      }
      throw requestUpdateError
    }

    if (decision === "recommend_change" || decision === "rejected") {
      const title = decision === "recommend_change" ? "Stagger Leave Changes Requested" : "Stagger Leave Rejected"
      const message =
        decision === "recommend_change"
          ? `${profile.role === "regional_manager" ? "Regional Manager" : "Department Head"} requested updates to your stagger leave request (${nextStartDate} to ${nextEndDate}). Reason: ${recommendation}`
          : `${profile.role === "regional_manager" ? "Regional Manager" : "Department Head"} rejected your stagger leave request. Reason: ${recommendation}`

      await supabase.from("staff_notifications").insert({
        recipient_id: staggerRequest.user_id,
        type: "leave_plan_stagger_manager_review",
        title,
        message,
        data: {
          leave_plan_stagger_request_id,
          decision,
          adjusted_requested_start_date: decision === "recommend_change" ? nextStartDate : null,
          adjusted_requested_end_date: decision === "recommend_change" ? nextEndDate : null,
          recommendation: recommendation || null,
        },
        is_read: false,
      })
    }

    return NextResponse.json({ success: true, status: nextStatus })
  } catch (error) {
    if (isSchemaIssue(error)) {
      return schemaIssueResponse()
    }
    console.error("[v0] Stagger manager review error:", error)
    return NextResponse.json({ error: "Failed to review stagger leave request." }, { status: 500 })
  }
}
