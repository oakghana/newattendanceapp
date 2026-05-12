import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const ARCHIVABLE_STATUSES = [
  "hod_approved",
  "hod_changes_requested",
  "manager_confirmed",
  "hr_office_forwarded",
  "hr_approved",
  "hr_rejected",
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

    const role = ((profile as any)?.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    const allowed = ["admin", "it_admin", "super_admin", "god", "hr_leave_office_admin"].includes(role)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only HR-Leave-Office-Admin staff or admins can bulk-archive leave requests" },
        { status: 403 },
      )
    }

    // Fetch all non-archived leave plan requests in terminal / forwarded statuses
    const { data: archivable, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select("id")
      .in("status", ARCHIVABLE_STATUSES)
      .or("is_archived.is.null,is_archived.eq.false")

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    if (!archivable || archivable.length === 0) {
      return NextResponse.json({ success: true, archived: 0, message: "No archivable leave requests found." })
    }

    const ids = archivable.map((r: any) => r.id)

    const { error: updateError } = await admin
      .from("leave_plan_requests")
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by_id: user.id,
        archive_reason: "Bulk archived",
      })
      .in("id", ids)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    // Log bulk archive in leave_archive_log
    try {
      await admin.from("leave_archive_log").insert(
        ids.map((id: string) => ({
          leave_request_id: id,
          archived_by_id: user.id,
          archive_action: "archived",
          reason: "Bulk archived via Archive All button",
        })),
      )
    } catch {
      // Log failure is non-fatal
    }

    return NextResponse.json({
      success: true,
      archived: ids.length,
      message: `${ids.length} leave request${ids.length !== 1 ? "s" : ""} archived successfully.`,
    })
  } catch (error: any) {
    console.error("[v0] Leave bulk-archive error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 })
  }
}
