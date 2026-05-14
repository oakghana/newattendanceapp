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
    const admin = await createAdminClient()
    const { holiday_date, holiday_name } = await req.json()

    // Get current user
    const {
      data: { user },
    } = await admin.auth.getUser()

    if (!user) {
      console.log("[v0] No authenticated user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const rawRole = profile?.role || ""
    const userRole = String(rawRole).toLowerCase().replace(/[\s-]+/g, "_")
    
    console.log("[v0] Holiday POST - Raw role:", rawRole, "Normalized:", userRole)

    // Check if user has permission - include all valid roles
    const isHrLeaveOffice = ["hr_leave_office", "hr_office", "admin", "director_hr", "manager_hr"].includes(userRole)

    if (!isHrLeaveOffice) {
      console.log("[v0] User not authorized. Role:", userRole, "Allowed roles:", ["hr_leave_office", "hr_office", "admin", "director_hr", "manager_hr"])
      return NextResponse.json(
        { error: "Only HR Leave Office staff can add public holidays" },
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

    // Add holiday using admin client (bypasses RLS)
    const { data: newHoliday, error: insertError } = await admin
      .from("ghana_public_holidays")
      .insert([
        {
          holiday_date,
          holiday_name,
          is_custom: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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

    console.log("[v0] Holiday added successfully:", newHoliday?.[0]?.holiday_date)
    return NextResponse.json({
      success: true,
      holiday: newHoliday?.[0],
      message: "Holiday added successfully",
    })
  } catch (error) {
    console.error("[v0] Holidays POST error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
