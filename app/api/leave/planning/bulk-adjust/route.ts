import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { calculateLeaveDaysExcludingHolidaysWeekends, calculateCalendarDays } from "@/lib/ghana-holidays"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { request_ids, day_shift } = body

    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request IDs provided" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Fetch the requests to adjust
    const { data: requests, error: fetchError } = await supabase
      .from("leave_plan_requests")
      .select("id, start_date, end_date, requested_days")
      .in("id", request_ids)

    if (fetchError) throw fetchError

    if (!requests || requests.length === 0) {
      return NextResponse.json(
        { error: "No requests found" },
        { status: 404 }
      )
    }

    // Update each request with shifted dates
    const updates = requests.map((req: any) => {
      const startDate = new Date(req.start_date)
      const endDate = new Date(req.end_date)

      // Apply day shift
      startDate.setDate(startDate.getDate() + day_shift)
      endDate.setDate(endDate.getDate() + day_shift)

      return {
        id: req.id,
        adjusted_start_date: startDate.toISOString().split("T")[0],
        adjusted_end_date: endDate.toISOString().split("T")[0],
      }
    })

    // Batch update requests
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("leave_plan_requests")
        .update({
          adjusted_start_date: update.adjusted_start_date,
          adjusted_end_date: update.adjusted_end_date,
        })
        .eq("id", update.id)

      if (updateError) throw updateError
    }

    return NextResponse.json({
      success: true,
      updated_count: updates.length,
      message: `Successfully adjusted ${updates.length} leave requests by ${day_shift} days`,
    })
  } catch (err) {
    console.error("[v0] Error in bulk adjust:", err)
    return NextResponse.json(
      { error: "Failed to apply bulk adjustment" },
      { status: 500 }
    )
  }
}
