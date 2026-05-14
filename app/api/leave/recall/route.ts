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
    const { leave_plan_request_id, recall_date, reason, user_id, user_role } = body

    // Comprehensive validation
    if (!leave_plan_request_id || !recall_date || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields: leave_plan_request_id, recall_date, user_id" },
        { status: 400 }
      )
    }

    // Validate recall_date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recall_date)) {
      return NextResponse.json(
        { error: "Invalid recall_date format. Use YYYY-MM-DD" },
        { status: 400 }
      )
    }

    // Verify user role - only HOD/RM and HR can create recalls
    const normalizedRole = String(user_role || "").toLowerCase().replace(/[-\s]+/g, "_")
    const isAuthorized = [
      "department_head",
      "regional_manager",
      "hr_officer",
      "manager_hr",
      "director_hr",
      "hr_director",
      "admin",
    ].includes(normalizedRole)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Only HOD/RM and HR users can create leave recall requests" },
        { status: 403 }
      )
    }

    // Get the leave request details
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, start_date, end_date, status, employee_id, user_name")
      .eq("id", leave_plan_request_id)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Check if leave is currently active or upcoming
    const now = new Date()
    const recallDateObj = new Date(recall_date)
    const endDateObj = new Date(leaveRequest.end_date)

    if (recallDateObj >= endDateObj) {
      return NextResponse.json(
        { error: "Recall date must be before the leave end date" },
        { status: 400 }
      )
    }

    if (now > endDateObj) {
      return NextResponse.json(
        { error: "Cannot recall leave that has already ended" },
        { status: 400 }
      )
    }

    // Create the recall request
    const { data: recallRequest, error: insertError } = await supabase
      .from("leave_recall_requests")
      .insert({
        leave_plan_request_id,
        recall_date,
        reason: reason || null,
        created_by: user_id,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Recall insert error:", insertError)
      return NextResponse.json({ error: "Failed to create recall request" }, { status: 500 })
    }

    return NextResponse.json(
      {
        success: true,
        data: recallRequest,
        message: "Recall request submitted successfully",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[v0] Recall API error:", error)
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

    let query = supabase.from("leave_recall_requests").select("*")

    if (userId) {
      query = query.eq("created_by", userId)
    }
    if (leaveRequestId) {
      query = query.eq("leave_plan_request_id", leaveRequestId)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Recall fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch recall requests" }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Recall GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
