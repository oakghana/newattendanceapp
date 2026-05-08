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

export async function POST(request: NextRequest) {
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
    const allowed = ["admin", "it_admin", "super_admin", "god", "loan_office"].includes(role)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only Loan Office staff or admins can archive loan requests" },
        { status: 403 },
      )
    }

    // Fetch all archivable loan requests not yet archived
    const { data: archivable, error: fetchError } = await admin
      .from("loan_requests")
      .select("id")
      .in("status", ARCHIVABLE_STATUSES)
      .or("is_archived.is.null,is_archived.eq.false")

    if (fetchError) {
      // Column may not exist yet — surface a clear message
      const msg = fetchError.message || ""
      if (msg.includes("is_archived") || msg.includes("column")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The 'is_archived' column does not exist on loan_requests. Run: ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE, ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS archived_by_id UUID;",
          },
          { status: 400 },
        )
      }
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    if (!archivable || archivable.length === 0) {
      return NextResponse.json({ success: true, archived: 0, message: "No archivable loan requests found." })
    }

    const ids = archivable.map((r: any) => r.id)

    const { error: updateError } = await admin
      .from("loan_requests")
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by_id: user.id,
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
