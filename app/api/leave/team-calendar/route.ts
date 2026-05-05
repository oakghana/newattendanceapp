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

    // Current workflow source: leave_plan_requests with final HR approval.
    const { data: requests, error } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, status, is_archived")
      .eq("status", "hr_approved")
      .eq("is_archived", false)
      .order("preferred_start_date", { ascending: true })

    if (error) return NextResponse.json({ entries: [], rangeStart, rangeEnd })

    const normalized = (requests || []).flatMap((r: any) => {
      const startDate = String(r?.adjusted_start_date || r?.preferred_start_date || "")
      const endDate = String(r?.adjusted_end_date || r?.preferred_end_date || "")
      if (!startDate || !endDate) return []
      if (startDate > rangeEnd || endDate < rangeStart) return []
      return [{
        id: String(r.id),
        userId: String(r.user_id || ""),
        leaveType: String(r.leave_type_key || "annual"),
        startDate,
        endDate,
      }]
    })

    const userIds = Array.from(new Set(normalized.map((r: any) => r.userId).filter(Boolean)))
    let usersById = new Map<string, any>()
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, department_id")
        .in("id", userIds)

      const departmentIds = Array.from(new Set((profiles || []).map((p: any) => String(p?.department_id || "")).filter(Boolean)))
      let departmentsById = new Map<string, string>()
      if (departmentIds.length > 0) {
        const { data: departments } = await admin
          .from("departments")
          .select("id, name")
          .in("id", departmentIds)
        departmentsById = new Map((departments || []).map((d: any) => [String(d.id), String(d.name || "")]))
      }

      usersById = new Map((profiles || []).map((p: any) => [String(p.id), {
        name: `${String(p?.first_name || "")} ${String(p?.last_name || "")}`.trim(),
        employeeId: p?.employee_id ?? null,
        department: departmentsById.get(String(p?.department_id || "")) || null,
      }]))
    }

    const entries = normalized.map((r: any) => {
      const profile = usersById.get(r.userId)
      return {
        id: r.id,
        userId: r.userId,
        name: profile?.name || "Staff Member",
        employeeId: profile?.employeeId || null,
        department: profile?.department || null,
        leaveType: r.leaveType,
        startDate: r.startDate,
        endDate: r.endDate,
      }
    })

    return NextResponse.json({ entries, rangeStart, rangeEnd })
  } catch (err) {
    console.error("[leave/team-calendar]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
