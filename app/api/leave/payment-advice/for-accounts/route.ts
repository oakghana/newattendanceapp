import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { isUserAdmin } from "@/lib/admin-bypass"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch approved & signed leave payment advice memos for Accounts users
 * ADMINS: See ALL approved memos without restriction
 * Used by Accounts role to track and download leave payment vouchers for Accpac
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

    // Fetch user role to verify they're in Accounts or Admin
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const userRole = String(userProfile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    
    // Admins, Accounts, Accounts Executive, and Accounts Loan Office can access this data
    const allowedRoles = new Set([
      "accounts",
      "accounts_executive",
      "accounts_loan_office",
      "admin",
      "super_admin",
    ])
    if (!allowedRoles.has(userRole) && !userIsAdmin) {
      return NextResponse.json(
        { error: "Forbidden - Accounts or Admin role required" },
        { status: 403 }
      )
    }

    // Fetch all approved & signed leave payment memos
    // These are records where HR Executive has reviewed (status = reviewed_by_hr)
    const { data: approvedMemos, error } = await admin
      .from("leave_payment_memos")
      .select(
        `
        id,
        staff_id,
        staff_name,
        staff_number,
        memo_subject,
        leave_period_start,
        leave_period_end,
        approved_days,
        payment_amount,
        payment_currency,
        hr_leave_office_id,
        hr_leave_office_name,
        created_at,
        updated_at,
        status,
        memo_body
      `
      )
      .eq("status", "reviewed_by_hr")
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching approved leave payment memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch approved payment memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: approvedMemos || [],
      count: approvedMemos?.length || 0,
    })
  } catch (err: any) {
    console.error("[v0] Unexpected error in leave-payment API:", err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    )
  }
}
