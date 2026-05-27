import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// HR Executive roles that can approve/sign payment memos
// These are users who should be able to receive and approve payment advice memos
const HR_EXECUTIVE_ROLES = ["hr_executive", "manager_hr", "director_hr", "hr_manager", "hr_officer", "hr_director", "manager"]

// GET: Fetch all HR executives (manager_hr, director_hr) for forwarding selector
export async function GET() {
  try {
    const supabase = await createAdminClient()

    // Fetch HR executives with their position information
    const { data: executives, error } = await supabase
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
        position,
        departments (
          name
        )
      `)
      .in("role", HR_EXECUTIVE_ROLES)
      .eq("is_active", true)
      .order("role")
      .order("first_name")

    if (error) {
      console.error("[v0] Error fetching HR executives:", error)
      return NextResponse.json({ executives: [], error: error.message }, { status: 500 })
    }

    if (!executives || executives.length === 0) {
      console.warn("[v0] No HR executives found in database for roles:", HR_EXECUTIVE_ROLES)
      console.warn("[v0] Looking for executives with roles:", HR_EXECUTIVE_ROLES.join(", "))
      return NextResponse.json({ executives: [], grouped: { manager_hr: [], director_hr: [] } })
    }

    // Format executives for dropdown - use position field instead of role_label
    const formattedExecutives = (executives || []).map((exec: any) => ({
      id: exec.id,
      name: `${exec.first_name || ""} ${exec.last_name || ""}`.trim() || exec.email,
      email: exec.email,
      role: exec.role,
      position: exec.position || (exec.role === "manager_hr" ? "MANAGER HR" : "DIRECTOR HR"),
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
