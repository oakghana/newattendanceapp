import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await createAdminClient()
    const { holiday_date, holiday_name } = await req.json()

    // Check authorization
    const {
      data: { user },
    } = await admin.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role - exact match
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const userRole = profile?.role || ""
    const authorizedRoles = ["HR LEAVE_OFFICE", "admin", "Admin"]
    const isAuthorized = authorizedRoles.includes(userRole)

    if (!isAuthorized) {
      return NextResponse.json({ error: `Unauthorized: Role "${userRole}" cannot manage holidays` }, { status: 403 })
    }

    // Validate inputs
    if (!holiday_date || !holiday_name) {
      return NextResponse.json({ error: "holiday_date and holiday_name are required" }, { status: 400 })
    }

    // Update holiday
    const { data: updated, error } = await admin
      .from("ghana_public_holidays")
      .update({ 
        holiday_date, 
        holiday_name,
        updated_at: new Date().toISOString()
      })
      .eq("id", params.id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating holiday:", error)
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
    const admin = await createAdminClient()

    // Check authorization
    const {
      data: { user },
    } = await admin.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role - exact match
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const userRole = profile?.role || ""
    const authorizedRoles = ["HR LEAVE_OFFICE", "admin", "Admin"]
    const isAuthorized = authorizedRoles.includes(userRole)

    if (!isAuthorized) {
      return NextResponse.json({ error: `Unauthorized: Role "${userRole}" cannot manage holidays` }, { status: 403 })
    }

    // Delete holiday
    const { error } = await admin
      .from("ghana_public_holidays")
      .delete()
      .eq("id", params.id)

    if (error) {
      console.error("[v0] Error deleting holiday:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Holiday DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
