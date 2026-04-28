import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildHologramCode, isStaffRole, calculateRequestedDays } from "@/lib/leave-planning"

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
      .select("id, role, department_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (!isStaffRole(profile.role)) {
      return NextResponse.json({ error: "Only staff can submit stagger leave requests." }, { status: 403 })
    }

    const body = await request.json()
    const {
      leave_plan_request_id,
      requested_start_date,
      requested_end_date,
      reason,
      user_signature_mode,
      user_signature_text,
      user_signature_image_url,
      user_signature_data_url,
    } = body

    if (!leave_plan_request_id || !requested_start_date || !requested_end_date || !reason) {
      return NextResponse.json(
        { error: "leave_plan_request_id, requested_start_date, requested_end_date, and reason are required." },
        { status: 400 },
      )
    }

    const requestedDays = calculateRequestedDays(requested_start_date, requested_end_date)
    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Invalid stagger leave date range." }, { status: 400 })
    }

    if (!user_signature_text && !user_signature_image_url && !user_signature_data_url) {
      return NextResponse.json({ error: "Staff signature is required for stagger request." }, { status: 400 })
    }

    const { data: plan, error: planError } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, status")
      .eq("id", leave_plan_request_id)
      .eq("user_id", user.id)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: "Approved leave plan not found for this user." }, { status: 404 })
    }

    if (plan.status !== "hr_approved") {
      return NextResponse.json(
        {
          error: "Only HR-approved leave plans can be staggered. Submit original plan through full approvals first.",
        },
        { status: 400 },
      )
    }

    const { data: staggerRequest, error: staggerInsertError } = await supabase
      .from("leave_plan_stagger_requests")
      .insert({
        leave_plan_request_id,
        user_id: user.id,
        requested_start_date,
        requested_end_date,
        reason,
        status: "pending_manager_review",
        user_signature_mode: user_signature_mode || "typed",
        user_signature_text: user_signature_text || null,
        user_signature_image_url: user_signature_image_url || null,
        user_signature_data_url: user_signature_data_url || null,
        user_signature_hologram_code: buildHologramCode("USR"),
      })
      .select("*")
      .single()

    if (staggerInsertError || !staggerRequest) {
      throw staggerInsertError
    }

    const { data: reviewers, error: reviewerError } = await supabase
      .from("user_profiles")
      .select("id, role")
      .in("role", ["regional_manager", "department_head"])
      .eq("is_active", true)

    if (reviewerError) {
      throw reviewerError
    }

    const reviewRows = (reviewers || []).map((r: any) => ({
      leave_plan_stagger_request_id: staggerRequest.id,
      reviewer_id: r.id,
      reviewer_role: r.role,
      decision: "pending",
    }))

    if (reviewRows.length > 0) {
      const { error: reviewError } = await supabase.from("leave_plan_stagger_reviews").insert(reviewRows)
      if (reviewError) {
        throw reviewError
      }
    }

    return NextResponse.json({ success: true, staggerRequest }, { status: 201 })
  } catch (error) {
    console.error("[v0] Stagger leave request error:", error)
    return NextResponse.json({ error: "Failed to submit stagger leave request." }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: rows, error } = await supabase
      .from("leave_plan_stagger_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({ requests: rows || [] })
  } catch (error) {
    console.error("[v0] Stagger leave GET error:", error)
    return NextResponse.json({ error: "Failed to load stagger requests." }, { status: 500 })
  }
}
