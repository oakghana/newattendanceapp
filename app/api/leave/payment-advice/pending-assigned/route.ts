import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch pending payment advice memos 
 * Only HR executives can view memos in "ready_for_review" status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify the current user is an HR Executive
    const { data: userProfile, error: profileErr } = await admin
      .from("user_profiles")
      .select("role, position")
      .eq("id", user.id)
      .single()

    if (profileErr || !userProfile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    // Only allow HR executives to see pending memos
    const hrRoles = ["hr_executive", "hr_manager", "hr_director", "hr_officer", "manager_hr", "manager", "deputy_hr"]
    if (!hrRoles.includes(userProfile.role)) {
      return NextResponse.json(
        { error: `Access denied. Your role (${userProfile.role}) is not authorized to approve payment memos.` },
        { status: 403 }
      )
    }

    // Query pending memos in "ready_for_review" status
    const { data: pendingMemos, error } = await admin
      .from("leave_payment_memos")
      .select(
        `
        id,
        staff_id,
        staff_name,
        staff_number,
        memo_subject,
        memo_body,
        leave_period_start,
        leave_period_end,
        approved_days,
        hr_leave_office_id,
        hr_leave_office_name,
        status,
        created_at,
        updated_at
      `
      )
      .eq("status", "ready_for_review")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching pending memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch pending memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: pendingMemos || [],
      count: pendingMemos?.length || 0,
      currentUserRole: userProfile.role,
      signerPosition: userProfile.position,
    })
  } catch (err) {
    console.error("[v0] Unexpected error fetching pending memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
