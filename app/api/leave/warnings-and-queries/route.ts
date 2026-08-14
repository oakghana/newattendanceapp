import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check user role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isHrOrLeaveOffice = ["admin", "it_admin", "hr", "hr_office", "hr_officer", "hr_leave_office", "manager_hr", "director_hr"].includes(userRole)

    let query = supabase
      .from("staff_warnings")
      .select("*")

    // If not HR/Leave Office, show only their own warnings
    if (!isHrOrLeaveOffice) {
      query = query.eq("staff_id", user.id)
    }

    const { data: warnings, error } = await query.order("date_issued", { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      warnings: warnings || [],
      role: userRole,
      isHrOrLeaveOffice,
    })
  } catch (error) {
    console.error("[leave/warnings-and-queries] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch warnings" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { staff_id, warning_type, details } = body

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is HR/Leave Office
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    if (!["admin", "it_admin", "hr", "hr_office", "hr_officer", "hr_leave_office", "manager_hr", "director_hr"].includes(userRole)) {
      return NextResponse.json({ error: "Only HR staff can issue warnings" }, { status: 403 })
    }

    // Insert warning
    const { data, error } = await supabase
      .from("staff_warnings")
      .insert({
        staff_id,
        issued_by: user.id,
        warning_type,
        details: details || "",
        status: "pending",
        date_issued: new Date().toISOString(),
      })
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      warning: data?.[0],
    })
  } catch (error) {
    console.error("[leave/warnings-and-queries] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create warning" },
      { status: 500 },
    )
  }
}
