import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const leaveRequestId = searchParams.get("leave_request_id")

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!leaveRequestId) {
      return NextResponse.json({ error: "leave_request_id is required" }, { status: 400 })
    }

    // Get user profile for role checking
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    const roleNorm = (userProfile?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")

    // Get the leave request
    const { data: leaveRequest } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, memo_body, memo_subject, leave_type_key, preferred_start_date, preferred_end_date, user_profiles!inner(id, first_name, last_name, department_id)")
      .eq("id", leaveRequestId)
      .single()

    if (!leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Check permissions
    const isHr = ["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)
    const isHod = ["hod", "head_of_department", "head_department", "manager", "department_head"].includes(roleNorm)
    const isOwner = leaveRequest.user_id === user.id

    // HOD can download leaves from their department
    const canDownload = isHr || isOwner || 
      (isHod && userProfile?.department_id === leaveRequest.user_profiles?.department_id)

    if (!canDownload) {
      return NextResponse.json({ error: "You don't have permission to download this leave memo" }, { status: 403 })
    }

    // Generate memo content
    const memoContent = `
LEAVE APPROVAL MEMORANDUM

Leave Type: ${leaveRequest.leave_type_key}
Staff Name: ${leaveRequest.user_profiles?.first_name} ${leaveRequest.user_profiles?.last_name}
Leave Period: ${leaveRequest.preferred_start_date} to ${leaveRequest.preferred_end_date}

Subject: ${leaveRequest.memo_subject || "Leave Approval"}

${leaveRequest.memo_body || "Your leave request has been approved by HR."}

---
This is an electronically generated document.
Generated on: ${new Date().toLocaleString()}
`.trim()

    // Return as downloadable text file
    return new NextResponse(memoContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="leave-approval-${leaveRequest.leave_type_key}-${new Date().getTime()}.txt"`,
      },
    })
  } catch (error) {
    console.error("[v0] Failed to download leave memo:", error)
    return NextResponse.json({ error: "Failed to download memo" }, { status: 500 })
  }
}
