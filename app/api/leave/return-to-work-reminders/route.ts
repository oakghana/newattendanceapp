import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { addDays, differenceInDays, startOfDay } from "date-fns"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const today = startOfDay(new Date()).toISOString().split("T")[0]
    const fiveDaysFromNow = addDays(new Date(today), 5).toISOString().split("T")[0]

    // Query for approved leaves ending within 5 days (for current user)
    const { data: leavesToReturn, error } = await supabase
      .from("leave_plan_requests")
      .select("id, end_leave_date, leave_type_name, leave_type_id")
      .eq("user_id", user.id)
      .eq("approval_status", "approved")
      .gte("end_leave_date", today)
      .lte("end_leave_date", fiveDaysFromNow)
      .order("end_leave_date", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching leaves to return:", error)
      return NextResponse.json({ leavesToReturn: [] })
    }

    // Transform data
    const transformed = (leavesToReturn || []).map((leave: any) => {
      const endDate = new Date(leave.end_leave_date)
      const today = new Date()
      const daysUntilReturn = differenceInDays(endDate, today)

      return {
        id: leave.id,
        leave_id: leave.id,
        end_date: leave.end_leave_date,
        leave_type: leave.leave_type_name || "Leave",
        days_until_return: Math.max(0, daysUntilReturn),
      }
    })

    return NextResponse.json({
      success: true,
      leavesToReturn: transformed,
    })
  } catch (error) {
    console.error("[v0] Error in return-to-work reminders:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
