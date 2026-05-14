import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = supabase.from("leave_plan_requests").select("*", { count: "exact" })

    if (userId) query = query.eq("user_id", userId)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({ data, total: count, success: true })
  } catch (error) {
    console.error("[v0] Error fetching leave plans:", error)
    return NextResponse.json({ error: "Failed to fetch plans", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    const { data, error } = await supabase.from("leave_plan_requests").insert([
      {
        user_id: body.userId,
        plan_year: body.planYear,
        annual_leave_plan: body.annualLeavePlan,
        status: "submitted",
        created_at: new Date().toISOString(),
      },
    ]).select()

    if (error) throw error

    return NextResponse.json({ data: data[0], success: true }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating leave plan:", error)
    return NextResponse.json({ error: "Failed to create plan", success: false }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    const { data, error } = await supabase
      .from("leave_plan_requests")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()

    if (error) throw error

    return NextResponse.json({ data: data[0], success: true })
  } catch (error) {
    console.error("[v0] Error updating leave plan:", error)
    return NextResponse.json({ error: "Failed to update plan", success: false }, { status: 500 })
  }
}
