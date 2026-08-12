import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get HR executive's profile including department
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role, department_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Check if user is HR executive
    const role = String(profile.role || "").toLowerCase().trim()
    const isHrExecutive = ["director_hr", "manager_hr", "hr_executive", "hr_director"].includes(role)

    if (!isHrExecutive) {
      return NextResponse.json({ error: "Only HR executives can view staff requests" }, { status: 403 })
    }

    // Fetch ALL pending leave requests in HR executive review stages
    // HR executives should see requests that have been forwarded by the HR Leave Office
    // or are awaiting HR approval (not just their department — they review org-wide)
    const pendingStatuses = [
      "hr_office_forwarded",
      "manager_confirmed",
      "hod_approved",
      "pending_hr_decision",
      "pending_hr_review",
      "pending_hr_approval",
    ]
    
    const { data: requests, error: requestsError } = await admin
      .from("leave_plan_requests")
      .select(`
        id,
        user_id,
        preferred_start_date,
        preferred_end_date,
        adjusted_start_date,
        adjusted_end_date,
        reason,
        leave_type_key,
        status,
        created_at,
        user_profiles:user_id (
          id,
          first_name,
          last_name,
          employee_id,
          department_id,
          departments:department_id (
            name
          )
        )
      `)
      .in("status", pendingStatuses)
      .order("created_at", { ascending: false })

    if (requestsError) {
      console.error("[api] Error fetching staff requests:", requestsError)
      return NextResponse.json({ error: requestsError.message }, { status: 500 })
    }

    // Count approved requests from current HR user
    const { data: myApproved } = await admin
      .from("leave_plan_requests")
      .select("id")
      .eq("reviewed_by_id", user.id)
      .eq("status", "approved")

    // Format response
    const staffRequests = (requests || []).map((req: any) => ({
      id: String(req.id),
      user_id: String(req.user_id),
      staff_name: `${req.user_profiles?.first_name || ""} ${req.user_profiles?.last_name || ""}`.trim(),
      staff_id: req.user_profiles?.employee_id || "",
      department: req.user_profiles?.departments?.name || "",
      start_date: req.preferred_start_date,
      end_date: req.preferred_end_date,
      reason: req.reason || "",
      leave_type: req.leave_type_key || "annual",
      status: req.status,
      created_at: req.created_at,
    }))

    return NextResponse.json({
      requests: staffRequests,
      stats: {
        pending: staffRequests.filter(r => r.status !== "approved").length,
        approved: myApproved?.length || 0,
      },
    })
  } catch (error) {
    console.error("[api] Error in hr-staff-pending-requests:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
