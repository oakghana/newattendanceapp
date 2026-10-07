import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { calculateRequestedDays } from "@/lib/leave-planning"

function isSchemaIssue(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "").toLowerCase()
  return code === "PGRST205" || code === "PGRST108" || code === "42P01" || code === "42703" || message.includes("does not exist")
}

function schemaIssueResponse(error?: any) {
  const code = error?.code || "unknown"
  const message = String(error?.message || "Database schema error")
  return NextResponse.json(
    {
      error: `Database error (${code}): ${message}`,
      databaseCode: code,
      needsSchemaCacheRefresh: true,
    },
    { status: 503 },
  )
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (profileError && isSchemaIssue(profileError)) {
      return schemaIssueResponse(profileError)
    }

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")

    const isHOD = ["department_head", "manager_hr"].includes(role)
    const isAdmin = ["admin", "administrator"].includes(role)

    if (!isHOD && !isAdmin) {
      return NextResponse.json({ error: "Only HODs can update leave dates" }, { status: 403 })
    }

    const body = await request.json()
    const { leave_plan_request_id, start_date, end_date } = body

    if (!leave_plan_request_id || !start_date || !end_date) {
      return NextResponse.json({ error: "leave_plan_request_id, start_date, and end_date are required" }, { status: 400 })
    }

    // Validate date format and range
    const startDate = new Date(start_date)
    const endDate = new Date(end_date)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    if (startDate > endDate) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
    }

    // Calculate requested days
    const requestedDays = calculateRequestedDays(start_date, end_date)

    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Leave period must span at least one day" }, { status: 400 })
    }

    // Fetch the current request to verify HOD can act
    const { data: leavePlan, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, status, workflow_route, hod_decision")
      .eq("id", leave_plan_request_id)
      .single()

    if (fetchError && isSchemaIssue(fetchError)) {
      return schemaIssueResponse(fetchError)
    }

    if (fetchError || !leavePlan) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    // Verify HOD can act on this request
    if (!isAdmin) {
      // Check if this HOD is linked to the staff member or owns the department
      const { data: linkages } = await admin
        .from("loan_hod_linkages")
        .select("id")
        .eq("staff_user_id", leavePlan.user_id)
        .eq("hod_user_id", user.id)
        .limit(1)

      if (!linkages || linkages.length === 0) {
        return NextResponse.json({ error: "You are not authorized to edit dates for this request" }, { status: 403 })
      }
    }

    // Update the leave request with new dates
    const { error: updateError } = await admin
      .from("leave_plan_requests")
      .update({
        preferred_start_date: start_date,
        preferred_end_date: end_date,
        requested_days: requestedDays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leave_plan_request_id)

    if (updateError) {
      if (isSchemaIssue(updateError)) {
        return schemaIssueResponse(updateError)
      }
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: "Leave dates updated successfully",
      start_date,
      end_date,
      requested_days: requestedDays,
    })
  } catch (error) {
    if (isSchemaIssue(error)) {
      return schemaIssueResponse(error)
    }
    console.error("[v0] HOD date update error:", error)
    return NextResponse.json(
      {
        error: `Failed to update leave dates: ${String((error as any)?.message || error || "Unknown error")}`,
      },
      { status: 500 },
    )
  }
}
