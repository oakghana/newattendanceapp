import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createAdminClient()

    const { data: leaveTypes, error } = await supabase
      .from("leave_types")
      .select("id, leave_type_key, leave_type_label, entitlement_days, is_active")
      .order("leave_type_label", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching leave types:", error)
      return NextResponse.json(
        { error: "Failed to fetch leave types", leaveTypes: [] },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      leaveTypes: leaveTypes || [],
    })
  } catch (error) {
    console.error("[v0] Leave types GET error:", error)
    return NextResponse.json(
      { error: "Internal server error", leaveTypes: [] },
      { status: 200 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const { leave_type_key, leave_type_label, entitlement_days, is_active } = await req.json()

    // Check authorization
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isAuthorized = ["hr_leave_office", "director_hr", "manager_hr", "admin"].includes(userRole)

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Only HR Leave Office can manage leave types" },
        { status: 403 }
      )
    }

    // Validate inputs
    if (!leave_type_key || !leave_type_label) {
      return NextResponse.json(
        { error: "leave_type_key and leave_type_label are required" },
        { status: 400 }
      )
    }

    // Add leave type
    const { data: newLeaveType, error: insertError } = await supabase
      .from("leave_types")
      .insert([
        {
          leave_type_key,
          leave_type_label,
          entitlement_days: entitlement_days || 0,
          is_active: is_active !== false,
        },
      ])
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Error adding leave type:", insertError)
      return NextResponse.json(
        { error: "Failed to add leave type", details: insertError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      leaveType: newLeaveType,
      message: "Leave type added successfully",
    })
  } catch (error) {
    console.error("[v0] Leave types POST error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
