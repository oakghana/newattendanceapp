import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export interface GhanaHoliday {
  id?: string
  holiday_date: string
  holiday_name: string
  is_custom: boolean
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

    const role = String((profile as any).role || "").toLowerCase().trim()
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can add holidays" },
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

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(holiday_date)) {
      return NextResponse.json(
        { error: "Date must be in YYYY-MM-DD format" },
        { status: 400 }
      )
    }

    const { data: newHoliday, error: insertError } = await admin
      .from("ghana_public_holidays")
      .insert({
        holiday_date,
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
