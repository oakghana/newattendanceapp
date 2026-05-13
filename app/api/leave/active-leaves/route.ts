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

    // Get user profile for role and department checking
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("role, department_id")
      .eq("id", user.id)
      .single()

    const roleNorm = (userProfile?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
    const isAdmin = ["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)
    const isHod = ["hod", "head_of_department", "head_department", "manager", "department_head", "regional_manager", "rm"].includes(roleNorm)

    const today = new Date().toISOString().split("T")[0]

    let query = admin
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        status
      `)
      .eq("status", "hr_approved")
      .gte("preferred_end_date", today)
      .lte("preferred_start_date", today)
      .order("preferred_start_date", { ascending: false })

    const { data: approvedLeaves, error } = await query

    if (error) {
      console.error("[v0] Failed to fetch active leaves:", error)
      return NextResponse.json({ error: "Failed to fetch active leaves" }, { status: 500 })
    }

    // Get staff details and map to format expected by client
    const leaveIds = (approvedLeaves || []).map(l => l.user_id)
    let staffMap: any = {}

    if (leaveIds.length > 0) {
      const { data: staffProfiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, department_id, departments(name)")
        .in("id", leaveIds)

      staffMap = Object.fromEntries(
        (staffProfiles || []).map(p => [
          p.id,
          {
            name: `${p.first_name} ${p.last_name}`,
            department: (p as any).departments?.name || "Unknown"
          }
        ])
      )
    }

    const leaves = (approvedLeaves || [])
      .filter(leave => {
        // HOD can only see their department's staff
        if (isHod && !isAdmin) {
          const staffDept = (staffMap[leave.user_id] as any)?.department_id
          return userProfile?.department_id === staffDept
        }
        return true
      })
      .map(leave => ({
        id: leave.id,
        user_id: leave.user_id,
        leave_plan_request_id: leave.id,
        leave_type_key: leave.leave_type_key,
        preferred_start_date: leave.preferred_start_date,
        preferred_end_date: leave.preferred_end_date,
        requested_days: leave.requested_days,
        status: leave.status,
        staff_name: staffMap[leave.user_id]?.name || "Unknown",
        department: staffMap[leave.user_id]?.department || "Unknown"
      }))

    return NextResponse.json({ leaves })
  } catch (error) {
    console.error("[v0] Failed to fetch active leaves:", error)
    return NextResponse.json({ error: "Failed to fetch active leaves" }, { status: 500 })
  }
}
