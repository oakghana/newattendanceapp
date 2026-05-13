import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      leaveRequestId,
      originalStartDate,
      originalEndDate,
      newStartDate,
      newEndDate,
      hodRecommendation,
      hodName,
    } = await request.json()

    if (!leaveRequestId) {
      return NextResponse.json({ error: "Missing leaveRequestId" }, { status: 400 })
    }

    // Fetch the leave request and requester info
    const { data: leaveRequest, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        user_profiles!inner (email, first_name, last_name)
      `
      )
      .eq("id", leaveRequestId)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    const staffEmail = leaveRequest.user_profiles?.email
    const staffName = `${leaveRequest.user_profiles?.first_name || ""} ${leaveRequest.user_profiles?.last_name || ""}`.trim()

    // Create notification record
    const { data: notification, error: notificationError } = await admin
      .from("leave_date_change_notifications")
      .insert([
        {
          leave_plan_request_id: leaveRequestId,
          staff_user_id: leaveRequest.user_id,
          hod_user_id: user.id,
          hod_name: hodName,
          original_start_date: originalStartDate,
          original_end_date: originalEndDate,
          recommended_start_date: newStartDate,
          recommended_end_date: newEndDate,
          hod_recommendation: hodRecommendation,
          status: "pending_staff_response",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (notificationError) {
      console.error("[v0] Error creating notification:", notificationError)
      return NextResponse.json({ error: "Failed to create notification" }, { status: 500 })
    }

    // Send email notification to staff
    if (staffEmail) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: staffEmail,
            subject: "Your Leave Dates Have Been Adjusted by HOD",
            template: "hod-date-change",
            data: {
              staffName,
              hodName,
              originalStartDate,
              originalEndDate,
              newStartDate,
              newEndDate,
              hodRecommendation,
              actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/leave/hod-date-change/${notification.id}`,
            },
          }),
        })
      } catch (emailError) {
        console.error("[v0] Error sending email:", emailError)
        // Continue even if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Date change notification sent to staff",
      notificationId: notification.id,
    })
  } catch (error) {
    console.error("[v0] Error in hod-date-change:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
