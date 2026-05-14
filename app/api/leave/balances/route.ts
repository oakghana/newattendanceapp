import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    let query = supabase.from("outstanding_leave_balances").select("*")

    if (userId) query = query.eq("user_id", userId)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ data, success: true })
  } catch (error) {
    console.error("[v0] Error fetching balances:", error)
    return NextResponse.json({ error: "Failed to fetch balances", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get team members currently on leave
    const { data: currentLeaves, error } = await supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date, leave_type")
      .eq("status", "approved")
      .lte("start_date", new Date().toISOString().split("T")[0])
      .gte("end_date", new Date().toISOString().split("T")[0])

    if (error) throw error

    return NextResponse.json({ data: currentLeaves, success: true })
  } catch (error) {
    console.error("[v0] Error fetching team on leave:", error)
    return NextResponse.json({ error: "Failed to fetch team status", success: false }, { status: 500 })
  }
}
