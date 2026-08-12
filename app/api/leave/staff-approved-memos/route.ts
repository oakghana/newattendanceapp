import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")
    const userRole = searchParams.get("user_role")
    const userDepartment = searchParams.get("user_department")

    if (!userId || !userRole) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
    const isHodOrRm = ["department_head", "regional_manager"].includes(normalizedRole)
    const isHrExecutive = ["director_hr", "manager_hr", "admin", "hr_leave_office", "hr_office"].includes(normalizedRole)

    if (!isHodOrRm && !isHrExecutive) {
      return NextResponse.json(
        { error: "Only HOD/RM or HR Executives can view approved memos" },
        { status: 403 }
      )
    }

    let staffIds: string[] = []

    // HR Executives see ALL approved memos across the organization
    if (isHrExecutive) {
      // Fetch all approved requests without staff filter
      const { data: approvedRequests, error: requestError } = await supabase
        .from("leave_plan_requests")
        .select(`
          id,
          user_id,
          preferred_start_date,
          preferred_end_date,
          adjusted_start_date,
          adjusted_end_date,
          leave_type_key,
          reason,
          status,
          created_at,
          adjusted_days,
          requested_days,
          hr_approver_name,
          hr_approved_at,
          hr_office_reviewer_name,
          hr_office_reviewed_at,
          hr_signature_image_url,
          hr_signature_data_url,
          hr_approver_signature_data_url,
          hr_approver_position,
          hr_approval_note,
          memo_token
        `)
        .in("status", ["approved", "hr_approved"])
        .order("hr_approved_at", { ascending: false, nullsFirst: false })
        .limit(200)

      if (requestError) {
        throw new Error(requestError.message)
      }

      if (!approvedRequests || approvedRequests.length === 0) {
        return NextResponse.json({ memos: [] })
      }

      // Get all user IDs from requests
      const userIds = [...new Set(approvedRequests.map((r: any) => r.user_id))]

      // Fetch user profiles
      const { data: profilesData, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, email, employee_id, department_id, assigned_location_id, departments(name)")
        .in("id", userIds)

      if (profileError) {
        console.error("[v0] Profile fetch error:", profileError)
      }

      const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]))

      const memos = (approvedRequests || []).map((req: any) => {
        const profile = profileMap.get(req.user_id) || {}
        return {
          id: String(req.id),
          leave_plan_request_id: String(req.id),
          user_id: String(req.user_id),
          staff_name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown",
          employee_id: (profile as any).employee_id || "N/A",
          email: (profile as any).email || "N/A",
          department: (profile as any).departments?.name || "N/A",
          location: "Not Assigned",
          address: "N/A",
          leave_type: req.leave_type_key || "annual",
          start_date: req.adjusted_start_date || req.preferred_start_date,
          end_date: req.adjusted_end_date || req.preferred_end_date,
          days: req.adjusted_days || req.requested_days || 0,
          reason: req.reason || "",
          status: req.status,
          created_at: req.created_at,
          hr_approver_name: req.hr_approver_name,
          hr_approved_at: req.hr_approved_at,
          hr_office_reviewer_name: req.hr_office_reviewer_name,
          hr_office_reviewed_at: req.hr_office_reviewed_at,
          hr_signature_image_url: req.hr_signature_image_url,
          hr_signature_data_url: req.hr_signature_data_url,
          hr_approver_signature_data_url: req.hr_approver_signature_data_url,
          hr_approver_position: req.hr_approver_position,
          memo_token: req.memo_token || null,
        }
      })

      return NextResponse.json({ memos })
    }

    // Get staff under this HOD/RM
    if (normalizedRole === "department_head" && userDepartment) {
      const { data: staffProfiles, error: staffError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("department_id", userDepartment)
        .neq("id", userId)

      if (staffError) {
        throw new Error(staffError.message)
      }

      staffIds = (staffProfiles || []).map((p: any) => p.id)
    } else if (normalizedRole === "regional_manager") {
      // Get staff assigned to this regional manager's locations
      const { data: rmLocations, error: locError } = await supabase
        .from("user_profiles")
        .select("assigned_location_id")
        .eq("id", userId)
        .single()

      if (locError || !rmLocations?.assigned_location_id) {
        return NextResponse.json({ memos: [] })
      }

      const { data: staffProfiles, error: staffError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("assigned_location_id", rmLocations.assigned_location_id)
        .neq("id", userId)

      if (staffError) {
        throw new Error(staffError.message)
      }

      staffIds = (staffProfiles || []).map((p: any) => p.id)
    }

    if (staffIds.length === 0) {
      return NextResponse.json({ memos: [] })
    }

    // Fetch approved leave requests for these staff - simplified to avoid relationship ambiguity
    const { data: approvedRequests, error: requestError } = await supabase
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        leave_type_key,
        reason,
        status,
        created_at,
        hr_approver_name,
        hr_approved_at,
        hr_office_reviewer_name,
        hr_office_reviewed_at,
        hr_signature_image_url,
        hr_signature_data_url,
        hr_approver_signature_data_url,
        hr_approver_position,
        hr_approval_note,
        memo_token
      `)
      .in("user_id", staffIds)
      .in("status", ["approved", "hr_approved"])
      .order("created_at", { ascending: false })

    if (requestError) {
      throw new Error(requestError.message)
    }

    if (!approvedRequests || approvedRequests.length === 0) {
      return NextResponse.json({ memos: [] })
    }

    // Fetch user profiles and location data separately
    const { data: profilesData, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, email, assigned_location_id")
      .in("id", staffIds)

    if (profileError) {
      console.error("[v0] Profile fetch error:", profileError)
    }

    // Create profile map for fast lookup
    const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]))

    const memos = (approvedRequests || []).map((req: any) => {
      const profile = profileMap.get(req.user_id) || {}
      return {
        id: String(req.id),
        leave_plan_request_id: String(req.id),
        user_id: String(req.user_id),
        staff_name: `${(profile as any).first_name || ""} ${(profile as any).last_name || ""}`.trim() || "Unknown",
        email: (profile as any).email || "N/A",
        location: "Not Assigned",
        address: "N/A",
        leave_type: req.leave_type_key || "annual",
        start_date: req.adjusted_start_date || req.preferred_start_date,
        end_date: req.adjusted_end_date || req.preferred_end_date,
        reason: req.reason || "",
        status: req.status,
        created_at: req.created_at,
        hr_approver_name: req.hr_approver_name,
        hr_approved_at: req.hr_approved_at,
        hr_signature_image_url: req.hr_signature_image_url,
        hr_signature_data_url: req.hr_signature_data_url,
        hr_approver_signature_data_url: req.hr_approver_signature_data_url,
        hr_approver_position: req.hr_approver_position,
        memo_token: req.memo_token || null,
      }
    })

    return NextResponse.json({ memos })
  } catch (error) {
    console.error("[v0] Staff approved memos error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch approved memos" },
      { status: 500 }
    )
  }
}
