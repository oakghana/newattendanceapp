import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Fetch all approved leave memos
    const { data: memos, error } = await admin
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        status,
        user_profiles(first_name, last_name)
      `)
      .eq("status", "hr_approved")
      .order("preferred_start_date", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[v0] Error fetching memos:", error)
      return NextResponse.json({ memos: [], error: error.message }, { status: 200 })
    }

    const normalized = (memos || []).map((m: any) => ({
      id: String(m.id),
      employee_name: `${m.user_profiles?.first_name || ""} ${m.user_profiles?.last_name || ""}`.trim() || "Staff",
      employee_id: String(m.user_id || ""),
      leave_type: String(m.leave_type_key || "").replace(/_/g, " ").toUpperCase(),
      start_date: m.preferred_start_date,
      end_date: m.preferred_end_date,
      status: "Approved",
    }))

    return NextResponse.json({ memos: normalized })
  } catch (err) {
    console.error("[v0] Memos API error:", err)
    return NextResponse.json({ memos: [], error: "Internal server error" }, { status: 200 })
  }
}
