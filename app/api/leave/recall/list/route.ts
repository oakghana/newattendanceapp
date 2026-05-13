import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = (userProfile?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
    const isAdmin = ["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)

    let query = admin
      .from("leave_recall_requests")
      .select("*")
      .order("created_at", { ascending: false })

    // Only get user's own recalls unless admin
    if (!isAdmin) {
      query = query.eq("initiated_by_user_id", user.id)
    }

    const { data: recalls, error } = await query

    if (error) {
      console.error("[v0] Error fetching recall requests:", error)
      return NextResponse.json(
        { error: "Failed to fetch recall requests" },
        { status: 500 }
      )
    }

    return NextResponse.json({ recalls: recalls || [] })
  } catch (err) {
    console.error("[v0] Error fetching recall requests:", err)
    return NextResponse.json(
      { error: "Failed to fetch recall requests" },
      { status: 500 }
    )
  }
}

