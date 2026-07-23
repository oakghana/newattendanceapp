import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { isHrPlanningRole } from "@/lib/leave-planning"

/**
 * GET /api/leave/hod-review
 * 
 * For HR executives (manager_hr, director_hr, regional_manager, department_head) to view
 * all leave requests from their linked staff members that are pending HOD review.
 * 
 * Returns all requests grouped by staff member, with approval buttons for each HOD reviewer.
 * When one HOD approves, others see "approved by [HOD name]" status.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Get all staff members linked to this HR executive
    const { data: linkedStaff, error: linkError } = await admin
      .from("loan_hod_linkages")
      .select("staff_user_id")
      .eq("hod_user_id", user.id || "")

    if (linkError) {
      console.error("Error fetching HOD linkages:", linkError)
      return NextResponse.json({ error: "Failed to fetch staff linkages" }, { status: 500 })
    }

    if (!linkedStaff || linkedStaff.length === 0) {
      return NextResponse.json({
        mode: "hod_review",
        requests: [],
        message: "No staff linked to your HOD profile"
      })
    }

    const staffIds = linkedStaff.map((l: any) => l.staff_user_id).filter(Boolean)

    // Fetch all pending HOD review requests from linked staff
    const { data: requests, error: reqError } = await admin
      .from("leave_plan_requests")
      .select("*, user:user_profiles!user_id(*)")
      .in("user_id", staffIds)
      .eq("status", "pending_hod_review")
      .order("created_at", { ascending: false })

    if (reqError) {
      console.error("Error fetching requests:", reqError)
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 })
    }

    // For each request, fetch all HOD reviewers and their approval status
    const requestIds = (requests || []).map((r: any) => r.id).filter(Boolean)
    let reviewsByRequestId: Map<string, any[]> = new Map()

    if (requestIds.length > 0) {
      const { data: reviews, error: reviewError } = await admin
        .from("leave_plan_reviews")
        .select("leave_plan_request_id, reviewer_id, decision, reviewed_at")
        .in("leave_plan_request_id", requestIds)

      if (!reviewError && reviews) {
        // Get all reviewer profiles
        const reviewerIds = [...new Set(reviews.map((r: any) => r.reviewer_id).filter(Boolean))]
        const { data: reviewers } = await admin
          .from("user_profiles")
          .select("id, first_name, last_name, role")
          .in("id", reviewerIds)

        const reviewerMap = new Map(
          (reviewers || []).map((p: any) => [p.id, p])
        )

        // Group reviews by request ID
        for (const review of reviews) {
          if (!reviewsByRequestId.has(review.leave_plan_request_id)) {
            reviewsByRequestId.set(review.leave_plan_request_id, [])
          }
          const reviewer = reviewerMap.get(review.reviewer_id)
          reviewsByRequestId.get(review.leave_plan_request_id)!.push({
            reviewer_id: review.reviewer_id,
            reviewer_name: reviewer ? `${reviewer.first_name} ${reviewer.last_name}`.trim() : "Unknown",
            decision: review.decision,
            reviewed_at: review.reviewed_at,
            is_current_user: review.reviewer_id === user.id
          })
        }
      }
    }

    // Enrich each request with its reviewers and approval status
    const enrichedRequests = (requests || []).map((r: any) => {
      const reviewers = reviewsByRequestId.get(r.id) || []
      const currentUserReview = reviewers.find((rev: any) => rev.is_current_user)
      const otherApprovals = reviewers.filter((rev: any) => !rev.is_current_user && rev.decision === "approved")
      
      return {
        ...r,
        reviewers,
        current_user_decision: currentUserReview?.decision || "pending",
        other_hod_approvals: otherApprovals,
        hod_review_status: 
          otherApprovals.length > 0 ? `Approved by ${otherApprovals.map(o => o.reviewer_name).join(", ")}` : "Pending",
      }
    })

    return NextResponse.json({
      mode: "hod_review",
      requests: enrichedRequests,
      total: enrichedRequests.length
    })
  } catch (error) {
    console.error("[HOD Review API] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/leave/hod-review
 * 
 * Submit an approval, rejection, or request for changes on a leave request.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { request_id, decision, recommendation } = await request.json()

    if (!request_id || !decision || !["approved", "rejected", "changes_requested"].includes(decision)) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      { auth: { persistSession: false } }
    )

    // Verify the user is a reviewer for this request
    const { data: reviewRow, error: reviewError } = await admin
      .from("leave_plan_reviews")
      .select("id")
      .eq("leave_plan_request_id", request_id)
      .eq("reviewer_id", session.user.id)
      .single()

    if (reviewError || !reviewRow) {
      return NextResponse.json({ error: "You are not assigned as a reviewer for this request" }, { status: 403 })
    }

    // Update the review decision
    const { data: updated, error: updateError } = await admin
      .from("leave_plan_reviews")
      .update({
        decision,
        recommendation: recommendation || null,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", reviewRow.id)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating review:", updateError)
      return NextResponse.json({ error: "Failed to update review" }, { status: 500 })
    }

    // If ALL HODs have approved, update the request status to "hod_approved"
    if (decision === "approved") {
      const { data: allReviews } = await admin
        .from("leave_plan_reviews")
        .select("decision")
        .eq("leave_plan_request_id", request_id)

      const allApproved = allReviews?.every((r: any) => r.decision === "approved")
      
      if (allApproved) {
        await admin
          .from("leave_plan_requests")
          .update({ status: "hod_approved" })
          .eq("id", request_id)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Review submitted successfully",
      decision,
      updated_at: updated?.reviewed_at
    })
  } catch (error) {
    console.error("[HOD Review API POST] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
