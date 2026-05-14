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

    // Fetch all leave recalls
    const { data: recalls, error } = await admin
      .from("leave_recalls")
      .select(`
        id,
        leave_plan_request_id,
        recall_date,
        status,
        leave_plan_requests(
          user_id,
          leave_type_key,
          user_profiles(first_name, last_name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[v0] Error fetching recalls:", error)
      return NextResponse.json({ recalls: [], error: error.message }, { status: 200 })
    }

    const normalized = (recalls || []).map((r: any) => {
      const req = r.leave_plan_requests
      return {
        id: String(r.id),
        employee_name: `${req?.user_profiles?.first_name || ""} ${req?.user_profiles?.last_name || ""}`.trim() || "Staff",
        leave_type: String(req?.leave_type_key || "").replace(/_/g, " ").toUpperCase(),
        recall_date: String(r.recall_date || ""),
        status: String(r.status || "pending").toUpperCase(),
      }
    })

    return NextResponse.json({ recalls: normalized })
  } catch (err) {
    console.error("[v0] Recalls API error:", err)
    return NextResponse.json({ recalls: [], error: "Internal server error" }, { status: 200 })
  }
}
