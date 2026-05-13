import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { notifyLeaveHodDefermentRequest } from "@/lib/workflow-emails"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      leave_plan_request_id,
      requested_deferment_year,
      requested_deferment_period,
      reason,
    } = await request.json()

    // Validate required fields
    if (!leave_plan_request_id || !requested_deferment_year || !requested_deferment_period) {
      return NextResponse.json(
        { error: "leave_plan_request_id, requested_deferment_year, and requested_deferment_period are required" },
        { status: 400 }
      )
    }

    // Get the leave request to verify it's approved and belongs to the user
    const { data: leaveRequest, error: leaveError } = await admin
      .from("leave_plan_requests")
      .select("*")
      .eq("id", leave_plan_request_id)
      .eq("user_id", user.id)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Verify the leave is approved
    if (leaveRequest.status !== "hr_approved") {
      return NextResponse.json(
        { error: "Only approved leave requests can be deferred" },
        { status: 400 }
      )
    }

    // Check if a deferment request already exists for this leave
    const { data: existingDeferment } = await admin
      .from("leave_deferment_requests")
      .select("id")
      .eq("leave_plan_request_id", leave_plan_request_id)
      .in("status", ["pending_hod_review", "hod_approved"])
      .single()

    if (existingDeferment) {
      return NextResponse.json(
        { error: "A deferment request already exists for this leave" },
        { status: 400 }
      )
    }

    // Get HOD or Regional Manager for this staff
    const { data: hod, error: hodError } = await admin
      .from("user_profiles")
      .select("id, full_name, email, role")
      .eq("id", leaveRequest.hod_user_id || leaveRequest.regional_manager_id)
      .single()

    if (!hod) {
      return NextResponse.json(
        { error: "HOD or Regional Manager not found" },
        { status: 404 }
      )
    }

    // Create deferment request
    const { data: defermentRequest, error: createError } = await admin
      .from("leave_deferment_requests")
      .insert([
        {
          leave_plan_request_id,
          user_id: user.id,
          requested_deferment_year,
          requested_deferment_period,
          reason: reason || null,
          status: "pending_hod_review",
        },
      ])
      .select("*")
      .single()

    if (createError) {
      console.error("[v0] Failed to create deferment request:", createError)
      return NextResponse.json({ error: "Failed to create deferment request" }, { status: 500 })
    }

    // Create notification for the request submission
    await admin
      .from("leave_deferment_notifications")
      .insert([
        {
          deferment_request_id: defermentRequest.id,
          recipient_id: user.id,
          type: "staff_submitted",
          message: `Your leave deferment request for ${requested_deferment_period} has been submitted to your HOD/Manager for approval.`,
        },
      ])

    // Send notification to HOD/Regional Manager
    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()

    notifyLeaveHodDefermentRequest(admin, {
      hodUserId: hod.id,
      staffName: staffProfile?.full_name || "Staff Member",
      hodName: hod.full_name || "Manager",
      leaveType: leaveRequest.leave_type_key || "Leave",
      originalLeaveStart: leaveRequest.preferred_start_date,
      originalLeaveEnd: leaveRequest.preferred_end_date,
      requestedDefermentPeriod: requested_deferment_period,
      reason: reason || undefined,
    }).catch((e) => console.error("[v0] Failed to send HOD notification:", e))

    return NextResponse.json({
      success: true,
      defermentRequest,
      message: "Deferment request submitted successfully",
    })
  } catch (error) {
    console.error("[v0] Deferment request error:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action") // "approved_leaves" or "deferments"

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile for role checking
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = (userProfile?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")

    // Get approved leaves that can be deferred
    if (action === "approved_leaves") {
      // First, get the current user's department (if they're a HOD)
      const { data: currentUserData } = await admin
        .from("user_profiles")
        .select("id, role, department_id")
        .eq("id", user.id)
        .single()

      let query = admin
        .from("leave_plan_requests")
        .select(
          `id, 
           user_id,
           leave_type_key, 
           preferred_start_date, 
           preferred_end_date, 
           requested_days,
           status,
           is_deferred,
           user_profiles!inner(id, first_name, last_name, department_id),
           departments(id, name)`
        )
        .eq("status", "hr_approved")
        .eq("is_deferred", false)

      // Filter based on role
      if (["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)) {
        // HR can see all approved leaves
        query = query.order("preferred_start_date", { ascending: false })
      } else if (["hod", "head_of_department", "head_department", "manager", "department_head"].includes(roleNorm)) {
        // HOD can see approved leaves for their department staff
        if (currentUserData?.department_id) {
          query = query
            .eq("user_profiles.department_id", currentUserData.department_id)
            .order("preferred_start_date", { ascending: false })
        } else {
          // HOD without department assignment can't see anything
          return NextResponse.json({ requests: [] })
        }
      } else {
        // Staff can see their own approved leaves
        query = query
          .eq("user_id", user.id)
          .order("preferred_start_date", { ascending: false })
      }

      const { data: approvedLeaves, error } = await query

      if (error) {
        console.error("[v0] Failed to fetch approved leaves:", error)
        return NextResponse.json({ error: "Failed to fetch approved leaves" }, { status: 500 })
      }

      return NextResponse.json({ requests: approvedLeaves })
    }

    // Default: Get deferment requests
    let query = admin.from("leave_deferment_requests").select(
      `*,
       leave_plan_requests(id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, hod_user_id, regional_manager_id),
       hod_reviewer:hod_reviewer_id(id, full_name, email),
       hr_office_reviewer:hr_office_reviewer_id(id, full_name, email),
       user_profiles(id, full_name, email)`
    )

    // Filter based on role
    if (["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)) {
      // Admin/HR can see all
      query = query.order("created_at", { ascending: false })
    } else {
      // Staff can see their own
      query = query.eq("user_id", user.id).order("created_at", { ascending: false })
    }

    const { data: deferments, error } = await query

    if (error) {
      console.error("[v0] Failed to fetch deferments:", error)
      return NextResponse.json({ error: "Failed to fetch deferments" }, { status: 500 })
    }

    return NextResponse.json({ deferments })
  } catch (error) {
    console.error("[v0] Deferment fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch deferments" }, { status: 500 })
  }
}
