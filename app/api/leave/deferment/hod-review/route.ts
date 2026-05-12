import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hodReviewDeferment } from "@/lib/leave-deferment-recall"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is HOD or has permission to review
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "hod", "director"].includes(profile.role)) {
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

    const result = await hodReviewDeferment(defermentId, decision, comments || "", user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[v0] Error reviewing deferment:", err)
    return NextResponse.json(
      { error: "Failed to review deferment" },
      { status: 500 }
    )
  }
}
