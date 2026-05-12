import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { executiveHrApproveDeferment } from "@/lib/leave-deferment-recall"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is Executive HR
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "executive_hr"].includes(profile.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { defermentId, decision, comments } = await request.json()

    if (!defermentId || !decision) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (!["approve", "reject"].includes(decision)) {
      return NextResponse.json(
        { error: "Invalid decision" },
        { status: 400 }
      )
    }

    const result = await executiveHrApproveDeferment(defermentId, decision, comments || "", user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[v0] Error approving deferment:", err)
    return NextResponse.json(
      { error: "Failed to approve deferment" },
      { status: 500 }
    )
  }
}
