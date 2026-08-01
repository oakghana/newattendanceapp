import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"

/**
 * Lock a loan/leave request for a specific HOD/reviewer
 * Prevents concurrent work by multiple HODs on same request
 * 
 * Returns lock status:
 * - locked_by_you: true if current user has lock
 * - locked_by_other: {name, id} if another user has lock
 * - locked: false if available to lock
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { requestId, requestType = "loan" } = body

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 })
    }

    // Determine table and reviewer field based on request type
    const table = requestType === "leave" ? "leave_plan_requests" : "loan_requests"
    const reviewerField = requestType === "leave" ? "hod_reviewer_id" : "hod_reviewer_id"

    // Get current lock status
    const { data: currentRequest, error: fetchError } = await admin
      .from(table)
      .select(reviewerField)
      .eq("id", requestId)
      .maybeSingle()

    if (fetchError || !currentRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    const currentReviewerId = currentRequest[reviewerField]

    // Check if already locked by someone else
    if (currentReviewerId && currentReviewerId !== user.id) {
      const { data: lockHolderProfile } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, role")
        .eq("id", currentReviewerId)
        .maybeSingle()

      return NextResponse.json(
        {
          success: false,
          locked: true,
          locked_by_other: {
            id: currentReviewerId,
            name: lockHolderProfile
              ? `${lockHolderProfile.first_name || ""} ${lockHolderProfile.last_name || ""}`.trim() ||
                lockHolderProfile.role
              : "Another user",
          },
          message: `This request is currently being processed by ${lockHolderProfile?.first_name || "another"} ${lockHolderProfile?.last_name || "user"}`,
        },
        { status: 409 },
      )
    }

    // If already locked by current user, return success
    if (currentReviewerId === user.id) {
      return NextResponse.json({
        success: true,
        locked_by_you: true,
        message: "Request is already locked to you",
      })
    }

    // Lock to current user
    const { error: updateError } = await admin
      .from(table)
      .update({
        [reviewerField]: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Log lock action to timeline
    if (requestType === "loan") {
      const { data: loanData } = await admin
        .from("loan_requests")
        .select("request_number")
        .eq("id", requestId)
        .maybeSingle()

      await admin.from("loan_request_timeline").insert({
        loan_request_id: requestId,
        actor_id: user.id,
        actor_role: "hod",
        action_key: "hod_lock",
        from_status: null,
        to_status: null,
        note: `Request locked for processing by HOD`,
        metadata: { lock_action: true },
        created_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      success: true,
      locked_by_you: true,
      message: "Request locked successfully",
    })
  } catch (error: any) {
    console.error("[v0] Lock request error:", error)
    return NextResponse.json({ error: error.message || "Lock failed" }, { status: 500 })
  }
}

/**
 * Release a lock on a request
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get("requestId")
    const requestType = searchParams.get("requestType") || "loan"

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 })
    }

    const table = requestType === "leave" ? "leave_plan_requests" : "loan_requests"
    const reviewerField = requestType === "leave" ? "hod_reviewer_id" : "hod_reviewer_id"

    // Verify user owns this lock
    const { data: currentRequest } = await admin
      .from(table)
      .select(reviewerField)
      .eq("id", requestId)
      .maybeSingle()

    if (!currentRequest || currentRequest[reviewerField] !== user.id) {
      return NextResponse.json({ error: "You do not own this lock" }, { status: 403 })
    }

    // Release lock (set reviewer back to null)
    const { error: updateError } = await admin
      .from(table)
      .update({
        [reviewerField]: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Lock released",
    })
  } catch (error: any) {
    console.error("[v0] Release lock error:", error)
    return NextResponse.json({ error: error.message || "Release failed" }, { status: 500 })
  }
}
