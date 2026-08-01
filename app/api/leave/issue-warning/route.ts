import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const body = await request.json()
    const { staff_id, staff_name, warning_type } = body

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is HR/Leave Office
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (!["admin", "hr", "hr_office", "hr_officer", "hr_leave_office", "manager_hr", "director_hr"].includes(userRole)) {
      return NextResponse.json({ error: "Only HR staff can issue warnings" }, { status: 403 })
    }

    const issuedBy = [String(profile?.first_name || "").trim(), String(profile?.last_name || "").trim()]
      .filter(Boolean)
      .join(" ") || "HR Office"

    // Determine warning details based on type
    const warningDetails = {
      non_resumption: "Staff has not resumed work on scheduled return date. Formal warning issued. Please explain the reason for non-resumption and submit a deferment request if necessary.",
      late_return: "Staff returned late from approved leave. Please provide explanation and ensure timely resumption in future.",
      extension_required: "Leave extension query: You are approaching your resumption date. If additional leave is required, please submit a deferment request immediately.",
      return_warning: "Final reminder: You are expected to return to work as scheduled. Any changes or extensions must be formally requested.",
    }

    const details = warningDetails[warning_type as keyof typeof warningDetails] || "Warning issued regarding leave resumption."

    // Create warning record
    const { data: warning, error } = await admin
      .from("staff_warnings")
      .insert({
        staff_id,
        staff_name,
        issued_by: user.id,
        issued_by_name: issuedBy,
        warning_type,
        details,
        status: "pending",
        date_issued: new Date().toISOString(),
      })
      .select()

    if (error) throw error

    // Create notification for staff
    const { error: staffNotifError } = await admin
      .from("staff_notifications")
      .insert({
        recipient_id: staff_id,
        type: "leave_resumption_warning",
        title: "⚠️ Leave Resumption Warning",
        message: details,
        data: {
          warning_id: warning?.[0]?.id,
          warning_type,
          issued_by: issuedBy,
          action_required: true,
        },
        is_read: false,
      })
    if (staffNotifError) console.error("[v0] Staff notification creation failed:", staffNotifError) // Ignore if fails

    // Create HR office notification
    const { data: hrStaff } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", ["hr_leave_office", "director_hr", "manager_hr"])
      .limit(5)

    if (hrStaff && hrStaff.length > 0) {
      const hrNotifications = hrStaff.map(hr => ({
        recipient_id: hr.id,
        type: "hr_warning_issued",
        title: `Warning Issued: ${staff_name}`,
        message: `${issuedBy} issued a ${warning_type.replace("_", " ")} warning to ${staff_name}.`,
        data: {
          warning_id: warning?.[0]?.id,
          staff_id,
          staff_name,
        },
        is_read: false,
      }))

      const { error: hrNotifError } = await admin
        .from("staff_notifications")
        .insert(hrNotifications)
      if (hrNotifError) console.error("[v0] HR notification creation failed:", hrNotifError) // Ignore if fails
    }

    return NextResponse.json({
      success: true,
      warning: warning?.[0],
      message: `Warning issued to ${staff_name}. Notification sent.`,
    })
  } catch (error) {
    console.error("[leave/issue-warning] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to issue warning" },
      { status: 500 },
    )
  }
}
