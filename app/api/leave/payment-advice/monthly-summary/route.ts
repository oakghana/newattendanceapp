import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { isUserAdmin } from "@/lib/admin-bypass"

export const dynamic = "force-dynamic"

interface MemoWithStaffInfo {
  id: string
  staff_id: string
  staff_name: string
  staff_number: string
  rank?: string
  department?: string
  location?: string
  memo_subject: string
  leave_period_start: string
  leave_period_end: string
  approved_days: number
  status: string
  created_at: string
  updated_at: string
  hr_leave_office_id: string
  hr_leave_office_name: string
  assigned_signers?: string[]
  signer_id?: string
  signer_name?: string
  signature_data_url?: string
  payment_amount?: number
  payment_currency?: string
  memo_body?: any
}

/**
 * GET: Fetch comprehensive monthly payment advice summary for HR roles
 * Includes staff details (rank, location), assigned signers, and status tracking
 * Available to: HR Leave Office, HR Executive, Accounts, Admins
 * 
 * Query params:
 * - month: YYYY-MM format to filter by month
 * - status: Filter by memo status (draft, ready_for_review, reviewed_by_hr, approved, finalized)
 * - assigned_to: Filter by HR Executive ID (for HR Executives to see memos assigned to them)
 * - department: Filter by department
 * - category: Filter by staff category
 */
export async function GET(request: NextRequest) {
  try {
    const userIsAdmin = await isUserAdmin()
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile to determine role
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("id, full_name, role, department, position")
      .eq("id", user.id)
      .single()

    const userRole = String(userProfile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")

    // Only HR Leave Office, HR Executive, Accounts, and Admins can access this
    const allowedRoles = ["hr_leave_office", "hr_executive", "accounts", "manager", "manager_hr", "director_hr", "director", "admin", "administrator"]
    const hasAccess = allowedRoles.includes(userRole) || userIsAdmin
    
    console.log("[v0] Monthly summary access check:", {
      userId: user.id,
      userRole,
      rawRole: userProfile?.role,
      hasAccess,
      userIsAdmin,
    })
    
    if (!hasAccess) {
      return NextResponse.json(
        { 
          error: "Forbidden - HR Leave Office, HR Executive, or Accounts role required",
          details: `Your role (${userProfile?.role}) does not have access to this view. Allowed roles: ${allowedRoles.join(", ")}`,
        },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") || ""
    const statusFilter = searchParams.get("status") || ""
    const assignedTo = searchParams.get("assigned_to") || ""
    const departmentFilter = searchParams.get("department") || ""
    const categoryFilter = searchParams.get("category") || ""

    // Build base query for leave_payment_memos with all fields
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
        status,
        created_at,
        updated_at,
        hr_leave_office_id,
        hr_leave_office_name,
        assigned_signers,
        signer_id,
        signer_name,
        signature_data_url,
        payment_amount,
        payment_currency,
        staff_category
      `
      )

    // Apply month filter
    if (month) {
      const [year, mon] = month.split("-").map(Number)
      const startOfMonth = new Date(year, mon - 1, 1).toISOString().split("T")[0]
      const endOfMonth = new Date(year, mon, 0).toISOString().split("T")[0]
      query = query.gte("created_at", startOfMonth).lte("created_at", endOfMonth + "T23:59:59")
    }

    // Apply status filter
    if (statusFilter) {
      const statuses = statusFilter.split(",").map(s => s.trim())
      query = query.in("status", statuses)
    }

    // Apply category filter
    if (categoryFilter) {
      const categories = categoryFilter.split(",").map(c => c.trim())
      query = query.in("staff_category", categories)
    }

    // For HR Executives, optionally filter by assigned signers
    if (assignedTo && (userRole === "hr_executive" || userIsAdmin)) {
      // This is tricky with JSONB arrays, so we'll filter in code
    }

    const { data: memos, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching monthly summary:", error)
      return NextResponse.json(
        { error: "Failed to fetch monthly summary", details: error.message },
        { status: 500 }
      )
    }

    // Enrich memos with staff profile information (rank, location, department)
    const enrichedMemos: MemoWithStaffInfo[] = []
    const staffProfileCache: Record<string, any> = {}

    for (const memo of memos || []) {
      // Check if already cached
      if (!staffProfileCache[memo.staff_id]) {
        const { data: staffProfile } = await admin
          .from("user_profiles")
          .select("id, rank, location")
          .eq("id", memo.staff_id)
          .single()

        if (staffProfile) {
          staffProfileCache[memo.staff_id] = staffProfile
        }
      }

      const staffInfo = staffProfileCache[memo.staff_id]

      // Apply assigned_to filter if specified
      if (assignedTo) {
        const assignedSigners = memo.assigned_signers || []
        if (!assignedSigners.includes(assignedTo)) {
          continue
        }
      }

      enrichedMemos.push({
        ...memo,
        rank: staffInfo?.rank || "N/A",
        location: staffInfo?.location || "N/A",
        department: memo.memo_body?.department || "N/A",
      })
    }

    // Calculate summary statistics
    const summary = {
      total: enrichedMemos.length,
      byStatus: {
        draft: enrichedMemos.filter(m => m.status === "draft").length,
        ready_for_review: enrichedMemos.filter(m => m.status === "ready_for_review").length,
        reviewed_by_hr: enrichedMemos.filter(m => m.status === "reviewed_by_hr").length,
        approved: enrichedMemos.filter(m => m.status === "approved").length,
        finalized: enrichedMemos.filter(m => m.status === "finalized").length,
      },
      byCategory: {
        Manager: enrichedMemos.filter(m => m.staff_category === "Manager").length,
        Senior: enrichedMemos.filter(m => m.staff_category === "Senior").length,
        Junior: enrichedMemos.filter(m => m.staff_category === "Junior").length,
      },
      totalApprovedDays: enrichedMemos.reduce((sum, m) => sum + (m.approved_days || 0), 0),
      totalPaymentAmount: enrichedMemos.reduce(
        (sum, m) => sum + (m.payment_amount || 0),
        0
      ),
    }

    // Filter for approved memos for download
    const approvableMemos = enrichedMemos.filter(m =>
      ["reviewed_by_hr", "approved", "finalized"].includes(m.status)
    )

    console.log("[v0] Monthly summary fetched successfully:", {
      userId: user.id,
      userRole,
      month: month || "all",
      totalMemos: enrichedMemos.length,
      approvableMemos: approvableMemos.length,
      summary,
    })

    return NextResponse.json({
      success: true,
      memos: enrichedMemos,
      approvableMemos,
      summary,
      filters: {
        month: month || "all",
        status: statusFilter || "all",
        category: categoryFilter || "all",
        assignedTo: assignedTo || "all",
      },
      userRole,
    })
  } catch (err) {
    console.error("[v0] Unexpected error in monthly-summary:", err)
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    )
  }
}
