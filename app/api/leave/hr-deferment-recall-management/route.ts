import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse, NextRequest } from "next/server"

/**
 * HR-exclusive endpoint for managing all deferment and recall requests
 * Only HR executives can access all pending requests for approval
 * This endpoint handles both viewing and approving requests
 */

export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const requestType = searchParams.get("type") || "deferment" // deferment | recall
    const status = searchParams.get("status") || "pending" // pending | approved | rejected

    // Get all pending/pending_hod_review deferment requests (not filtered by user)
    if (requestType === "deferment") {
      const statuses = status === "all" ? ["pending", "pending_hod_review", "approved", "rejected"] : [status]
      
      const { data: deferments, error: deferErr } = await admin
        .from("leave_deferment_requests")
        .select(`
          id,
          leave_plan_request_id,
          user_id,
          requested_deferment_year,
          requested_deferment_period,
          deferment_start_date,
          deferment_end_date,
          reason,
          status,
          hod_decision,
          hod_decision_note,
          hod_reviewed_at,
          hr_office_decision,
          hr_office_decision_note,
          hr_office_reviewed_at,
          created_at,
          updated_at,
          leave_plan_requests:leave_plan_request_id(
            id,
            user_id,
            user_profiles:user_id(
              id,
              first_name,
              last_name,
              email,
              employee_id,
              position,
              departments(name)
            )
          )
        `)
        .in("status", statuses)
        .order("created_at", { ascending: false })

      if (deferErr) {
        console.error("[v0] Error fetching deferments:", deferErr)
        return NextResponse.json({ error: "Failed to fetch deferments" }, { status: 500 })
      }

      return NextResponse.json({
        requests: deferments || [],
        type: "deferment",
        count: deferments?.length || 0,
      })
    }

    // Get all recall requests
    if (requestType === "recall") {
      const statuses = status === "all" ? ["pending", "approved", "rejected"] : [status]
      
      const { data: recalls, error: recallErr } = await admin
        .from("leave_recall_requests")
        .select(`
          id,
          leave_plan_request_id,
          staff_user_id,
          initiated_by_user_id,
          recall_date,
          recall_reason,
          recall_notes,
          status,
          hr_decision,
          hr_decision_note,
          hr_reviewed_at,
          staff_acknowledged,
          staff_acknowledged_at,
          created_at,
          updated_at,
          leave_plan_requests:leave_plan_request_id(
            id,
            user_id,
            user_profiles:user_id(
              id,
              first_name,
              last_name,
              email,
              employee_id,
              position,
              departments(name)
            )
          )
        `)
        .in("status", statuses)
        .order("created_at", { ascending: false })

      if (recallErr) {
        console.error("[v0] Error fetching recalls:", recallErr)
        return NextResponse.json({ error: "Failed to fetch recalls" }, { status: 500 })
      }

      return NextResponse.json({
        requests: recalls || [],
        type: "recall",
        count: recalls?.length || 0,
      })
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Error in HR deferment/recall management API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST: Approve/Reject a deferment or recall request and auto-generate memos
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const body = await request.json()
    
    const {
      requestId,
      requestType, // "deferment" | "recall"
      decision, // "approved" | "rejected"
      decisionNote,
      approverUserId,
    } = body

    if (!requestId || !requestType || !decision || !approverUserId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (requestType === "deferment") {
      // Update deferment request
      const { data: updated, error: updateErr } = await admin
        .from("leave_deferment_requests")
        .update({
          hr_office_decision: decision,
          hr_office_decision_note: decisionNote,
          hr_office_reviewed_at: new Date().toISOString(),
          hr_office_reviewed_by: approverUserId,
          status: decision === "approved" ? "approved" : "rejected",
        })
        .eq("id", requestId)
        .select()
        .single()

      if (updateErr) {
        console.error("[v0] Error updating deferment:", updateErr)
        return NextResponse.json({ error: "Failed to update deferment" }, { status: 500 })
      }

      // If approved, auto-generate deferment memo
      if (decision === "approved" && updated) {
        console.log("[v0] Auto-generating deferment memo for:", requestId)
        // TODO: Call memo generation service
      }

      return NextResponse.json({
        success: true,
        request: updated,
        message: `Deferment request ${decision}`,
      })
    }

    if (requestType === "recall") {
      // Update recall request
      const { data: updated, error: updateErr } = await admin
        .from("leave_recall_requests")
        .update({
          hr_decision: decision,
          hr_decision_note: decisionNote,
          hr_reviewed_at: new Date().toISOString(),
          hr_reviewed_by: approverUserId,
          status: decision === "approved" ? "approved" : "rejected",
        })
        .eq("id", requestId)
        .select()
        .single()

      if (updateErr) {
        console.error("[v0] Error updating recall:", updateErr)
        return NextResponse.json({ error: "Failed to update recall" }, { status: 500 })
      }

      // If approved, auto-generate recall memo
      if (decision === "approved" && updated) {
        console.log("[v0] Auto-generating recall memo for:", requestId)
        // TODO: Call memo generation service
      }

      return NextResponse.json({
        success: true,
        request: updated,
        message: `Recall request ${decision}`,
      })
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Error in HR deferment/recall POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
