import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export interface LeaveCalendarConfig {
  leave_year_start_month: number
  leave_year_end_month: number
  include_weekends_in_calculation: boolean
  exclude_holidays_in_calculation: boolean
}

// Default configuration
const DEFAULT_CONFIG: LeaveCalendarConfig = {
  leave_year_start_month: 1,
  leave_year_end_month: 12,
  include_weekends_in_calculation: false,
  exclude_holidays_in_calculation: true,
}

function normalizeRole(role: string | null | undefined): string {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function canManageHolidays(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  const HOLIDAY_MANAGEMENT_ROLES = [
    "admin",
    "leave_admin",
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
        { error: "You do not have permission to view calendar configuration" },
        { status: 403 }
      )
    }

    // Fetch current settings
    const { data: settings, error: fetchError } = await admin
      .from("system_settings")
      .select("leave_calendar_config")
      .single()

    if (fetchError) {
      // Return default if not configured
      return NextResponse.json({ config: DEFAULT_CONFIG })
    }

    const config = (settings as any)?.leave_calendar_config || DEFAULT_CONFIG
    return NextResponse.json({ config })
  } catch (err) {
    console.error("[v0] Error fetching calendar config:", err)
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
        { error: "You do not have permission to update calendar configuration" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      leave_year_start_month,
      leave_year_end_month,
      include_weekends_in_calculation,
      exclude_holidays_in_calculation,
    } = body

    // Validate months
    if (
      leave_year_start_month < 1 ||
      leave_year_start_month > 12 ||
      leave_year_end_month < 1 ||
      leave_year_end_month > 12
    ) {
      return NextResponse.json({ error: "Months must be between 1 and 12" }, { status: 400 })
    }

    const newConfig: LeaveCalendarConfig = {
      leave_year_start_month,
      leave_year_end_month,
      include_weekends_in_calculation,
      exclude_holidays_in_calculation,
    }

    // Update or insert settings
    const { error: upsertError } = await admin
      .from("system_settings")
      .upsert(
        {
          id: 1,
          leave_calendar_config: newConfig,
        },
        { onConflict: "id" }
      )

    if (upsertError) {
      console.error("[v0] Error updating calendar config:", upsertError)
      return NextResponse.json({ error: "Failed to update configuration" }, { status: 500 })
    }

    console.log("[v0] Leave calendar configuration updated:", newConfig)
    return NextResponse.json({ success: true, config: newConfig })
  } catch (err) {
    console.error("[v0] Error updating calendar config:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
