import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { startDate, endDate, reason, leaveType } = await request.json()

    // Validate dates
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start > end) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
    }

    if (start < new Date()) {
      start.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (start < today) {
        return NextResponse.json({ error: "Cannot request leave for past dates" }, { status: 400 })
      }
    }

    // Update user profile with leave request
    const { data: updatedProfile, error: updateError } = await supabase
      .from("user_profiles")
      .update({
        leave_status: "pending",
        leave_start_date: start.toISOString().split("T")[0],
        leave_end_date: end.toISOString().split("T")[0],
        leave_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Leave request update error:", updateError)
      return NextResponse.json({ error: "Failed to submit leave request" }, { status: 500 })
    }

    // Get user's HOD for notification
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("department_id, first_name, last_name, departments(id)")
      .eq("id", user.id)
      .single()

    if (userProfile?.department_id) {
      // Find HODs in the same department
      const { data: hodProfiles } = await supabase
        .from("user_profiles")
        .select("id, email")
        .eq("department_id", userProfile.department_id)
        .eq("role", "department_head")

      // Send notifications to HODs
      if (hodProfiles && hodProfiles.length > 0) {
        for (const hod of hodProfiles) {
          await supabase.from("staff_notifications").insert({
            recipient_id: hod.id,
            sender_id: user.id,
            sender_role: "staff",
            sender_label: `${userProfile.first_name} ${userProfile.last_name}`,
            notification_type: "leave_request",
            message: `Leave request from ${userProfile.first_name} ${userProfile.last_name} for ${start.toLocaleDateString()} to ${end.toLocaleDateString()}. Reason: ${reason}`,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Leave request submitted successfully. Your HOD will review it soon.",
      data: updatedProfile,
    })
  } catch (error) {
    console.error("[v0] Leave request error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function tryDeleteAll(admin: any, table: string) {
  const { error } = await admin.from(table).delete().neq("id", "")
  if (error) {
    const message = String(error.message || "")
    if (/does not exist|schema cache|relation/i.test(message)) {
      return
    }
    throw error
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const normalizedRole = String((profile as any).role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
    if (normalizedRole !== "admin") {
      return NextResponse.json({ error: "Only admin can clear testing leave records." }, { status: 403 })
    }

    await tryDeleteAll(admin, "leave_plan_stagger_reviews")
    await tryDeleteAll(admin, "leave_plan_reviews")
    await tryDeleteAll(admin, "leave_plan_stagger_requests")
    await tryDeleteAll(admin, "leave_plan_requests")
    await tryDeleteAll(admin, "leave_notifications")
    await tryDeleteAll(admin, "leave_status")
    await tryDeleteAll(admin, "leave_requests")

    return NextResponse.json({ success: true, message: "All testing leave records have been cleared." })
  } catch (error: any) {
    console.error("[v0] Leave request cleanup error:", error)
    return NextResponse.json({ error: error?.message || "Failed to clear leave testing records" }, { status: 500 })
  }
}
