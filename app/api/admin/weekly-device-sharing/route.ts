import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

type RoleProfile = {
  role: string
  department_id: string | null
}

async function getAuthorizedProfile() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { supabase, profile: null as RoleProfile | null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "admin" && profile.role !== "department_head")) {
    return {
      supabase,
      profile: null as RoleProfile | null,
      error: NextResponse.json({ error: "Forbidden: Admin or Department Head access required" }, { status: 403 }),
    }
  }

  return { supabase, profile: profile as RoleProfile, error: null as NextResponse | null }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile, error } = await getAuthorizedProfile()
    if (error || !profile) return error

    // Get filter parameters from query string
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get("location_id")
    const departmentId = searchParams.get("department_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    // Set date range (default to last 7 days)
    const defaultStartDate = new Date()
    defaultStartDate.setDate(defaultStartDate.getDate() - 7)
    
    const filterStartDate = startDate ? new Date(startDate) : defaultStartDate
    const filterEndDate = endDate ? new Date(endDate) : new Date()

    let deviceSessionsQuery = supabase
      .from("device_sessions")
      .select("device_id, ip_address, user_id, created_at")
      .gte("created_at", filterStartDate.toISOString())
      .lte("created_at", filterEndDate.toISOString())
      .order("created_at", { ascending: false })

    const { data: deviceSessions, error: sessionsError } = await deviceSessionsQuery

    if (sessionsError) {
      console.error("[v0] Error fetching device sessions:", sessionsError)
      return NextResponse.json({ error: "Failed to fetch device sessions", data: [] }, { status: 200 })
    }

    if (!deviceSessions || deviceSessions.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const userIds = [...new Set(deviceSessions.map((s) => s.user_id))]
    let userProfilesQuery = supabase
      .from("user_profiles")
      .select(
        "id, first_name, last_name, email, department_id, assigned_location_id, departments(name), geofence_locations(name)",
      )
      .in("id", userIds)

    // Apply department filter
    if (departmentId) {
      userProfilesQuery = userProfilesQuery.eq("department_id", departmentId)
    }

    // Apply location filter
    if (locationId) {
      userProfilesQuery = userProfilesQuery.eq("assigned_location_id", locationId)
    }

    const { data: userProfiles, error: profilesError } = await userProfilesQuery

    if (profilesError) {
      console.error("[v0] Error fetching user profiles:", profilesError)
      return NextResponse.json({ error: "Failed to fetch user profiles", data: [] }, { status: 200 })
    }

    const profileMap = new Map(userProfiles?.map((p) => [p.id, p]) || [])

    const deviceMap = new Map<
      string,
      {
        device_id: string
        ip_address: string | null
        users: Set<string>
        departments: Set<string>
        locations: Set<string>
        userDetails: Array<{
          user_id: string
          first_name: string
          last_name: string
          email: string
          department_id: string | null
          assigned_location_id: string | null
          department_name: string
          location_name: string
          last_used: string
        }>
      }
    >()

    for (const session of deviceSessions) {
      const key = session.device_id || session.ip_address
      if (!key) continue

      const userProfile = profileMap.get(session.user_id)
      if (!userProfile) continue

      // Filter by department for department heads
      if (profile.role === "department_head") {
        if (userProfile.department_id !== profile.department_id) {
          continue
        }
      }

      if (!deviceMap.has(key)) {
        deviceMap.set(key, {
          device_id: session.device_id,
          ip_address: session.ip_address,
          users: new Set(),
          departments: new Set(),
          locations: new Set(),
          userDetails: [],
        })
      }

      const device = deviceMap.get(key)!
      if (!device.users.has(session.user_id)) {
        device.users.add(session.user_id)
        device.departments.add(userProfile.department_id || "unknown")
        device.locations.add(userProfile.assigned_location_id || "unknown")
        device.userDetails.push({
          user_id: session.user_id,
          first_name: userProfile.first_name,
          last_name: userProfile.last_name,
          email: userProfile.email,
          department_id: userProfile.department_id || null,
          assigned_location_id: userProfile.assigned_location_id || null,
          department_name: userProfile.departments?.name || "Unknown",
          location_name: userProfile.geofence_locations?.name || "Unassigned",
          last_used: session.created_at,
        })
      }
    }

    const sharedDevices = Array.from(deviceMap.values())
      .filter((device) => {
        if (device.users.size <= 1) return false

        const sameDepartment = device.departments.size === 1
        const sameLocation = device.locations.size === 1

        // Sharing is only acceptable when all users are in same department AND same location.
        return !(sameDepartment && sameLocation)
      })
      .map((device) => ({
        device_id: device.device_id,
        ip_address: device.ip_address,
        user_count: device.users.size,
        department_count: device.departments.size,
        location_count: device.locations.size,
        same_department_only: device.departments.size === 1,
        same_location_only: device.locations.size === 1,
        risk_level:
          device.locations.size > 1
            ? device.users.size >= 3
              ? "critical"
              : "high"
            : device.users.size >= 5
              ? "high"
              : "medium",
        users: device.userDetails,
        first_detected: device.userDetails.reduce(
          (earliest, user) => (user.last_used < earliest ? user.last_used : earliest),
          device.userDetails[0].last_used,
        ),
        last_detected: device.userDetails.reduce(
          (latest, user) => (user.last_used > latest ? user.last_used : latest),
          device.userDetails[0].last_used,
        ),
      }))
      .sort((a, b) => b.user_count - a.user_count)

    return NextResponse.json({ data: sharedDevices })
  } catch (error) {
    console.error("Weekly device sharing error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { supabase, profile, error } = await getAuthorizedProfile()
    if (error || !profile) return error

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Only admins can reset device sharing defaulters" }, { status: 403 })
    }

    const { error: violationsError, count: violationsDeleted } = await supabase
      .from("device_security_violations")
      .delete({ count: "exact" })
      .in("violation_type", ["weekly_sharing", "shared_device", "device_sharing"]) 

    if (violationsError) {
      console.error("[v0] Reset defaulters - violations delete error:", violationsError)
      return NextResponse.json({ error: "Failed to clear existing device sharing violations" }, { status: 500 })
    }

    const { error: sessionsError, count: sessionsDeleted } = await supabase
      .from("device_sessions")
      .delete({ count: "exact" })
      .neq("user_id", "00000000-0000-0000-0000-000000000000")

    if (sessionsError) {
      console.error("[v0] Reset defaulters - sessions delete error:", sessionsError)
      return NextResponse.json({ error: "Violations were cleared but device session reset failed" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Device sharing defaulters reset successfully. Monitoring is now fresh.",
      cleared: {
        violations: violationsDeleted || 0,
        sessions: sessionsDeleted || 0,
      },
    })
  } catch (error) {
    console.error("Reset weekly device sharing error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
