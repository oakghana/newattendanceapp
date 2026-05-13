import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { leave_plan_request_id, recall_date, reason } = body

    if (!leave_plan_request_id || !recall_date || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: leave_plan_request_id, recall_date, reason" },
        { status: 400 }
      )
    }

    // Verify user role - only HOD/RM and HR can create recalls
    const { data: roleProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const normalizedRole = String((roleProfile as any)?.role || "").toLowerCase().replace(/[-\s]+/g, "_")
    const isAuthorized = ["department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "admin"].includes(normalizedRole)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Only HOD/RM and HR users can create leave recall requests" },
        { status: 403 }
      )
    }

    // Get the leave request details
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("id, user_id, start_date, end_date, status, employee_id")
      .eq("id", leave_plan_request_id)
      .maybeSingle()

    if (leaveError || !leaveRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      )
    }

    // Check if leave is currently active or upcoming
    const now = new Date()
    const startDate = new Date(leaveRequest.start_date)
    const endDate = new Date(leaveRequest.end_date)

    if (now > endDate) {
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
        reason,
        created_by: user.id,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error("[Leave Recall] Insert error:", insertError)
      return NextResponse.json(
        { error: `Failed to create recall request: ${insertError.message}` },
        { status: 400 }
      )
    }

    // Send notification to the staff member
    try {
      await supabase.from("notifications").insert({
        user_id: leaveRequest.user_id,
        title: "Leave Recall Request",
        description: `Your leave from ${new Date(leaveRequest.start_date).toLocaleDateString()} to ${new Date(leaveRequest.end_date).toLocaleDateString()} has been recalled. Recall date: ${new Date(recall_date).toLocaleDateString()}. Reason: ${reason}`,
        type: "leave_recall",
        reference_id: recallRequest.id,
        is_read: false,
      })
    } catch (notificationError) {
      console.error("[Leave Recall] Notification error:", notificationError)
      // Don't fail the request if notification fails
    }

    return NextResponse.json(
      {
        success: true,
        message: "Leave recall request created successfully",
        recallRequest,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[Leave Recall] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create leave recall request" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get recall requests for the user's leaves
    const { data: recallRequests, error } = await supabase
      .from("leave_recall_requests")
      .select(`
        *,
        leave_plan_requests (
          id,
          user_id,
          start_date,
          end_date,
          status,
          user_profiles ( employee_name, employee_id )
        )
      `)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ recallRequests })
  } catch (error) {
    console.error("[Leave Recall GET] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch recall requests" },
      { status: 500 }
    )
  }
}
