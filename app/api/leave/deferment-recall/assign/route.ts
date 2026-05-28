import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// HR Leave Office roles that can assign requests to HR executives
const HR_LEAVE_OFFICE_ROLES = ["hr_leave_office", "hr_officer", "hr_office", "admin"]

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
      hr_executive_id, 
      assigned_by_user_id,
      assigned_by_role 
    } = body

    // Validate required fields
    if (!request_id || !request_type || !hr_executive_id || !assigned_by_user_id) {
      return NextResponse.json(
        { error: "Missing required fields: request_id, request_type, hr_executive_id, assigned_by_user_id" },
        { status: 400 }
      )
    }

    // Verify assigning user has permission (HR Leave Office)
    const normalizedRole = String(assigned_by_role || "").toLowerCase().replace(/[-\s]+/g, "_")
    if (!HR_LEAVE_OFFICE_ROLES.includes(normalizedRole)) {
      return NextResponse.json(
        { error: "Only HR Leave Office staff can assign requests to HR executives" },
        { status: 403 }
      )
    }

    // Verify the HR executive exists and has the right role
    const { data: executive, error: execError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, role")
      .eq("id", hr_executive_id)
      .single()

    if (execError || !executive) {
      return NextResponse.json(
        { error: "HR Executive not found" },
        { status: 404 }
      )
    }

    // Update the appropriate table based on request type
    const tableName = request_type === 'deferment' 
      ? 'leave_deferment_requests' 
      : 'leave_recall_requests'

    // Use existing schema fields instead of non-existent assigned_hr_executive_id
    const updatePayload = request_type === 'deferment' ? {
      hr_office_reviewed_by: hr_executive_id,
      status: 'pending_hr_office_review',
      updated_at: new Date().toISOString()
    } : {
      hr_reviewed_by: hr_executive_id,
      status: 'pending_hr_review',
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq('id', request_id)
      .select()
      .single()

    if (error) {
      console.error(`[v0] Error assigning ${request_type} request:`, error)
      return NextResponse.json(
        { error: error.message || `Failed to assign ${request_type} request` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: `Request assigned to ${executive.first_name} ${executive.last_name} for approval`,
      assigned_to: {
        id: executive.id,
        name: `${executive.first_name} ${executive.last_name}`,
        role: executive.role
      }
    })
  } catch (error) {
    console.error("[v0] Assignment API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
