import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Fetch all public holidays for Ghana
    const { data: holidays, error } = await admin
      .from("ghana_public_holidays")
      .select("holiday_date, holiday_name")
      .order("holiday_date", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching holidays:", error)
      return NextResponse.json(
        { error: "Failed to fetch holidays", holidays: [] },
        { status: 200 } // Return 200 with empty array on error for graceful degradation
      )
    }

    return NextResponse.json({
      success: true,
      holidays: holidays || [],
    })
  } catch (error) {
    console.error("[v0] Holidays API error:", error)
    return NextResponse.json(
      { error: "Internal server error", holidays: [] },
      { status: 200 } // Return 200 with empty array on error for graceful degradation
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const { holiday_date, holiday_name } = await req.json()

    // Check user role - only HR Leave Office can add holidays
    const authHeader = req.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const userRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isHrLeaveOffice = ["hr_leave_office", "hr_office", "admin"].includes(userRole)

    if (!isHrLeaveOffice) {
      return NextResponse.json(
        { error: "Only HR Leave Office can add public holidays" },
        { status: 403 }
      )
    }

    // Validate inputs
    if (!holiday_date || !holiday_name) {
      return NextResponse.json(
        { error: "holiday_date and holiday_name are required" },
        { status: 400 }
      )
    }

    // Add holiday
    const { data: newHoliday, error: insertError } = await supabase
      .from("ghana_public_holidays")
      .insert([
        {
          holiday_date,
          holiday_name,
          created_by: user.id,
          created_at: new Date().toISOString(),
        },
      ])
      .select()

    if (insertError) {
      console.error("[v0] Error adding holiday:", insertError)
      return NextResponse.json(
        { error: "Failed to add holiday", details: insertError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      holiday: newHoliday?.[0],
      message: "Holiday added successfully",
    })
  } catch (error) {
    console.error("[v0] Holidays POST error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
