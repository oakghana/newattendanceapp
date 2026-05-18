import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { month } = await request.json()

    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      )
    }

    // Parse month boundaries
    const [year, monthNum] = month.split("-")
    const monthStart = `${year}-${monthNum}-01`
    const monthEnd = new Date(parseInt(year), parseInt(monthNum), 0)
      .toISOString()
      .split("T")[0]

    // Query staff on annual leave for this month
    // Status can be: approved, hr_approved, hod_approved (all are approved states)
    const { data: staffOnLeave, error } = await supabase
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        staff_category,
        preferred_start_date,
        preferred_end_date,
        leave_type_key,
        status
      `
      )
      .eq("leave_type_key", "annual")
      .in("status", ["approved", "hr_approved", "hod_approved"])
      .lte("preferred_start_date", monthEnd)
      .gte("preferred_end_date", monthStart)

    if (error) {
      console.error("[v0] Error querying staff:", error)
      return NextResponse.json(
        { error: "Failed to query staff", details: error.message },
        { status: 500 }
      )
    }

    // Get user IDs and fetch user profiles separately
    const userIds = (staffOnLeave || []).map((r: any) => r.user_id).filter(Boolean)
    
    let userProfiles: any[] = []
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, full_name, employee_id, department_name, position, role")
        .in("id", userIds)

      if (profileError) {
        console.error("[v0] Error querying user profiles:", profileError)
      } else {
        userProfiles = profiles || []
      }
    }

    // Create a map of user profiles for easy lookup
    const profileMap = new Map(userProfiles.map((p: any) => [p.id, p]))

    // Function to derive staff_category from role/position if NULL
    const deriveStaffCategory = (record: any, profile: any): string => {
      // If staff_category is already set, use it
      if (record.staff_category) return record.staff_category

      // Otherwise derive from role or position
      if (profile?.role) {
        const role = String(profile.role).toLowerCase()
        if (role.includes("director") || role.includes("manager")) return "Manager"
        if (role.includes("senior") || role.includes("snr")) return "Senior"
      }

      if (profile?.position) {
        const position = String(profile.position).toLowerCase()
        if (position.includes("director") || position.includes("manager")) return "Manager"
        if (position.includes("senior") || position.includes("snr")) return "Senior"
      }

      // Default to Junior if no match
      return "Junior"
    }

    const formatted = (staffOnLeave || []).map((record: any) => {
      const profile = profileMap.get(record.user_id)
      const staffCategory = deriveStaffCategory(record, profile)

      return {
        id: record.id,
        full_name: profile?.full_name || "Unknown",
        employee_id: profile?.employee_id || "N/A",
        department_name: profile?.department_name || "N/A",
        position: profile?.position || "N/A",
        staff_category: staffCategory,
        start_date: record.preferred_start_date,
        end_date: record.preferred_end_date,
        leave_type: record.leave_type_key,
      }
    })

    return NextResponse.json({
      success: true,
      staff: formatted,
      count: formatted.length,
    })
  } catch (err) {
    console.error("[v0] Error in detect-staff API:", err)
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    )
  }
}
