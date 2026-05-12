import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    // Initialize Supabase client at runtime
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase credentials not configured" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

    // Get all non-annual leave requests stuck in HOD review for 2+ days
    const { data: hodPendingRequests, error: hodError } = await supabase
      .from("leave_plan_request_hod_review")
      .select("*")
      .eq("status", "pending_hod")
      .neq("leave_type_key", "annual")
      .lt("created_at", twoDaysAgo)

    if (hodError) throw hodError

    // Auto-advance to HR Leave Office
    for (const request of hodPendingRequests || []) {
      const { error: updateError } = await supabase
        .from("leave_plan_request_hod_review")
        .update({
          status: "pending_hr_office",
          hod_reviewed_at: new Date().toISOString(),
          hod_decision: "auto_approved_after_2_days",
          hod_notes: "Auto-advanced after 2 days (non-annual leave)",
        })
        .eq("id", request.id)

      if (updateError) {
        console.error(`[v0] Failed to auto-advance request ${request.id}:`, updateError)
      } else {
        console.log(`[v0] Auto-advanced leave request ${request.id} to HR Leave Office`)
      }

      // Log to audit trail
      await supabase.from("leave_deferment_recall_audit_log").insert({
        action: "auto_advance_to_hr",
        entity_type: "leave_request",
        entity_id: request.id,
        details: {
          leave_type: request.leave_type_key,
          reason: "Auto-advanced after 2 days (non-annual)",
          previous_status: "pending_hod",
          new_status: "pending_hr_office",
        },
      })
    }

    return NextResponse.json({
      success: true,
      advancedCount: hodPendingRequests?.length || 0,
      message: `Auto-advanced ${hodPendingRequests?.length || 0} non-annual leave requests to HR Leave Office`,
    })
  } catch (error: any) {
    console.error("[v0] Auto-advance error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
