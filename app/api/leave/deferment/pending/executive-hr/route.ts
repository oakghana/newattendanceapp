import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get pending requests for Executive HR (already approved by HR Office)
    const { data, error } = await supabase
      .from("leave_deferment_requests")
      .select("*")
      .eq("status", "pending_executive_hr")
      .order("created_at", { ascending: true })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err) {
    console.error("[v0] Error fetching Executive HR pending requests:", err)
    return NextResponse.json(
      { error: "Failed to fetch pending requests" },
      { status: 500 }
    )
  }
}
