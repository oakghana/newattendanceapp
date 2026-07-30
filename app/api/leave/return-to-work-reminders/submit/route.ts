import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { leave_id, expected_check_in_time } = await request.json()

    if (!leave_id || !expected_check_in_time) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Update leave with expected check-in time (store in a metadata field or new column if available)
    // For now, we'll create an in-app notification record
    const { error: updateError } = await supabase
      .from("leave_plan_requests")
      .update({
        return_notification_sent_at: new Date().toISOString(),
        expected_check_in_time: expected_check_in_time,
      })
      .eq("id", leave_id)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("[v0] Error updating leave reminder:", updateError)
    }

    // Create notification for supervisors
    const { data: staffData } = await supabase
      .from("user_profiles")
      .select("first_name, last_name, hod_id, regional_manager_id, department_name")
      .eq("id", user.id)
      .single()

    if (staffData) {
      // Notify HOD/RM about expected return
      const notificationMessage = `${staffData.first_name || "Staff"} ${staffData.last_name || ""} will be returning to work at approximately ${expected_check_in_time}. Please ensure coverage arrangements are in place.`

      // Store notification for supervisors
      if (staffData.hod_id) {
        await supabase.from("notifications").insert({
          recipient_id: staffData.hod_id,
          message: notificationMessage,
          type: "leave_return_notification",
          related_leave_id: leave_id,
          created_at: new Date().toISOString(),
        })
      }

      if (staffData.regional_manager_id) {
        await supabase.from("notifications").insert({
          recipient_id: staffData.regional_manager_id,
          message: notificationMessage,
          type: "leave_return_notification",
          related_leave_id: leave_id,
          created_at: new Date().toISOString(),
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: "Check-in reminder set successfully",
    })
  } catch (error) {
    console.error("[v0] Error submitting return-to-work reminder:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
