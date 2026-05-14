import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createAdminClient()
    const { holiday_date, holiday_name } = await req.json()

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Update holiday
    const { data: updated, error } = await supabase
      .from("ghana_public_holidays")
      .update({ holiday_date, holiday_name })
      .eq("id", params.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, holiday: updated })
  } catch (err) {
    console.error("[v0] Holiday PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createAdminClient()

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Delete holiday
    const { error } = await supabase
      .from("ghana_public_holidays")
      .delete()
      .eq("id", params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Holiday DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
