import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Optional: filter by month query param  ?month=2026-04
    const url = new URL(request.url)
    const monthParam = url.searchParams.get("month")
    let rangeStart: string
    let rangeEnd: string

    if (monthParam) {
      const [y, m] = monthParam.split("-").map(Number)
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0) // last day of month
      rangeStart = start.toISOString().split("T")[0]
      rangeEnd = end.toISOString().split("T")[0]
    } else {
      // Default: current month
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      rangeStart = start.toISOString().split("T")[0]
      rangeEnd = end.toISOString().split("T")[0]
    }

    // Fetch approved leave requests overlapping the range, join with user profile
    const { data: requests, error } = await supabase
      .from("leave_requests")
      .select(
        `id, user_id, leave_type, start_date, end_date, status,
         user_profiles!inner(first_name, last_name, employee_id, department_id,
           departments(name)
         )`
      )
      .eq("status", "approved")
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart)
      .order("start_date", { ascending: true })

    if (error) {
      // Graceful fallback if schema mismatch
      return NextResponse.json({ entries: [], rangeStart, rangeEnd })
    }

    const entries = (requests || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      name: `${r.user_profiles?.first_name ?? ""} ${r.user_profiles?.last_name ?? ""}`.trim(),
      employeeId: r.user_profiles?.employee_id ?? null,
      department: r.user_profiles?.departments?.name ?? null,
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
    }))

    return NextResponse.json({ entries, rangeStart, rangeEnd })
  } catch (err) {
    console.error("[leave/team-calendar]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
