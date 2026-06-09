import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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
    const { id, decision, decision_note, hod_reviewed_by } = body

    if (!id || !decision) {
      return NextResponse.json(
        { error: "Missing required fields: id, decision" },
        { status: 400 }
      )
    }

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json(
        { error: "Decision must be 'approved' or 'rejected'" },
        { status: 400 }
      )
    }

    // Fetch the deferment request
    const { data: defermentRequest, error: fetchError } = await supabase
      .from("leave_deferment_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !defermentRequest) {
      return NextResponse.json(
        { error: "Deferment request not found" },
        { status: 404 }
      )
    }

    // Check if it's in pending HOD endorsement status
    if (defermentRequest.status !== "pending_hod_endorsement") {
      return NextResponse.json(
        { error: `Cannot endorse deferment with status: ${defermentRequest.status}` },
        { status: 403 }
      )
    }

    // Update the deferment request with HOD decision
    const newStatus = decision === "approved" 
      ? "pending_hr_approval"  // Move to HR if HOD approves
      : "hod_rejected"          // Mark as rejected if HOD rejects

    const { data, error } = await supabase
      .from("leave_deferment_requests")
      .update({
        hod_decision: decision,
        hod_decision_note: decision_note || null,
        hod_reviewed_by: hod_reviewed_by || null,
        hod_reviewed_at: new Date().toISOString(),
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] HOD endorsement error:", error)
      return NextResponse.json(
        { error: "Failed to process HOD endorsement" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: `Deferment request ${decision === "approved" ? "endorsed" : "rejected"} by HOD/RM`,
    })
  } catch (error) {
    console.error("[v0] HOD endorsement API error:", error)
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
    const status = searchParams.get("status")
    const hodId = searchParams.get("hod_id")

    // HOD/RM can view deferment requests pending their endorsement
    if (hodId) {
      // Get all staff under this HOD/RM (from loan_hod_linkages or similar)
      // Then get their deferment requests pending endorsement
      
      const { data, error } = await supabase
        .from("leave_deferment_requests")
        .select(`
          *,
          leave_plan_requests(
            id,
            user_id,
            preferred_start_date,
            preferred_end_date,
            leave_type_key,
            reason,
            status,
            created_at
          ),
          user_profiles(
            id,
            first_name,
            last_name,
            employee_id,
            position,
            department_id,
            departments(name)
          )
        `)
        .eq("status", "pending_hod_endorsement")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching HOD pending requests:", error)
        return NextResponse.json(
          { error: "Failed to fetch deferment requests" },
          { status: 500 }
        )
      }

      return NextResponse.json({ data: data || [] })
    }

    // Fallback: fetch by status if no hodId
    if (status) {
      const { data, error } = await supabase
        .from("leave_deferment_requests")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching deferment requests:", error)
        return NextResponse.json(
          { error: "Failed to fetch deferment requests" },
          { status: 500 }
        )
      }

      return NextResponse.json({ data: data || [] })
    }

    return NextResponse.json({
      error: "Provide hod_id or status parameter",
      status: 400,
    })
  } catch (error) {
    console.error("[v0] HOD deferment GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
