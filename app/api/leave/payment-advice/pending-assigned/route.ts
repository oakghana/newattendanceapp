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

    // Query pending memos in "ready_for_review" status where current user is assigned as signer
    // CRITICAL: Only fetch memos with status = "ready_for_review" to ensure approved memos don't re-appear
    // Approved memos have status = "signed_by_hr_executive", "reviewed_by_hr", or higher and should NOT appear here
    // We'll fetch all and filter in code since PostgREST JSONB filtering can be tricky
    // This ensures we reliably check if user.id is in the assigned_signers array
    const { data: allPendingMemos, error } = await admin
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
        assigned_signers,
        created_at,
        updated_at
      `
      )
      .eq("status", "ready_for_review") // CRITICAL: Only ready_for_review, NOT signed_by_hr_executive or reviewed_by_hr
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching pending memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch pending memos", details: error.message },
        { status: 500 }
      )
    }

    // Filter memos to only include those where user is an assigned signer
    const pendingMemos = (allPendingMemos || []).filter((memo: any) => {
      const signers = Array.isArray(memo.assigned_signers) ? memo.assigned_signers : 
                     typeof memo.assigned_signers === 'string' ? [memo.assigned_signers] : []
      
      // Try multiple matching strategies
      const isAssignedByUUID = signers.includes(user.id)
      const isAssignedByEmail = signers.includes(user.email)
      const isAssigned = isAssignedByUUID || isAssignedByEmail
      
      // Enhanced logging for debugging signer visibility issues
      console.log(`[v0] Memo visibility check:`, {
        memoId: memo.id,
        staffName: memo.staff_name,
        storedSigners: signers,
        storedSignersType: typeof memo.assigned_signers,
        currentUserId: user.id,
        currentUserEmail: user.email,
        matchByUUID: isAssignedByUUID,
        matchByEmail: isAssignedByEmail,
        isAssigned: isAssigned,
        signerCount: signers.length,
      })
      
      return isAssigned
    })

    console.log(`[v0] Pending memo filtering complete:`, {
      assignedToUser: pendingMemos?.length || 0,
      totalPending: allPendingMemos?.length || 0,
      userId: user.id,
      userEmail: user.email,
      userRole: userProfile.role,
      debugInfo: {
        message: pendingMemos?.length === 0 && allPendingMemos?.length > 0 ? 
          "Memos exist but none are assigned to this user" : 
          "Either no pending memos exist or user is properly assigned",
        totalMemoCount: allPendingMemos?.length,
        assignedCount: pendingMemos?.length,
      }
    })

    return NextResponse.json({
      success: true,
      memos: pendingMemos || [],
      count: pendingMemos?.length || 0,
      currentUserRole: userProfile.role,
      signerPosition: userProfile.position,
      totalPendingInSystem: allPendingMemos?.length || 0,
      userEmail: user.email,
      userId: user.id,
      debugMessage: pendingMemos?.length === 0 && allPendingMemos?.length > 0 ? 
        `No memos assigned to you, but ${allPendingMemos?.length} pending memos exist in system` : 
        "Loading successful",
    })
  } catch (err) {
    console.error("[v0] Unexpected error fetching pending memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
