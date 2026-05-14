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

    // Fetch all leave deferrments
    const { data: deferrments, error } = await admin
      .from("leave_deferments")
      .select(`
        id,
        leave_plan_request_id,
        deferral_year,
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
      console.error("[v0] Error fetching deferrments:", error)
      return NextResponse.json({ deferrments: [], error: error.message }, { status: 200 })
    }

    const normalized = (deferrments || []).map((d: any) => {
      const req = d.leave_plan_requests
      return {
        id: String(d.id),
        employee_name: `${req?.user_profiles?.first_name || ""} ${req?.user_profiles?.last_name || ""}`.trim() || "Staff",
        leave_type: String(req?.leave_type_key || "").replace(/_/g, " ").toUpperCase(),
        deferral_year: String(d.deferral_year || ""),
        status: String(d.status || "pending").toUpperCase(),
      }
    })

    return NextResponse.json({ deferrments: normalized })
  } catch (err) {
    console.error("[v0] Deferrments API error:", err)
    return NextResponse.json({ deferrments: [], error: "Internal server error" }, { status: 200 })
  }
}
