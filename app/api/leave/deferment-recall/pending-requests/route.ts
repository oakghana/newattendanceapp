import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/leave/deferment-recall/pending-requests
// Get all pending deferment and recall requests for HR Leave Office processing
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Verify the user is hr_leave_office
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isHrOffice = ["hr_leave_office", "hr_office", "admin", "director_hr", "manager_hr"].includes(roleNorm)

    if (!isHrOffice) {
      return NextResponse.json({ error: "Forbidden - only HR Leave Office can view pending requests" }, { status: 403 })
    }

    // Get pending deferment requests (not yet assigned to HR executive)
    const { data: defermentRequests, error: defError } = await admin
      .from("leave_deferment_requests")
      .select(
        `
        id,
        staff_user_id,
        request_reason,
        deferment_to_year,
        created_at,
        hod_approval_status,
        assigned_hr_executive_id,
        staff:user_profiles!fk_user (
          id,
          first_name,
          last_name,
          employee_id,
          position
        ),
        department:departments (
          id,
          name
        ),
        leave:leave_balances (
          id,
          leave_type,
          balance_period_start,
          balance_period_end
        )
        `
      )
      .eq("hod_approval_status", "approved")
      .is("assigned_hr_executive_id", null)
      .order("created_at", { ascending: false })

    if (defError) {
      console.error("[v0] Error fetching deferment requests:", defError)
      throw defError
    }

    // Get pending recall requests (not yet assigned to HR executive)
    const { data: recallRequests, error: recError } = await admin
      .from("leave_recall_requests")
      .select(
        `
        id,
        staff_user_id,
        recall_reason,
        created_at,
        hod_approval_status,
        assigned_hr_executive_id,
        staff:user_profiles!fk_user (
          id,
          first_name,
          last_name,
          employee_id,
          position
        ),
        department:departments (
          id,
          name
        ),
        leave:leave_balances (
          id,
          leave_type,
          balance_period_start,
          balance_period_end
        )
        `
      )
      .eq("hod_approval_status", "approved")
      .is("assigned_hr_executive_id", null)
      .order("created_at", { ascending: false })

    if (recError) {
      console.error("[v0] Error fetching recall requests:", recError)
      throw recError
    }

    return NextResponse.json({
      defermentRequests: defermentRequests || [],
      recallRequests: recallRequests || [],
      total: (defermentRequests?.length || 0) + (recallRequests?.length || 0),
    })
  } catch (error) {
    console.error("[v0] Pending requests error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
