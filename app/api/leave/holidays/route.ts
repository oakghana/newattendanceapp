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
      .select("id, holiday_date, holiday_name")
      .order("holiday_date", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching holidays:", error)
      return NextResponse.json(
        { error: "Failed to fetch holidays", holidays: [] },
        { status: 200 }
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
      { status: 200 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { holiday_date, holiday_name } = await req.json()

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

export async function DELETE(req: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")

    if (!date) {
      return NextResponse.json(
        { error: "date query parameter is required" },
        { status: 400 }
      )
    }

    // Delete holiday by date
    const { error } = await admin
      .from("ghana_public_holidays")
      .delete()
      .eq("holiday_date", date)

    if (error) {
      console.error("[v0] Error deleting holiday:", error)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, message: "Holiday deleted successfully" })
  } catch (err) {
    console.error("[v0] Holiday DELETE error:", err)
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { old_date, holiday_date, holiday_name } = await req.json()

    if (!old_date || !holiday_date || !holiday_name) {
      return NextResponse.json(
        { error: "old_date, holiday_date, and holiday_name are required" },
        { status: 400 }
      )
    }

    // Delete old holiday and add new one
    await admin
      .from("ghana_public_holidays")
      .delete()
      .eq("holiday_date", old_date)

    const { data: updated, error } = await admin
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

    if (error) {
      console.error("[v0] Error updating holiday:", error)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, holiday: updated?.[0], message: "Holiday updated successfully" })
  } catch (err) {
    console.error("[v0] Holiday PUT error:", err)
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    )
  }
}
