import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export interface GhanaHoliday {
  id?: string
  holiday_date: string
  holiday_name: string
  is_custom: boolean
}

function normalizeRole(role: string | null | undefined): string {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function canManageHolidays(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  const HOLIDAY_MANAGEMENT_ROLES = [
    "admin",
    "leave_admin",
    "hr_leave_office",
    "hr_office",
    "director_hr",
    "manager_hr",
  ]
  return HOLIDAY_MANAGEMENT_ROLES.includes(normalized)
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

    const admin = await createAdminClient()

    // Fetch all holidays
    const { data: holidays, error: fetchError } = await admin
      .from("ghana_public_holidays")
      .select("*")
      .order("holiday_date", { ascending: true })

    if (fetchError) {
      console.error("[v0] Error fetching holidays:", fetchError)
      return NextResponse.json({ error: "Failed to fetch holidays" }, { status: 500 })
    }

    return NextResponse.json({ holidays: holidays || [] })
  } catch (err) {
    console.error("[v0] Error in GET holidays:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    const admin = await createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = (profile as any).role || null
    if (!canManageHolidays(role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage holidays" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { holiday_date, holiday_name } = body

    if (!holiday_date || !holiday_name) {
      return NextResponse.json(
        { error: "holiday_date and holiday_name are required" },
        { status: 400 }
      )
    }

    // Validate date format (accepts both YYYY-MM-DD and DD/MM/YYYY)
    const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/
    if (!dateRegex.test(holiday_date)) {
      return NextResponse.json(
        { error: "Date must be in YYYY-MM-DD or DD/MM/YYYY format" },
        { status: 400 }
      )
    }

    // Convert DD/MM/YYYY to YYYY-MM-DD if needed
    let formattedDate = holiday_date
    if (holiday_date.includes("/")) {
      const parts = holiday_date.split("/")
      formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`
    }

    const { data: newHoliday, error: insertError } = await admin
      .from("ghana_public_holidays")
      .insert({
        holiday_date: formattedDate,
        holiday_name: String(holiday_name).trim(),
        is_custom: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Error adding holiday:", insertError)
      return NextResponse.json(
        { error: insertError.message || "Failed to add holiday" },
        { status: 500 }
      )
    }

    console.log("[v0] Holiday added:", newHoliday)
    return NextResponse.json({ holiday: newHoliday }, { status: 201 })
  } catch (err) {
    console.error("[v0] Error in POST holidays:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
