import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// HR Executive roles that can approve deferment/recall requests
const HR_EXECUTIVE_ROLES = ["hr_executive", "hr_director", "hr_head", "admin"]

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { 
      request_id, 
      request_type, // 'deferment' or 'recall'
      decision, // 'approved' or 'rejected'
      rejection_reason,
      hr_executive_id,
      hr_executive_role 
    } = body

    // Validate required fields
    if (!request_id || !request_type || !decision || !hr_executive_id) {
      return NextResponse.json(
        { error: "Missing required fields: request_id, request_type, decision, hr_executive_id" },
        { status: 400 }
      )
    }

    // Validate decision
    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json(
        { error: "Decision must be 'approved' or 'rejected'" },
        { status: 400 }
      )
    }

    // Verify user role has access
    const normalizedRole = String(hr_executive_role || "").toLowerCase().replace(/[-\s]+/g, "_")
    if (!HR_EXECUTIVE_ROLES.includes(normalizedRole)) {
      return NextResponse.json(
        { error: "Access denied. Only HR Executives can approve or reject requests." },
        { status: 403 }
      )
    }

    // Determine the correct table
    const tableName = request_type === 'deferment' 
      ? 'leave_deferment_requests' 
      : 'leave_recall_requests'

    // First verify the request exists and is assigned to this HR executive
    const { data: existingRequest, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', request_id)
      .single()

    if (fetchError || !existingRequest) {
      return NextResponse.json(
        { error: `${request_type} request not found` },
        { status: 404 }
      )
    }

    // Verify it's assigned to this HR executive
    if (existingRequest.assigned_hr_executive_id !== hr_executive_id) {
      return NextResponse.json(
        { error: "This request is not assigned to you" },
        { status: 403 }
      )
    }

    // Verify it hasn't already been processed
    if (existingRequest.hr_executive_decision && existingRequest.hr_executive_decision !== 'pending') {
      return NextResponse.json(
        { error: `This request has already been ${existingRequest.hr_executive_decision}` },
        { status: 400 }
      )
    }

    // Update the request with the decision
    const updateData: Record<string, unknown> = {
      hr_executive_decision: decision,
      hr_executive_decision_date: new Date().toISOString(),
      status: decision,
      updated_at: new Date().toISOString()
    }

    if (decision === 'rejected' && rejection_reason) {
      updateData.hr_executive_rejection_reason = rejection_reason
    }

    const { data, error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', request_id)
      .select()
      .single()

    if (error) {
      console.error(`[v0] Error updating ${request_type} request:`, error)
      return NextResponse.json(
        { error: error.message || `Failed to ${decision} ${request_type} request` },
        { status: 500 }
      )
    }

    // Get staff details for notification message
    const staffQuery = request_type === 'deferment'
      ? supabase.from('user_profiles').select('first_name, last_name').eq('id', existingRequest.user_id).single()
      : supabase.from('user_profiles').select('first_name, last_name').eq('id', existingRequest.staff_user_id).single()

    const { data: staffData } = await staffQuery
    const staffName = staffData ? `${staffData.first_name} ${staffData.last_name}` : 'the staff member'

    return NextResponse.json({
      success: true,
      data,
      message: decision === 'approved'
        ? `${request_type === 'deferment' ? 'Deferment' : 'Recall'} request for ${staffName} has been approved`
        : `${request_type === 'deferment' ? 'Deferment' : 'Recall'} request for ${staffName} has been rejected`
    })
  } catch (error) {
    console.error("[v0] HR Executive decision API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
