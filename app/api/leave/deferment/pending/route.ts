import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check user role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get pending requests based on role and department
    let query = supabase
      .from("leave_deferment_requests")
      .select("*")
      .eq("status", "pending_hod")
      .order("created_at", { ascending: true })

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err) {
    console.error("[v0] Error fetching pending requests:", err)
    return NextResponse.json(
      { error: "Failed to fetch pending requests" },
      { status: 500 }
    )
  }
}
