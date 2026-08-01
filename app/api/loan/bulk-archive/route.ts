import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { normalizeRole } from "@/lib/loan-workflow"

const ARCHIVABLE_STATUSES = [
  "approved_director",
  "director_rejected",
  "rejected_fd",
  "committee_rejected",
  "hod_rejected",
]

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const role = normalizeRole((profile as any)?.role || "")
    const allowed = ["admin", "it_admin", "super_admin", "god", "loan_office", "hr_loan_office", "accounts_loan_office"].includes(role)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only Loan Office staff or admins can archive loan requests" },
        { status: 403 },
      )
    }

    // Fetch all archivable loan requests.
    // We use status-based archiving to avoid hard dependency on optional archive columns.
    const { data: archivable, error: fetchError } = await admin
      .from("loan_requests")
      .select("id")
      .in("status", ARCHIVABLE_STATUSES)

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    if (!archivable || archivable.length === 0) {
      return NextResponse.json({ success: true, archived: 0, message: "No archivable loan requests found." })
    }

    const ids = archivable.map((r: any) => r.id)

    const { error: updateError } = await admin
      .from("loan_requests")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      archived: ids.length,
      message: `${ids.length} loan request${ids.length !== 1 ? "s" : ""} archived successfully.`,
    })
  } catch (error: any) {
    console.error("[v0] Loan bulk-archive error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 })
  }
}
