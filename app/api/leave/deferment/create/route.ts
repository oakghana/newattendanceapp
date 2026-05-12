import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { createDefermentRequest } from "@/lib/leave-deferment-recall"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      originalStartDate,
      originalEndDate,
      newStartDate,
      newEndDate,
      reason,
      leaveRequestId,
    } = await request.json()

    if (!originalStartDate || !originalEndDate || !newStartDate || !newEndDate) {
      return NextResponse.json(
        { error: "Missing required date fields" },
        { status: 400 }
      )
    }

    const deferment = await createDefermentRequest(
      user.id,
      new Date(originalStartDate),
      new Date(originalEndDate),
      new Date(newStartDate),
      new Date(newEndDate),
      reason || "",
      leaveRequestId
    )

    return NextResponse.json(deferment)
  } catch (err) {
    console.error("[v0] Error creating deferment request:", err)
    return NextResponse.json(
      { error: "Failed to create deferment request" },
      { status: 500 }
    )
  }
}
