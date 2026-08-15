import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { resolveSelfLeaveRoute } from "@/lib/hr-workflow"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "200")
    const offset = parseInt(searchParams.get("offset") || "0")

    // Use leave_plan_requests which has leave_type_key, hod_decision, status, etc.
    // Join with unified_user_management view to get full staff details including rank, position, department
    // Also join with leave_resumption_confirmations for staff and HOD confirmation status
    let query = supabase.from("leave_plan_requests").select(`
      id,
      user_id,
      leave_type_key,
      preferred_start_date,
      preferred_end_date,
      adjusted_start_date,
      adjusted_end_date,
      requested_days,
      reason,
      adjusted_days,
      entitlement_days,
      travelling_days_added,
      leave_year_period,
      status,
      workflow_route,
      workflow_stage,
      hod_decision,
      staff_category,
      created_at,
      submitted_at,
      hr_approver_id,
      hr_approver_name,
      hr_approved_at,
      hr_signature_data_url,
      hr_signature_text,
      hr_signature_mode,
      memo_draft_subject,
      memo_draft_body,
      memo_subject,
      memo_body
    `, { count: "exact" })

    if (userId) query = query.eq("user_id", userId)
    if (status) query = query.eq("status", status)

    const { data: planRequests, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    // Enrich with user details from unified_user_management view
    const userIds = [...new Set((planRequests || []).map((r: any) => r.user_id).filter(Boolean))]
    
    const userMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("unified_user_management")
        .select("user_id, full_name, department_name, position, role, employee_id, assigned_location_id")
        .in("user_id", userIds)
      
      if (users) {
        users.forEach((u: any) => { userMap[u.user_id] = u })
      }
    }

    const profileMap: Record<string, any> = {}
    const locationIds: string[] = []
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("user_profiles").select("id, role, assigned_location_id").in("id", userIds)
      for (const profile of profiles || []) {
        profileMap[profile.id] = profile
        if (profile.assigned_location_id) locationIds.push(profile.assigned_location_id)
      }
    }
    const locationMap: Record<string, string> = {}
    if (locationIds.length > 0) {
      const { data: locations } = await supabase.from("geofence_locations").select("id, name").in("id", locationIds)
      for (const location of locations || []) locationMap[location.id] = location.name
    }
    for (const req of planRequests || []) {
      const profile = profileMap[req.user_id]
      const resolution = resolveSelfLeaveRoute({ role: profile?.role, locationName: locationMap[profile?.assigned_location_id] })
      if (resolution.isSelfLeave && (req.workflow_route !== "self_leave" || req.status === "pending_regional_hr_review" || req.status === "pending" || req.workflow_stage === "regional_hr_review" || req.workflow_stage === "hod_review")) {
        await supabase.from("leave_plan_requests").update({ status: "pending_hr_leave_processing", workflow_route: "self_leave", workflow_stage: "hr_leave_office" }).eq("id", req.id)
        req.status = "pending_hr_leave_processing"
        req.workflow_route = "self_leave"
        req.workflow_stage = "hr_leave_office"
      }
    }

    // Collect unique HR approver IDs (column is hr_approver_id) for profile join
    const hrApproverIds = [
      ...new Set(
        (planRequests || [])
          .map((r: any) => r.hr_approver_id)
          .filter(Boolean)
      )
    ] as string[]
    const hrApproverMap: Record<string, any> = {}
    const hrSignatureRegistryMap: Record<string, string> = {}

    if (hrApproverIds.length > 0) {
      // Primary: user_profiles for name, position, current signature
      const { data: hrUsers } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, position, signature_data_url")
        .in("id", hrApproverIds)
      if (hrUsers) {
        hrUsers.forEach((u: any) => { hrApproverMap[u.id] = u })
      }

      // Fallback: approval_signature_registry — captures signature at time of signing
      const { data: sigRegistry } = await supabase
        .from("approval_signature_registry")
        .select("user_id, signature_data_url")
        .in("user_id", hrApproverIds)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
      if (sigRegistry) {
        // Keep only the most recent entry per user (already sorted desc)
        sigRegistry.forEach((s: any) => {
          if (!hrSignatureRegistryMap[s.user_id] && s.signature_data_url) {
            hrSignatureRegistryMap[s.user_id] = s.signature_data_url
          }
        })
      }
    }

    // Attach resumption state to the leave-plan request. Older records may not
    // have leave_request_id populated, so retain a user/date fallback match.
    const confirmationMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: resumptions, error: resumptionError } = await supabase
        .from('leave_resumption_notifications')
        .select('id, leave_request_id, user_id, leave_end_date, confirmation_status, first_check_in_date, first_hod_rm_check_in_date')
        .in('user_id', userIds)

      if (resumptionError) {
        console.error('[v0] Failed to load resumption statuses:', resumptionError.message)
      } else {
        for (const resumption of resumptions || []) {
          const directKey = resumption.leave_request_id
          const dateKey = `${resumption.user_id}::${resumption.leave_end_date}`
          if (directKey) confirmationMap[directKey] = resumption
          confirmationMap[dateKey] = resumption
        }
      }
    }

    const data = (planRequests || []).map((req: any) => {
      const hrApprover = hrApproverMap[req.hr_approver_id] || null
      // Resolution order for signature:
      // 1. Row-level hr_signature_data_url (captured at approval time — most accurate)
      // 2. user_profiles.signature_data_url (current profile signature)
      // 3. approval_signature_registry (registry fallback)
      const resolvedSignature =
        req.hr_signature_data_url ||
        hrApprover?.signature_data_url ||
        (req.hr_approver_id ? hrSignatureRegistryMap[req.hr_approver_id] : null) ||
        null
      // hr_approver_name is already stored as text on the row — use it as fallback
      const resolvedHrName = hrApprover
        ? `${hrApprover.first_name || ""} ${hrApprover.last_name || ""}`.trim()
        : (req.hr_approver_name || null)
      
      const confirmation = confirmationMap[req.id] || confirmationMap[
        `${req.user_id}::${req.adjusted_end_date || req.preferred_end_date}`
      ] || null
      const confirmationStatus = confirmation?.confirmation_status || (
        confirmation?.first_check_in_date
          ? 'confirmed'
          : confirmation?.first_hod_rm_check_in_date
            ? 'pending_hr_manual'
            : null
      )

      return {
        ...req,
        leave_type: req.leave_type_key || "Annual",
        start_date: req.adjusted_start_date || req.preferred_start_date,
        end_date: req.adjusted_end_date || req.preferred_end_date,
        hod_review_status: req.hod_decision || "pending",
        staff_confirmed: Boolean(confirmation?.first_check_in_date),
        staff_confirmed_at: confirmation?.first_check_in_date || null,
        hod_confirmed: Boolean(confirmation?.first_hod_rm_check_in_date),
        hod_confirmed_at: confirmation?.first_hod_rm_check_in_date || null,
        confirmation_status: confirmationStatus,
        leave_resumption_id: confirmation?.id || null,
        user_profiles: userMap[req.user_id] ? {
          first_name: (userMap[req.user_id].full_name || "").split(" ")[0] || "",
          last_name: (userMap[req.user_id].full_name || "").split(" ").slice(1).join(" ") || "",
          employee_id: userMap[req.user_id].employee_id || "",
          department_name: userMap[req.user_id].department_name || "",
          position: userMap[req.user_id].position || "",
          full_name: userMap[req.user_id].full_name || "",
        } : null,
        // Resolved HR approver fields for the approved-leave memo view
        hr_approver_name: resolvedHrName,
        hr_approver_position: hrApprover?.position || null,
        hr_approver_signature_data_url: resolvedSignature,
      }
    })

    return NextResponse.json({ data, total: count, success: true })
  } catch (error) {
    console.error("[v0] Error fetching leave requests:", error)
    return NextResponse.json({ error: "Failed to fetch requests", success: false }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    // Generate a reference number
    const refNumber = `LR-${Date.now().toString(36).toUpperCase()}`

    const { data, error } = await supabase.from("leave_requests").insert([
      {
        user_id: body.userId,
        start_date: body.startDate,
        end_date: body.endDate,
        reason: body.reason || `${body.leaveType || "Annual"} Leave Request`,
        status: "pending",
        reference_number: refNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]).select()

    if (error) throw error

    // Return with leave_type added to the response
    const result = data[0] ? { ...data[0], leave_type: body.leaveType || "Annual Leave" } : null

    return NextResponse.json({ data: result, success: true }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating leave request:", error)
    return NextResponse.json({ error: "Failed to create request", success: false }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()

    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()

    if (error) throw error

    return NextResponse.json({ data: data[0], success: true })
  } catch (error) {
    console.error("[v0] Error updating leave request:", error)
    return NextResponse.json({ error: "Failed to update request", success: false }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    const { error } = await supabase.from("leave_requests").delete().eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting leave request:", error)
    return NextResponse.json({ error: "Failed to delete request", success: false }, { status: 500 })
  }
}
