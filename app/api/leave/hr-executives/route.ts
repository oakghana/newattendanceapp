import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// HR Executive roles that can receive forwarded leave requests
const HR_EXECUTIVE_ROLES = ["manager_hr", "director_hr"]

// GET: Fetch all HR executives (manager_hr, director_hr) for forwarding selector
export async function GET(request: Request) {
  try {
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const withPendingOnly = searchParams.get("with_pending_only") === "true"

    // Fetch HR executives
    let query = supabase
      .from("user_profiles")
      .select(`
        id,
        first_name,
        last_name,
        email,
        role,
        employee_id,
        department_id,
        is_active,
        departments (
          name
        )
      `)
      .in("role", HR_EXECUTIVE_ROLES)
      .eq("is_active", true)

    // If with_pending_only is true, only fetch executives with pending forwarded requests
    if (withPendingOnly) {
      const { data: executivesWithPending } = await supabase
        .from("leave_plan_requests")
        .select("hr_approver_id")
        .in("status", ["hod_approved", "manager_confirmed", "hr_office_forwarded"])
        .neq("hr_approver_id", null)

      const executiveIds = [...new Set((executivesWithPending || []).map((r: any) => r.hr_approver_id))]
      if (executiveIds.length === 0) {
        return NextResponse.json({ executives: [], grouped: { manager_hr: [], director_hr: [] } })
      }
      query = query.in("id", executiveIds)
    }

    const { data: executives, error } = await query.order("role").order("first_name")

    if (error) {
      console.error("[v0] Error fetching HR executives:", error)
      return NextResponse.json({ executives: [], error: error.message }, { status: 500 })
    }

    if (!executives || executives.length === 0) {
      console.warn("[v0] No HR executives found for roles:", HR_EXECUTIVE_ROLES)
      return NextResponse.json({ executives: [], grouped: { manager_hr: [], director_hr: [] } })
    }

    // Format executives for dropdown
    const formattedExecutives = (executives || []).map((exec: any) => ({
      id: exec.id,
      name: `${exec.first_name || ""} ${exec.last_name || ""}`.trim() || exec.email,
      email: exec.email,
      role: exec.role,
      role_label: exec.role === "manager_hr" ? "Manager HR" : "Director HR",
      employee_id: exec.employee_id,
      department: exec.departments?.name || null,
    }))

    // Group by role for better UI
    const managerHrExecs = formattedExecutives.filter((e: any) => e.role === "manager_hr")
    const directorHrExecs = formattedExecutives.filter((e: any) => e.role === "director_hr")

    console.log("[v0] Fetched HR executives:", { total: formattedExecutives.length, manager_hr: managerHrExecs.length, director_hr: directorHrExecs.length })

    return NextResponse.json({
      executives: formattedExecutives,
      grouped: {
        manager_hr: managerHrExecs,
        director_hr: directorHrExecs,
      },
    })
  } catch (error) {
    console.error("[v0] Failed to fetch HR executives:", error)
    return NextResponse.json({ error: "Failed to fetch HR executives", executives: [] }, { status: 500 })
  }
}
