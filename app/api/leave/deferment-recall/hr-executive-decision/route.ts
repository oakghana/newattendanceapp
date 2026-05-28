import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// HR Executive roles that can approve deferment/recall requests
const HR_EXECUTIVE_ROLES = ["hr_executive", "hr_director", "hr_head", "admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_leave_office"]

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

    // Verify it's assigned to this HR executive (check hr_office_reviewed_by for deferment, hr_reviewed_by for recall)
    const hrReviewerField = request_type === 'deferment' ? 'hr_office_reviewed_by' : 'hr_reviewed_by'
    if (existingRequest[hrReviewerField] && existingRequest[hrReviewerField] !== hr_executive_id) {
      return NextResponse.json(
        { error: "This request is not assigned to you" },
        { status: 403 }
      )
    }

    // Verify it hasn't already been processed (check the decision field)
    const decisionField = request_type === 'deferment' ? 'hr_office_decision' : 'hr_decision'
    if (existingRequest[decisionField] && existingRequest[decisionField] !== null) {
      return NextResponse.json(
        { error: `This request has already been ${existingRequest[decisionField]}` },
        { status: 400 }
      )
    }

    // Update the request with the decision
    const updateData: Record<string, unknown> = {}
    
    if (request_type === 'deferment') {
      updateData.hr_office_decision = decision
      updateData.hr_office_reviewed_at = new Date().toISOString()
      updateData.hr_office_reviewed_by = hr_executive_id
      updateData.hr_office_decision_note = rejection_reason || null
    } else {
      updateData.hr_decision = decision
      updateData.hr_reviewed_at = new Date().toISOString()
      updateData.hr_reviewed_by = hr_executive_id
      updateData.hr_decision_note = rejection_reason || null
    }
    
    updateData.status = decision
    updateData.updated_at = new Date().toISOString()

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
