import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const admin = createClient(
  String(process.env.NEXT_PUBLIC_SUPABASE_URL),
  String(process.env.SUPABASE_SERVICE_ROLE_KEY),
  { auth: { persistSession: false } }
)

// GET: Fetch all staff category reference prefixes (for admin/HR office management)
// GET?staff_category=junior: Get prefix for specific category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const staffCategory = searchParams.get("staff_category")

    let query = admin
      .from("staff_category_ref_prefixes")
      .select("*")
      .eq("is_active", true)

    if (staffCategory) {
      query = query.eq("staff_category", staffCategory)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API] Error fetching staff category ref prefixes:", error)
      return NextResponse.json({ error: "Failed to fetch reference prefixes" }, { status: 500 })
    }

    return NextResponse.json({ prefixes: data })
  } catch (error) {
    console.error("[API] Unexpected error in GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST: Generate next reference number for a staff category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { staff_category } = body

    if (!staff_category) {
      return NextResponse.json({ error: "staff_category is required" }, { status: 400 })
    }

    // Fetch the current prefix record and increment the sequence number atomically
    const { data: record, error: fetchError } = await admin
      .from("staff_category_ref_prefixes")
      .select("*")
      .eq("staff_category", staff_category)
      .eq("is_active", true)
      .single()

    if (fetchError || !record) {
      console.error("[API] Staff category not found:", staff_category, fetchError)
      return NextResponse.json(
        { error: `Reference prefix not configured for staff category: ${staff_category}` },
        { status: 404 }
      )
    }

    // Generate the next reference number
    const nextRefNum = `${record.ref_prefix}/${String(record.next_sequence_number).padStart(2, "0")}`

    // Increment the sequence number for next time
    const { error: updateError } = await admin
      .from("staff_category_ref_prefixes")
      .update({ next_sequence_number: record.next_sequence_number + 1, updated_at: new Date().toISOString() })
      .eq("id", record.id)

    if (updateError) {
      console.error("[API] Error incrementing sequence:", updateError)
      // Still return the generated ref number even if increment failed (will retry next time)
    }

    return NextResponse.json({ reference_number: nextRefNum })
  } catch (error) {
    console.error("[API] Unexpected error in POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT: Update staff category reference prefix (admin only)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { staff_category, ref_prefix } = body

    if (!staff_category || !ref_prefix) {
      return NextResponse.json({ error: "staff_category and ref_prefix are required" }, { status: 400 })
    }

    const { error: updateError } = await admin
      .from("staff_category_ref_prefixes")
      .update({ ref_prefix, updated_at: new Date().toISOString() })
      .eq("staff_category", staff_category)

    if (updateError) {
      console.error("[API] Error updating prefix:", updateError)
      return NextResponse.json({ error: "Failed to update reference prefix" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Reference prefix updated" })
  } catch (error) {
    console.error("[API] Unexpected error in PUT:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
