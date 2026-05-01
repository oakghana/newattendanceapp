import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

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

    const body = await request.json()
    const { leaveRequestId, action, reason } = body

    if (!leaveRequestId || !action) {
      return NextResponse.json(
        { success: false, error: "Missing leaveRequestId or action" },
        { status: 400 }
      )
    }

    if (!["archive", "unarchive"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Use 'archive' or 'unarchive'" },
        { status: 400 }
      )
    }

    // Check if user is HR Leave Office
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const normalizedRole = (profile?.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")

    if (!["hr_leave_office", "admin"].includes(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Only HR Leave Office staff can archive requests" },
        { status: 403 }
      )
    }

    // Archive or unarchive the leave request
    const updateData =
      action === "archive"
        ? {
            is_archived: true,
            archived_at: new Date().toISOString(),
            archived_by_id: user.id,
            archive_reason: reason || null,
          }
        : {
            is_archived: false,
            archived_at: null,
            archived_by_id: null,
            archive_reason: null,
          }

    const { data: leaveRequest, error: updateError } = await admin
      .from("leave_plan_requests")
      .update(updateData)
      .eq("id", leaveRequestId)
      .select()
      .maybeSingle()

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 400 }
      )
    }

    // Log the archive action
    const { error: logError } = await admin.from("leave_archive_log").insert({
      leave_request_id: leaveRequestId,
      archived_by_id: user.id,
      archive_action: action === "archive" ? "archived" : "unarchived",
      reason: reason || null,
    })

    if (logError) {
      console.error("Failed to log archive action:", logError)
    }

    return NextResponse.json({
      success: true,
      message: `Leave request ${action === "archive" ? "archived" : "unarchived"} successfully`,
      leaveRequest,
    })
  } catch (error) {
    console.error("Archive error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
