import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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
