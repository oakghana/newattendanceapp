import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRecallRequests } from "@/lib/leave-deferment-recall"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requests = await getUserRecallRequests(user.id)
    return NextResponse.json(requests)
  } catch (err) {
    console.error("[v0] Error fetching recall requests:", err)
    return NextResponse.json(
      { error: "Failed to fetch recall requests" },
      { status: 500 }
    )
  }
}
