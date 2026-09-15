import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// HR roles that can initiate deferment/recall for ANY staff member, in any
// department, anywhere in the country. This mirrors HR_ADMIN_ROLES in
// /api/leave/deferment-recall/all so the "eligible leave" list and the
// "existing requests" list always agree on who has nationwide access.
const NATIONWIDE_ROLES = [
  "hr_leave_office",
  "admin",
  "manager_hr",
  "director_hr",
  "hr_director",
  "hr_officer",
  "hr_office",
  "hr",
  "hr_executive",
]

// Regional HR Office staff act on behalf of every staff member assigned to
// their region/location, but not staff outside their region.
const REGIONAL_HR_ROLES = [
  "regional_hr",
  "regional_hr_officer",
  "regional_hr_office",
  "regional_hr_leave_office",
  "regional_leave_office",
]

const ELIGIBLE_STATUSES = ["approved", "hr_approved", "regional_manager_approved"]

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    const userRole = String(searchParams.get("user_role") || "").toLowerCase().replace(/[-\s]+/g, "_")

    if (!userId || !userRole) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const isNationwide = NATIONWIDE_ROLES.includes(userRole)
    const isRegionalHr = REGIONAL_HR_ROLES.includes(userRole)
    const isDepartmentHead = userRole === "department_head"
    const isRegionalManager = userRole === "regional_manager"

    if (!isNationwide && !isRegionalHr && !isDepartmentHead && !isRegionalManager) {
      return NextResponse.json({ error: "Not authorized to view staff leave for deferment/recall" }, { status: 403 })
    }

    // Resolve the acting user's own scope (department/location) unless they
    // have nationwide access, in which case no scoping is required.
    let scopeDepartmentId: string | null = null
    let scopeLocationId: string | null = null

    if (!isNationwide) {
      const { data: actingProfile, error: actingErr } = await supabase
        .from("user_profiles")
        .select("department_id, assigned_location_id")
        .eq("id", userId)
        .single()

      if (actingErr || !actingProfile) {
        return NextResponse.json({ requests: [] })
      }

      if (isDepartmentHead) scopeDepartmentId = actingProfile.department_id || null
      if (isRegionalManager || isRegionalHr) scopeLocationId = actingProfile.assigned_location_id || null

      if (isDepartmentHead && !scopeDepartmentId) return NextResponse.json({ requests: [] })
      if ((isRegionalManager || isRegionalHr) && !scopeLocationId) return NextResponse.json({ requests: [] })
    }

    // Find the staff pool this actor may act on.
    let staffQuery = supabase
      .from("user_profiles")
      .select("id, first_name, last_name, position, employee_id, department_id, assigned_location_id, departments(name)")
      .neq("id", userId)

    if (isDepartmentHead && scopeDepartmentId) {
      staffQuery = staffQuery.eq("department_id", scopeDepartmentId)
    } else if ((isRegionalManager || isRegionalHr) && scopeLocationId) {
      staffQuery = staffQuery.eq("assigned_location_id", scopeLocationId)
    }
    // isNationwide: no filter, all staff eligible

    const { data: staffProfiles, error: staffError } = await staffQuery

    if (staffError) {
      console.error("[v0] approved-staff-leave staff fetch error:", staffError)
      return NextResponse.json({ error: staffError.message }, { status: 500 })
    }

    const staffIds = (staffProfiles || []).map((p: any) => p.id)
    if (staffIds.length === 0) {
      return NextResponse.json({ requests: [] })
    }

    const profileMap = new Map((staffProfiles || []).map((p: any) => [p.id, p]))
    const locationIds = [...new Set((staffProfiles || []).map((p: any) => p.assigned_location_id).filter(Boolean))]
    const { data: locationsData } = locationIds.length
      ? await supabase.from("geofence_locations").select("id, name, location_code").in("id", locationIds)
      : { data: [] as any[] }
    const locationMap = new Map((locationsData || []).map((l: any) => [l.id, l.name || l.location_code]))

    const { data: approved, error: approvedError } = await supabase
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        status
      `)
      .in("user_id", staffIds)
      .in("status", ELIGIBLE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(300)

    if (approvedError) {
      console.error("[v0] approved-staff-leave leave fetch error:", approvedError)
      return NextResponse.json({ error: approvedError.message }, { status: 500 })
    }

    const requests = (approved || []).map((req: any) => {
      const profile = profileMap.get(req.user_id) || {}
      return {
        id: String(req.id),
        user_id: String(req.user_id),
        user_name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown",
        rank: profile.position || "",
        department: (profile as any).departments?.name || "",
        location: locationMap.get((profile as any).assigned_location_id) || "",
        leave_type: req.leave_type_key || "annual",
        start_date: req.adjusted_start_date || req.preferred_start_date,
        end_date: req.adjusted_end_date || req.preferred_end_date,
        status: req.status,
      }
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error("[v0] approved-staff-leave error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
