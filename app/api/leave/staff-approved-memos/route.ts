import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { getLeaveMemoAccess } from "@/lib/leave-memo-access"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: viewerProfile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, department_id, assigned_location_id, region_id")
      .eq("id", user.id)
      .maybeSingle()
    if (profileError || !viewerProfile) return NextResponse.json({ error: "Profile not found" }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get("user_id")
    if (requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json({ error: "You may only request memo access for your signed-in account." }, { status: 403 })
    }
    const userId = user.id
    const userRole = String(viewerProfile.role || "")
    const userDepartment = viewerProfile.department_id

    const normalizedRole = userRole.toLowerCase().replace(/[-\s]+/g, "_")
  const isHodOrRm = ["department_head", "transport_manager", "regional_manager", "regional_manager_officer"].includes(normalizedRole)
  const isRegionalHr = ["regional_hr", "regional_hr_officer", "regional_hr_office", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole)
  const isHrExecutive = ["director_hr", "manager_hr", "admin", "hr_leave_office", "leave_loan_officer", "hr_office"].includes(normalizedRole)

  if (!isHodOrRm && !isRegionalHr && !isHrExecutive) {
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
          workflow_stage,
          workflow_route,
          staff_category,
          memo_reference_locked,
          created_at,
          adjusted_days,
          requested_days,
          hr_approver_name,
          hr_approved_at,
          hr_office_reviewer_name,
          hr_office_reviewed_at,
          hr_signature_image_url,
          hr_signature_data_url,
          hr_approval_note,
          memo_token,
          memo_reference
        `)
        .in("status", ["approved", "hr_approved", "regional_manager_approved"])
        .not("memo_reference", "is", null)
        .neq("memo_reference", "")
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
        .select("id, first_name, last_name, email, employee_id, department_id, assigned_location_id, staff_category, position, departments(name)")
        .in("id", userIds)

      if (profileError) {
        console.error("[v0] Profile fetch error:", profileError)
      }

      const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]))
      const locationIds = [...new Set((profilesData || []).map((p: any) => p.assigned_location_id).filter(Boolean))]
      const { data: locationsData } = locationIds.length
        ? await admin.from("geofence_locations").select("id, name, location_code").in("id", locationIds)
        : { data: [] }
      const locationMap = new Map((locationsData || []).map((location: any) => [location.id, location.name || location.location_code]))

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
          location_id: (profile as any).assigned_location_id || null,
          location: locationMap.get((profile as any).assigned_location_id) || "Not Assigned",
          address: "N/A",
          leave_type: req.leave_type_key || "annual",
          start_date: req.adjusted_start_date || req.preferred_start_date,
          end_date: req.adjusted_end_date || req.preferred_end_date,
          days: req.adjusted_days || req.requested_days || 0,
          reason: req.reason || "",
          status: req.status,
          workflow_route: req.workflow_route || null,
          workflow_stage: req.workflow_stage || null,
          staff_category: req.staff_category || (profile as any).staff_category || null,
          staff_position: (profile as any).position || null,
          memo_reference_locked: req.memo_reference_locked === true,
          created_at: req.created_at,
          hr_approver_name: req.hr_approver_name,
          hr_approved_at: req.hr_approved_at,
          hr_office_reviewer_name: req.hr_office_reviewer_name,
          hr_office_reviewed_at: req.hr_office_reviewed_at,
          hr_signature_image_url: req.hr_signature_image_url,
          hr_signature_data_url: req.hr_signature_data_url,
          memo_token: req.memo_token || null,
          memo_reference: req.memo_reference || null,
        }
      })
      const downloadableMemos = memos.filter((memo: any) => getLeaveMemoAccess({
        status: memo.status,
        workflowStage: memo.workflow_stage,
        workflowRoute: memo.workflow_route,
        leaveType: memo.leave_type,
        leaveStartDate: memo.start_date,
        staffCategory: memo.staff_category,
        staffPosition: memo.staff_position,
        memoReference: memo.memo_reference,
        memoReferenceLocked: memo.memo_reference_locked,
      }).canDownload)

      return NextResponse.json({ memos: downloadableMemos })
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
    } else if (["regional_manager", "regional_manager_officer"].includes(normalizedRole) || isRegionalHr) {
      // Regional managers and Regional HR Office users get memos for staff in their assigned location.
      // Get staff assigned to this regional manager/Regional HR user's location
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
        workflow_stage,
        workflow_route,
        staff_category,
        memo_reference_locked,
        created_at,
        hr_approver_name,
        hr_approved_at,
        hr_office_reviewer_name,
        hr_office_reviewed_at,
        hr_signature_image_url,
        hr_signature_data_url,
        hr_approval_note,
        memo_token,
        memo_reference
      `)
      .in("user_id", staffIds)
      .in("status", ["approved", "hr_approved", "regional_manager_approved"])
      .not("memo_reference", "is", null)
        .neq("memo_reference", "")
      .order("created_at", { ascending: false })

    if (requestError) {
      throw new Error(requestError.message)
    }

    if (!approvedRequests || approvedRequests.length === 0) {
      return NextResponse.json({ memos: [] })
    }

    // Fetch user profiles and location data separately
    const { data: profilesData, error: profileFetchError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, email, assigned_location_id, staff_category, position")
      .in("id", staffIds)

    if (profileFetchError) {
      console.error("[v0] Profile fetch error:", profileFetchError)
    }

    // Create profile map for fast lookup
    const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]))
    const locationIds = [...new Set((profilesData || []).map((p: any) => p.assigned_location_id).filter(Boolean))]
    const { data: locationsData } = locationIds.length
      ? await admin.from("geofence_locations").select("id, name, location_code").in("id", locationIds)
      : { data: [] }
    const locationMap = new Map((locationsData || []).map((location: any) => [location.id, location.name || location.location_code]))

    const memos = (approvedRequests || []).map((req: any) => {
      const profile = profileMap.get(req.user_id) || {}
      return {
        id: String(req.id),
        leave_plan_request_id: String(req.id),
        user_id: String(req.user_id),
        staff_name: `${(profile as any).first_name || ""} ${(profile as any).last_name || ""}`.trim() || "Unknown",
        email: (profile as any).email || "N/A",
        location_id: (profile as any).assigned_location_id || null,
        location: locationMap.get((profile as any).assigned_location_id) || "Not Assigned",
        address: "N/A",
        leave_type: req.leave_type_key || "annual",
        start_date: req.adjusted_start_date || req.preferred_start_date,
        end_date: req.adjusted_end_date || req.preferred_end_date,
        days: req.adjusted_days || req.requested_days || 0,
        reason: req.reason || "",
        status: req.status,
        workflow_route: req.workflow_route || null,
        workflow_stage: req.workflow_stage || null,
        staff_category: req.staff_category || (profile as any).staff_category || null,
        staff_position: (profile as any).position || null,
        memo_reference_locked: req.memo_reference_locked === true,
        created_at: req.created_at,
        hr_approver_name: req.hr_approver_name,
        hr_approved_at: req.hr_approved_at,
        hr_signature_image_url: req.hr_signature_image_url,
        hr_signature_data_url: req.hr_signature_data_url,
        memo_token: req.memo_token || null,
        memo_reference: req.memo_reference || null,
      }
      })
      const downloadableMemos = memos.filter((memo: any) => getLeaveMemoAccess({
        status: memo.status,
        workflowStage: memo.workflow_stage,
        workflowRoute: memo.workflow_route,
        leaveType: memo.leave_type,
        leaveStartDate: memo.start_date,
        staffCategory: memo.staff_category,
        staffPosition: memo.staff_position,
        memoReference: memo.memo_reference,
        memoReferenceLocked: memo.memo_reference_locked,
      }).canDownload)

      return NextResponse.json({ memos: downloadableMemos })
    } catch (error) {
    console.error("[v0] Staff approved memos error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch approved memos" },
      { status: 500 }
    )
  }
}
