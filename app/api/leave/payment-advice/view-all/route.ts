import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch all payment advice memos with full details for HR viewing
 * HR staff can view all memos with their full details including signer information
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

    // Verify the current user is HR staff
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

    // Only allow HR staff to view all memos
    const roleNorm = String(userProfile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const hrRoles = [
      "hr_executive",
      "director_hr",
      "director_human_resources",
      "hr_manager",
      "hr_director",
      "hr_officer",
      "manager_hr",
      "deputy_hr",
      "deputy_director_hr",
      "human_resource_manager",
      "hr_leave_office",
      "leave_office",
      "admin",
    ]
    if (!hrRoles.includes(roleNorm)) {
      return NextResponse.json(
        { error: `Access denied. Your role (${userProfile.role}) is not authorized to view payment memos.` },
        { status: 403 }
      )
    }

    // Get query parameters
    const url = new URL(request.url)
    const statusFilter = url.searchParams.get("status") || null
    const monthFilter = url.searchParams.get("month") || null

    // Build query
    let query = admin
      .from("leave_payment_memos")
      .select(
        `
        id,
        staff_id,
        staff_name,
        staff_number,
        staff_category,
        memo_subject,
        leave_period_start,
        leave_period_end,
        approved_days,
        payment_amount,
        payment_currency,
        status,
        signer_name,
        signer_id,
        signature_data_url,
        assigned_signers,
        hr_leave_office_name,
        created_at,
        updated_at,
        forwarded_at,
        acknowledged_at
      `
      )
      .order("created_at", { ascending: false })

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq("status", statusFilter)
    }

    // Apply month filter if provided
    if (monthFilter) {
      const startDate = `${monthFilter}-01`
      // Calculate last day of month
      const [year, month] = monthFilter.split("-").map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${monthFilter}-${String(lastDay).padStart(2, "0")}`

      query = query
        .gte("created_at", `${startDate}T00:00:00Z`)
        .lte("created_at", `${endDate}T23:59:59Z`)
    }

    const { data: memos, error } = await query

    if (error) {
      console.error("[v0] Error fetching all payment memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch memos", details: error.message },
        { status: 500 }
      )
    }

    // Calculate summary statistics
    const summary = {
      total: memos?.length || 0,
      byStatus: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      totalPaymentAmount: 0,
      bySigner: {} as Record<string, number>,
    }

    if (memos && memos.length > 0) {
      for (const memo of memos) {
        // Count by status
        summary.byStatus[memo.status] = (summary.byStatus[memo.status] || 0) + 1

        // Count by category
        const category = memo.staff_category || "Unknown"
        summary.byCategory[category] = (summary.byCategory[category] || 0) + 1

        // Sum payment amounts
        if (memo.payment_amount) {
          summary.totalPaymentAmount += memo.payment_amount
        }

        // Count by signer
        if (memo.signer_name) {
          summary.bySigner[memo.signer_name] = (summary.bySigner[memo.signer_name] || 0) + 1
        }
      }
    }

    console.log("[v0] View all memos fetched:", {
      count: memos?.length || 0,
      status: statusFilter,
      month: monthFilter,
      userRole: userProfile.role,
    })

    return NextResponse.json({
      success: true,
      memos: memos || [],
      summary,
      count: memos?.length || 0,
      filters: {
        status: statusFilter,
        month: monthFilter,
      },
    })
  } catch (err) {
    console.error("[v0] Unexpected error fetching all memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
