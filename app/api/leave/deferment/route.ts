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
    const { leave_plan_request_id, deferral_year, reason, user_id, requester_id, user_role } = body

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

    // ROLE VALIDATION: Only allow specific roles to initiate deferment
    const ALLOWED_DEFERMENT_ROLES = ['staff', 'hod', 'rm', 'hr_leave_office', 'hr_executive', 'director_hr']
    const normalizedRole = String(user_role || '').toLowerCase().replace(/[-\s]+/g, '_')
    
    if (!ALLOWED_DEFERMENT_ROLES.includes(normalizedRole)) {
      return NextResponse.json(
        { error: `Deferment can only be initiated by Staff, HOD, RM, HR Leave Office, or HR Executive. Your role: ${user_role}` },
        { status: 403 }
      )
    }

    // Verify the original leave request exists and get its details
    const { data: leaveRequest, error: leaveError } = await supabase
      .from("leave_plan_requests")
      .select("*, user_profiles!leave_plan_requests_user_id_fkey(id, first_name, last_name, employee_id, position)")
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

    // Validate that leave has valid dates (not N/A)
    if (!leaveRequest.preferred_start_date || !leaveRequest.preferred_end_date) {
      return NextResponse.json(
        { error: "Cannot defer leave without valid start and end dates" },
        { status: 400 }
      )
    }

    // TWO-YEAR LIMIT VALIDATION: Deferment cannot exceed two calendar years
    const leaveYear = leaveRequest.leave_year_period ? parseInt(String(leaveRequest.leave_year_period).split('/')[0]) : new Date().getFullYear()
    const requestedDefermentYear = parseInt(deferral_year)
    const yearsToDefer = requestedDefermentYear - leaveYear
    
    if (yearsToDefer > 2) {
      return NextResponse.json(
        { 
          error: `Deferment cannot exceed two calendar years. Leave year: ${leaveYear}, Requested deferment year: ${requestedDefermentYear} (${yearsToDefer} years). Maximum allowed: 2 years.`,
          maxAllowedYear: leaveYear + 2
        },
        { status: 400 }
      )
    }

    if (yearsToDefer < 0) {
      return NextResponse.json(
        { error: "Deferment year must be in the future" },
        { status: 400 }
      )
    }

    // Create deferment request with requester info
    const defermentPeriod = `${deferral_year}/${parseInt(deferral_year) + 1}` // Format as "2026/2027"
    
    // Determine initial status based on who is submitting
    // If staff is submitting: goes to HOD/RM for endorsement first
    // If HOD/RM/HR is submitting on behalf: goes directly to HR
    const isStaffSubmitting = requester_id === leaveRequest.user_id
    const initialStatus = isStaffSubmitting ? "pending_hod_endorsement" : "pending_hr_approval"
    
    const { data, error } = await supabase
      .from("leave_deferment_requests")
      .insert({
        leave_plan_request_id,
        requested_deferment_year: parseInt(deferral_year),
        requested_deferment_period: defermentPeriod,
        reason: reason || null,
        user_id: leaveRequest.user_id, // The staff whose leave is being deferred
        created_at: new Date().toISOString(),
        status: initialStatus,
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

export async function PATCH(request: NextRequest) {
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
    const { id, deferral_year, reason, user_id } = body

    if (!id || !user_id) {
      return NextResponse.json(
        { error: "Missing required fields: id, user_id" },
        { status: 400 }
      )
    }

    // Fetch the existing deferment request
    const { data: existing, error: fetchError } = await supabase
      .from("leave_deferment_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Deferment request not found" }, { status: 404 })
    }

    // Check if HR has already processed (not pending)
    const hrProcessedStatuses = ["approved", "rejected", "hr_approved", "hr_rejected"]
    if (hrProcessedStatuses.includes(existing.status)) {
      return NextResponse.json(
        { error: "Cannot edit deferment request after HR has processed it" },
        { status: 403 }
      )
    }

    // Verify the user owns this request
    if (existing.user_id !== user_id) {
      return NextResponse.json(
        { error: "You can only edit your own deferment requests" },
        { status: 403 }
      )
    }

    // Build update object
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (deferral_year && /^\d{4}$/.test(deferral_year)) {
      updateData.requested_deferment_year = parseInt(deferral_year)
      updateData.requested_deferment_period = `${deferral_year}/${parseInt(deferral_year) + 1}`
    }
    if (reason !== undefined) {
      updateData.reason = reason || null
    }

    const { data, error } = await supabase
      .from("leave_deferment_requests")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Deferment update error:", error)
      return NextResponse.json({ error: "Failed to update deferment request" }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, message: "Deferment request updated" })
  } catch (error) {
    console.error("[v0] Deferment PATCH error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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
    const id = searchParams.get("id")
    const userId = searchParams.get("user_id")

    if (!id || !userId) {
      return NextResponse.json({ error: "Missing required: id, user_id" }, { status: 400 })
    }

    // Fetch the existing deferment request
    const { data: existing, error: fetchError } = await supabase
      .from("leave_deferment_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Deferment request not found" }, { status: 404 })
    }

    // Check if HR has already processed (not pending)
    const hrProcessedStatuses = ["approved", "rejected", "hr_approved", "hr_rejected"]
    if (hrProcessedStatuses.includes(existing.status)) {
      return NextResponse.json(
        { error: "Cannot delete deferment request after HR has processed it" },
        { status: 403 }
      )
    }

    // Verify ownership
    if (existing.user_id !== userId) {
      return NextResponse.json(
        { error: "You can only delete your own deferment requests" },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from("leave_deferment_requests")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[v0] Deferment delete error:", error)
      return NextResponse.json({ error: "Failed to delete deferment request" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Deferment request deleted" })
  } catch (error) {
    console.error("[v0] Deferment DELETE error:", error)
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
    const requesterId = searchParams.get("requester_id") // The user who submitted the deferment request
    const leaveRequestId = searchParams.get("leave_plan_request_id")

    if (!userId && !leaveRequestId && !requesterId) {
      return NextResponse.json(
        { error: "Provide user_id, requester_id, or leave_plan_request_id" },
        { status: 400 }
      )
    }

    let query = supabase.from("leave_deferment_requests").select("*")

    if (requesterId) {
      // Fetch deferment requests where this user is the requester
      query = query.eq("user_id", requesterId)
    } else if (userId) {
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
