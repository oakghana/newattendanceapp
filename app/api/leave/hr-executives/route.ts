import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// HR Executive roles that can receive forwarded leave requests
const HR_EXECUTIVE_ROLES = ["manager_hr", "director_hr"]

// GET: Fetch all HR executives (manager_hr, director_hr) for forwarding selector
export async function GET() {
  try {
    const supabase = await createAdminClient()

    // Fetch HR executives
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
        departments (
          name
        )
      `)
      .in("role", HR_EXECUTIVE_ROLES)
      .order("role")
      .order("first_name")

    if (error) {
      console.error("[v0] Error fetching HR executives:", error)
      throw error
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

    return NextResponse.json({
      executives: formattedExecutives,
      grouped: {
        manager_hr: managerHrExecs,
        director_hr: directorHrExecs,
      },
    })
  } catch (error) {
    console.error("[v0] Failed to fetch HR executives:", error)
    return NextResponse.json({ error: "Failed to fetch HR executives" }, { status: 500 })
  }
}
