import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const runtime = 'nodejs'

/**
 * GET /api/loan/fd-review
 * Fetch FD reviews for Accounts Executive
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role from user_profiles
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isAccountsExecutive = roleNorm === "accounts_executive"
    const isLoanOffice = roleNorm === "loan_office"
    const isAdmin = roleNorm === "admin"

    if (!isAccountsExecutive && !isLoanOffice && !isAdmin) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Get query params
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || "pending_review"
    const limit = parseInt(url.searchParams.get("limit") || "50")

    // Fetch FD reviews
    let query = admin
      .from("loan_fd_review")
      .select(`
        id,
        loan_request_id,
        staff_user_id,
        leave_type,
        leave_start_date,
        leave_end_date,
        submitted_by_user_id,
        fd_value,
        supporting_docs_url,
        submission_date,
        submission_memo,
        reviewed_by_user_id,
        review_status,
        review_decision,
        fd_verification_memo,
        review_date,
        hr_office_notified_date,
        created_at
      `)
      .order("submission_date", { ascending: false })
      .limit(limit)

    if (isAccountsExecutive) {
      // Accounts Executive sees all pending reviews
      query = query.eq("review_status", status)
    } else if (isLoanOffice) {
      // Loan Office sees approved/rejected reviews
      query = query.in("review_status", ["approved", "rejected", "pending_hr_action"])
    }

    const { data: reviews, error: queryError } = await query

    if (queryError) {
      console.error("[v0] Error fetching FD reviews:", queryError)
      return NextResponse.json({ error: "Database query failed" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      reviews: reviews || [],
      count: (reviews || []).length,
    })
  } catch (error) {
    console.error("[v0] FD review GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/loan/fd-review
 * Create new FD review when Loan Office submits FD request
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user is Loan Office
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (roleNorm !== "loan_office" && roleNorm !== "admin") {
      return NextResponse.json({ error: "Only Loan Office can submit FD requests" }, { status: 403 })
    }

    const body = await request.json()
    const {
      loan_request_id,
      staff_user_id,
      leave_type,
      leave_start_date,
      leave_end_date,
      fd_value,
      supporting_docs_url,
      submission_memo,
    } = body

    // Validate input
    if (!loan_request_id || !staff_user_id || !fd_value) {
      return NextResponse.json({
        error: "Missing required fields: loan_request_id, staff_user_id, fd_value",
      }, { status: 400 })
    }

    // Create FD review record
    const { data: newReview, error: insertError } = await admin
      .from("loan_fd_review")
      .insert({
        loan_request_id,
        staff_user_id,
        leave_type,
        leave_start_date,
        leave_end_date,
        submitted_by_user_id: user.id,
        fd_value,
        supporting_docs_url,
        submission_memo,
        review_status: "pending_review",
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Error creating FD review:", insertError)
      return NextResponse.json({ error: "Failed to create FD review" }, { status: 500 })
    }

    // Log audit trail
    await admin
      .from("loan_fd_review_audit")
      .insert({
        fd_review_id: newReview.id,
        action_by_user_id: user.id,
        action_type: "submitted",
        notes: `FD request submitted for staff ${staff_user_id}`,
      })
      .catch(err => console.error("[v0] Audit log error:", err))

    return NextResponse.json({
      success: true,
      review: newReview,
      message: "FD review created and sent to Accounts Executive",
    })
  } catch (error) {
    console.error("[v0] FD review POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/loan/fd-review
 * Update FD review (Accounts Executive approval/rejection)
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user is Accounts Executive
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (roleNorm !== "accounts_executive" && roleNorm !== "admin") {
      return NextResponse.json({ error: "Only Accounts Executive can review FD requests" }, { status: 403 })
    }

    const body = await request.json()
    const {
      review_id,
      review_status, // 'approved' or 'rejected'
      fd_verification_memo,
      review_decision,
    } = body

    if (!review_id || !review_status) {
      return NextResponse.json({
        error: "Missing required fields: review_id, review_status",
      }, { status: 400 })
    }

    // Update FD review
    const { data: updatedReview, error: updateError } = await admin
      .from("loan_fd_review")
      .update({
        review_status,
        reviewed_by_user_id: user.id,
        fd_verification_memo,
        review_decision,
        review_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", review_id)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Error updating FD review:", updateError)
      return NextResponse.json({ error: "Failed to update FD review" }, { status: 500 })
    }

    // Log audit trail
    await admin
      .from("loan_fd_review_audit")
      .insert({
        fd_review_id: review_id,
        action_by_user_id: user.id,
        action_type: review_status === "approved" ? "approved" : "rejected",
        notes: review_decision || `FD ${review_status}`,
      })
      .catch(err => console.error("[v0] Audit log error:", err))

    return NextResponse.json({
      success: true,
      review: updatedReview,
      message: `FD request ${review_status}. HR Leave Office will be notified.`,
    })
  } catch (error) {
    console.error("[v0] FD review PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
