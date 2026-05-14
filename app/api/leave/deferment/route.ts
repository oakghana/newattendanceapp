import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error: missing Supabase credentials" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { leave_plan_request_id, deferral_year, reason, user_id, user_role } = body

    // Validate required fields
    if (!leave_plan_request_id || !deferral_year || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields: leave_plan_request_id, deferral_year, user_id" },
        { status: 400 }
      )
    }

    // Validate deferral year format (YYYY)
    if (!/^\d{4}$/.test(deferral_year)) {
      return NextResponse.json(
        { error: "Invalid deferral_year format. Use YYYY" },
        { status: 400 }
      )
    }

    // Verify the original leave request exists
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("*")
      .eq("id", leave_plan_request_id)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      )
    }

    // Verify status is approved
    if (!["approved", "hr_approved"].includes(String(leaveRequest.status || "").toLowerCase())) {
      return NextResponse.json(
        { error: "Only approved leave can be deferred" },
        { status: 400 }
      )
    }

    // Create deferment request
    const { data, error } = await supabase
      .from("leave_deferment_requests")
      .insert({
        leave_plan_request_id,
        requested_deferment_year: parseInt(deferral_year),
        reason: reason || null,
        user_id: user_id,
        created_at: new Date().toISOString(),
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Deferment creation error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      return NextResponse.json(
        { error: error.message || "Failed to create deferment request", details: error.details },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: "Deferment request submitted successfully",
    })
  } catch (error) {
    console.error("[v0] Deferment API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error: missing Supabase credentials" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    const leaveRequestId = searchParams.get("leave_plan_request_id")

    if (!userId && !leaveRequestId) {
      return NextResponse.json(
        { error: "Provide either user_id or leave_plan_request_id" },
        { status: 400 }
      )
    }

    let query = supabase.from("leave_deferment_requests").select("*")

    if (userId) {
      query = query.eq("created_by", userId)
    }
    if (leaveRequestId) {
      query = query.eq("leave_plan_request_id", leaveRequestId)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Deferment fetch error:", error)
      return NextResponse.json(
        { error: "Failed to fetch deferment requests" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Deferment GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
