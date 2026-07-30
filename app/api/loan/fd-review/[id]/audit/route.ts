import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const runtime = 'nodejs'

/**
 * GET /api/loan/fd-review/[id]/audit
 * Fetch audit trail for an FD review
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role from user_profiles
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isAccountsExecutive = roleNorm === "accounts_executive"
    const isLoanOffice = roleNorm === "loan_office"
    const isAdmin = roleNorm === "admin"

    if (!isAccountsExecutive && !isLoanOffice && !isAdmin) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Fetch FD review audit logs
    const { data: audit, error: queryError } = await admin
      .from("loan_fd_review_audit")
      .select(`
        id,
        fd_review_id,
        action_by_user_id,
        action_type,
        action_timestamp,
        ip_address,
        user_agent,
        notes
      `)
      .eq("fd_review_id", id)
      .order("action_timestamp", { ascending: true })

    if (queryError) {
      console.error("[v0] Error fetching audit logs:", queryError)
      return NextResponse.json({ error: "Database query failed" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      audit: audit || [],
      count: (audit || []).length,
    })
  } catch (error) {
    console.error("[v0] FD audit GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
