import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch pending payment advice memos assigned to the currently authenticated HR Executive
 * Only returns memos where hr_executive_signer_id matches the current user
 * Enforces strict access control: non-assigned users cannot see memos not assigned to them
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
    const hrRoles = ["hr_executive", "hr_manager", "hr_director", "hr_officer"]
    if (!hrRoles.includes(userProfile.role)) {
      return NextResponse.json(
        { error: `Access denied. Your role (${userProfile.role}) is not authorized to approve payment memos.` },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") || ""

    // Query pending memos assigned SPECIFICALLY to this HR Executive
    let query = admin
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
        hr_executive_signer_id,
        hr_executive_signer_name,
        hr_executive_signer_position,
        hr_executive_signer_email,
        assigned_for_approval_at,
        status,
        created_at,
        updated_at
      `
      )
      .eq("hr_executive_signer_id", user.id) // Only memos assigned to THIS user
      .eq("status", "ready_for_review") // Only pending memos
      .order("assigned_for_approval_at", { ascending: false })

    // Optional month filter
    if (month) {
      const startOfMonth = `${month}-01`
      const [year, mon] = month.split("-").map(Number)
      const endOfMonth = new Date(year, mon, 0).toISOString().slice(0, 10)
      query = query
        .gte("created_at", startOfMonth)
        .lte("created_at", endOfMonth + "T23:59:59")
    }

    const { data: pendingMemos, error } = await query

    if (error) {
      console.error("[v0] Error fetching assigned pending memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch pending memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: pendingMemos || [],
      count: pendingMemos?.length || 0,
      assignedTo: user.id,
      signerPosition: userProfile.position,
    })
  } catch (err) {
    console.error("[v0] Unexpected error in pending-assigned-memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
