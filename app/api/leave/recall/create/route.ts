import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createRecallRequest } from "@/lib/leave-deferment-recall"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      leaveStartDate,
      leaveEndDate,
      recallDate,
      reason,
      leaveRequestId,
    } = await request.json()

    if (!leaveStartDate || !leaveEndDate || !recallDate) {
      return NextResponse.json(
        { error: "Missing required date fields" },
        { status: 400 }
      )
    }

    const recall = await createRecallRequest(
      user.id,
      new Date(leaveStartDate),
      new Date(leaveEndDate),
      new Date(recallDate),
      reason || "",
      leaveRequestId
    )

    return NextResponse.json(recall)
  } catch (err) {
    console.error("[v0] Error creating recall request:", err)
    return NextResponse.json(
      { error: "Failed to create recall request" },
      { status: 500 }
    )
  }
}
