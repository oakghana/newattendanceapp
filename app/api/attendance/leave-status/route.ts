import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { leave_status, leave_start_date, leave_end_date, leave_reason, leave_document_url, target_user_id } = body

    // Check if user is admin or god-tier user
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 401 })
    }

    // Only admins and god users can change leave status for others
    const isAdmin = userProfile.role === "admin" || userProfile.role === "god"
    const isChangingOwnStatus = !target_user_id || target_user_id === user.id
    const canChangeStatus = isChangingOwnStatus || isAdmin

    if (!canChangeStatus) {
      return NextResponse.json(
        { error: "Only admins and god users can change leave status for other staff members" },
        { status: 403 },
      )
    }

    const userId = target_user_id || user.id

    // Validate leave status
    if (!["active", "on_leave", "sick_leave"].includes(leave_status)) {
      return NextResponse.json({ error: "Invalid leave status" }, { status: 400 })
    }

    // If setting leave, validate dates
    if (leave_status !== "active") {
      if (!leave_start_date || !leave_end_date) {
        return NextResponse.json({ error: "Start and end dates are required for leave" }, { status: 400 })
      }

      const start = new Date(leave_start_date)
      const end = new Date(leave_end_date)

      if (end < start) {
        return NextResponse.json({ error: "End date must be after start date" }, { status: 400 })
      }
    }

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .update({
          leave_status: leave_status,
          leave_start_date: leave_status === "active" ? null : leave_start_date,
          leave_end_date: leave_status === "active" ? null : leave_end_date,
          leave_reason: leave_status === "active" ? null : leave_reason,
          leave_document_url: leave_status === "active" ? null : leave_document_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single()

      if (error) {
        // Check if error is due to missing columns
        if (error.code === "42703" || error.message?.includes("does not exist")) {
          console.log("[v0] Leave status columns not yet created in database")
          return NextResponse.json(
            {
              success: false,
              error: "Leave status feature not yet set up. Please run database migration script 024.",
              needsMigration: true,
            },
            { status: 400 },
          )
        }

        console.error("[v0] Error updating leave status:", error)
        return NextResponse.json({ error: "Failed to update leave status" }, { status: 500 })
      }

      // Log the change
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "update_leave_status",
        table_name: "user_profiles",
        record_id: userId,
        new_values: {
          leave_status,
          leave_start_date,
          leave_end_date,
          leave_reason,
          leave_document_url,
        },
        ip_address: request.ip || null,
        user_agent: request.headers.get("user-agent"),
      })

      return NextResponse.json({
        success: true,
        data,
        message: leave_status === "active" ? "Staff member marked as active (at post)" : "Leave status updated successfully",
      })
    } catch (queryError: any) {
      // Handle query-level errors (e.g., missing columns)
      if (queryError?.code === "42703" || queryError?.message?.includes("does not exist")) {
        console.log("[v0] Leave status columns not yet created in database")
        return NextResponse.json(
          {
            success: false,
            error: "Leave status feature not yet set up. Please contact your administrator.",
            needsMigration: true,
          },
          { status: 503 },
        )
      }
      throw queryError
    }
  } catch (error) {
    console.error("[v0] Leave status update error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get query parameter for checking specific user (admin only)
    const url = new URL(request.url)
    const targetUserId = url.searchParams.get("user_id")

    // If checking someone else's status, verify user is admin
    if (targetUserId && targetUserId !== user.id) {
      const { data: userProfile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (profileError || !userProfile || (userProfile.role !== "admin" && userProfile.role !== "god")) {
        return NextResponse.json({ error: "Unauthorized to view other users' leave status" }, { status: 403 })
      }
    }

    const userId = targetUserId || user.id

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("leave_status, leave_start_date, leave_end_date, leave_reason, leave_document_url")
        .eq("id", userId)
        .single()

      if (error) {
        // Check if error is due to missing columns
        if (error.code === "42703" || error.message?.includes("does not exist")) {
          console.log("[v0] Leave status columns not yet created, returning default active status")
          return NextResponse.json({
            success: true,
            data: {
              leave_status: "active",
              leave_start_date: null,
              leave_end_date: null,
              leave_reason: null,
              leave_document_url: null,
            },
          })
        }

        console.error("[v0] Error fetching leave status:", error)
        return NextResponse.json({ error: "Failed to fetch leave status" }, { status: 500 })
      }

      const today = new Date().toISOString().split("T")[0]
      const withinLeaveWindow =
        !!data?.leave_start_date &&
        !!data?.leave_end_date &&
        today >= data.leave_start_date &&
        today <= data.leave_end_date

      const effectiveLeaveStatus = withinLeaveWindow && data.leave_status !== "active" ? data.leave_status : "active"

      return NextResponse.json({
        success: true,
        data: {
          ...data,
          leave_status: effectiveLeaveStatus,
          is_within_leave_window: withinLeaveWindow,
        },
      })
    } catch (queryError: any) {
      // Handle query-level errors gracefully
      if (queryError?.code === "42703" || queryError?.message?.includes("does not exist")) {
        console.log("[v0] Leave status columns not yet created, returning default active status")
        return NextResponse.json({
          success: true,
          data: {
            leave_status: "active",
            leave_start_date: null,
            leave_end_date: null,
            leave_reason: null,
            leave_document_url: null,
          },
        })
      }
      // For other query errors, log and return server error
      console.error("[v0] Leave status query error:", queryError)
      return NextResponse.json({ error: "Failed to fetch leave status" }, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] Leave status fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
