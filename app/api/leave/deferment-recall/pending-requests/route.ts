import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/leave/deferment-recall/pending-requests
// Get all pending deferment and recall requests for HR Leave Office processing.
// Avoids FK-hint joins that may not exist; instead does a separate batch profile lookup.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Verify the user is hr_leave_office or a related HR role
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

    // Fetch deferment requests WITHOUT the problematic FK join
    const { data: rawDeferments, error: defError } = await admin
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

    // Fetch recall requests WITHOUT the problematic FK join
    const { data: rawRecalls, error: recError } = await admin
      .from("leave_recall_requests")
      .select(
        `
        id,
        staff_user_id,
        recall_reason,
        created_at,
        hod_approval_status,
        assigned_hr_executive_id,
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

    // Collect all unique staff user IDs from both request types
    const allStaffIds = Array.from(
      new Set([
        ...(rawDeferments || []).map((r: any) => r.staff_user_id as string).filter(Boolean),
        ...(rawRecalls || []).map((r: any) => r.staff_user_id as string).filter(Boolean),
      ])
    )

    // Batch fetch user profiles for all staff members
    let profilesMap: Record<string, { id: string; first_name: string; last_name: string; employee_id: string; position: string }> = {}
    if (allStaffIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position")
        .in("id", allStaffIds)

      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = p
        }
      }
    }

    // Merge staff info into deferment requests
    const defermentRequests = (rawDeferments || []).map((r: any) => ({
      ...r,
      staff: profilesMap[r.staff_user_id] ?? null,
    }))

    // Merge staff info into recall requests
    const recallRequests = (rawRecalls || []).map((r: any) => ({
      ...r,
      staff: profilesMap[r.staff_user_id] ?? null,
    }))

    return NextResponse.json({
      defermentRequests,
      recallRequests,
      total: defermentRequests.length + recallRequests.length,
    })
  } catch (error) {
    console.error("[v0] Pending requests error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
