import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch user's deferment requests
    const { data: defermentRequests, error: deferErr } = await supabase
      .from("leave_deferment_requests")
      .select(`
        id,
        leave_plan_request_id,
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
        leave_plan_requests!leave_deferment_requests_leave_plan_request_id_fkey (
          id,
          preferred_start_date,
          preferred_end_date,
          leave_type_key,
          status
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (deferErr) {
      console.error("[v0] Error fetching deferment requests:", deferErr)
    }

    // Fetch user's recall requests (where they are the staff being recalled)
    const { data: recallRequests, error: recallErr } = await supabase
      .from("leave_recall_requests")
      .select(`
        id,
        leave_plan_request_id,
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
        leave_plan_requests!leave_recall_requests_leave_plan_request_id_fkey (
          id,
          preferred_start_date,
          preferred_end_date,
          leave_type_key,
          status
        )
      `)
      .eq("staff_user_id", user.id)
      .order("created_at", { ascending: false })

    if (recallErr) {
      console.error("[v0] Error fetching recall requests:", recallErr)
    }

    // Also fetch requests initiated by this user (if HOD/RM)
    const { data: initiatedRecalls, error: initErr } = await supabase
      .from("leave_recall_requests")
      .select(`
        id,
        leave_plan_request_id,
        staff_user_id,
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
        leave_plan_requests!leave_recall_requests_leave_plan_request_id_fkey (
          id,
          preferred_start_date,
          preferred_end_date,
          leave_type_key,
          status
        )
      `)
      .eq("initiated_by_user_id", user.id)
      .order("created_at", { ascending: false })

    if (initErr) {
      console.error("[v0] Error fetching initiated recalls:", initErr)
    }

    // Fetch initiated deferments by HOD/RM
    const { data: initiatedDeferments, error: initDefErr } = await supabase
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
        leave_plan_requests!leave_deferment_requests_leave_plan_request_id_fkey (
          id,
          preferred_start_date,
          preferred_end_date,
          leave_type_key,
          status
        )
      `)
      .neq("user_id", user.id) // Exclude own requests, get only ones initiated for others
      .order("created_at", { ascending: false })

    return NextResponse.json({
      deferment_requests: defermentRequests || [],
      recall_requests: recallRequests || [],
      initiated_recalls: initiatedRecalls || [],
      initiated_deferments: initiatedDeferments || [],
    })
  } catch (error) {
    console.error("[v0] Error in my-deferment-recall-requests API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
