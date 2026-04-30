import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  buildHologramCode,
  calculateRequestedDays,
  isHrPlanningRole,
  isHrDepartment,
  isManagerRole,
  isStaffRole,
} from "@/lib/leave-planning"
import { DEFAULT_LEAVE_TYPES } from "@/lib/leave-policy"

const YEAR_PERIOD = "2026/2027"

function isSchemaIssue(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "")
  return code === "PGRST205" || code === "PGRST108" || code === "42P01" || code === "42703" || message.toLowerCase().includes("does not exist")
}

function getSchemaIssueMessage(error: any) {
  const code = error?.code || ""
  const message = String(error?.message || "")
  if (code === "PGRST205") {
    return "Leave planning advanced tables are still initializing. The module is running in compatibility mode."
  }
  if (code === "PGRST108") {
    return `Leave planning relationship metadata is still initializing (${message}). The module is running in compatibility mode.`
  }
  return "Leave planning schema is initializing. The module is running in compatibility mode."
}

function buildDegradedModeResponse(mode: "staff" | "manager" | "hr", warning: string) {
  if (mode === "manager") {
    return NextResponse.json({ mode: "manager", reviews: [], staggerReviews: [], degraded: true, warning }, { status: 200 })
  }
  if (mode === "hr") {
    return NextResponse.json({ mode: "hr", requests: [], staggerRequests: [], degraded: true, warning }, { status: 200 })
  }
  return NextResponse.json({ mode: "staff", requests: [], staggerRequests: [], degraded: true, warning }, { status: 200 })
}

function handleMissingSchema(error: any) {
  if (!isSchemaIssue(error)) return null
  return NextResponse.json(
    {
      error:
        "Leave planning tables are not visible in API schema cache. Run scripts 038_leave_planning_2026_2027_workflow.sql and 039_leave_policy_catalog.sql, then reload Supabase API schema cache.",
      needsMigration: true,
      needsSchemaCacheRefresh: true,
    },
    { status: 503 },
  )
}

async function validateAttendanceEngagementForRequest(admin: any, userId: string) {
  const { data: attendanceRows, error } = await admin
    .from("attendance_records")
    .select("id, check_in_time, check_out_time")
    .eq("user_id", userId)
    .order("check_in_time", { ascending: false })
    .limit(60)

  if (error) return { ok: true as const }

  const rows = attendanceRows || []
  const now = new Date()
  const todayStr = now.toDateString()

  // If user has checked in today (with or without checkout), allow immediately
  const hasTodayCheckIn = rows.some((row: any) => {
    if (!row?.check_in_time) return false
    return new Date(row.check_in_time).toDateString() === todayStr
  })
  if (hasTodayCheckIn) return { ok: true as const }

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const staleOpenCheckout = rows.find((row: any) => {
    if (!row?.check_in_time || row?.check_out_time) return false
    return new Date(row.check_in_time).toDateString() !== todayStr
  })

  if (staleOpenCheckout) {
    return {
      ok: false as const,
      status: 403,
      error:
        "Please complete your pending check-out first in Attendance before submitting a leave planning request.",
    }
  }

  const hasRecentAttendance = rows.some((row: any) => {
    if (!row?.check_in_time) return false
    return new Date(row.check_in_time) >= sevenDaysAgo
  })

  if (!hasRecentAttendance) {
    return {
      ok: false as const,
      status: 403,
      error:
        "Attendance activity is required before submitting leave planning. Please use Attendance check-in and check-out first.",
    }
  }

  return { ok: true as const }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, department_id, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")
    const departmentName = (profile as any)?.departments?.name || null
    const departmentCode = (profile as any)?.departments?.code || null
    const isHr = isHrPlanningRole(role, departmentName, departmentCode)

    if (isStaffRole(role)) {
      const { data, error } = await supabase
        .from("leave_plan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        if (isSchemaIssue(error)) {
          return buildDegradedModeResponse("staff", getSchemaIssueMessage(error))
        }
        throw error
      }

      const { data: stagger, error: staggerError } = await supabase
        .from("leave_plan_stagger_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (staggerError) {
        if (isSchemaIssue(staggerError)) {
          return buildDegradedModeResponse("staff", getSchemaIssueMessage(staggerError))
        }
        throw staggerError
      }

      return NextResponse.json({
        mode: "staff",
        requests: data || [],
        staggerRequests: stagger || [],
      })
    }

    if (isManagerRole(role) && !isHr) {
      const { data, error } = await supabase
        .from("leave_plan_reviews")
        .select(`
          id,
          decision,
          recommendation,
          reviewed_at,
          leave_plan_request:leave_plan_requests!leave_plan_reviews_leave_plan_request_id_fkey (
            id,
            leave_year_period,
            preferred_start_date,
            preferred_end_date,
            leave_type_key,
            entitlement_days,
            requested_days,
            reason,
            status,
            submitted_at,
            user:user_profiles!leave_plan_requests_user_id_fkey (
              id,
              first_name,
              last_name,
              employee_id,
              departments(name, code)
            )
          )
        `)
        .eq("reviewer_id", user.id)
        .order("created_at", { ascending: false })

      if (error) {
        if (isSchemaIssue(error)) {
          return buildDegradedModeResponse("manager", getSchemaIssueMessage(error))
        }
        throw error
      }

      const { data: staggerReviews, error: staggerError } = await supabase
        .from("leave_plan_stagger_reviews")
        .select(`
          id,
          decision,
          recommendation,
          reviewed_at,
          stagger_request:leave_plan_stagger_requests!leave_plan_stagger_reviews_leave_plan_stagger_request_id_fkey (
            id,
            leave_plan_request_id,
            leave_type_key,
            entitlement_days,
            requested_start_date,
            requested_end_date,
            reason,
            status,
            submitted_at,
            user:user_profiles!leave_plan_stagger_requests_user_id_fkey (
              id,
              first_name,
              last_name,
              employee_id,
              departments(name, code)
            )
          )
        `)
        .eq("reviewer_id", user.id)
        .order("created_at", { ascending: false })

      if (staggerError) {
        if (isSchemaIssue(staggerError)) {
          return buildDegradedModeResponse("manager", getSchemaIssueMessage(staggerError))
        }
        throw staggerError
      }

      // Also fetch this user's own leave plan requests (they can apply for themselves too)
      const { data: myRequests } = await supabase
        .from("leave_plan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const { data: myStaggerRequests } = await supabase
        .from("leave_plan_stagger_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      return NextResponse.json({
        mode: "manager",
        reviews: data || [],
        staggerReviews: staggerReviews || [],
        myRequests: myRequests || [],
        myStaggerRequests: myStaggerRequests || [],
      })
    }

    if (isHr) {
      const { data, error } = await supabase
        .from("leave_plan_requests")
        .select(`
          id,
          user_id,
          leave_year_period,
          preferred_start_date,
          preferred_end_date,
          leave_type_key,
          entitlement_days,
          requested_days,
          reason,
          status,
          manager_recommendation,
          hr_response_letter,
          user_signature_mode,
          user_signature_text,
          user_signature_image_url,
          user_signature_data_url,
          user_signature_hologram_code,
          hr_signature_mode,
          hr_signature_text,
          hr_signature_image_url,
          hr_signature_data_url,
          hr_signature_hologram_code,
          submitted_at,
          created_at,
          updated_at,
          user:user_profiles!leave_plan_requests_user_id_fkey (
            id,
            first_name,
            last_name,
            employee_id,
            departments(name, code)
          )
        `)
        .in("status", ["manager_confirmed", "hr_approved", "hr_rejected"])
        .order("created_at", { ascending: false })

      if (error) {
        if (isSchemaIssue(error)) {
          return buildDegradedModeResponse("hr", getSchemaIssueMessage(error))
        }
        throw error
      }

      const { data: stagger, error: staggerError } = await supabase
        .from("leave_plan_stagger_requests")
        .select(`
          id,
          leave_plan_request_id,
          user_id,
          leave_type_key,
          entitlement_days,
          requested_start_date,
          requested_end_date,
          reason,
          status,
          manager_recommendation,
          hr_response_letter,
          user_signature_mode,
          user_signature_text,
          user_signature_image_url,
          user_signature_data_url,
          user_signature_hologram_code,
          hr_signature_mode,
          hr_signature_text,
          hr_signature_image_url,
          hr_signature_data_url,
          hr_signature_hologram_code,
          submitted_at,
          created_at,
          updated_at,
          user:user_profiles!leave_plan_stagger_requests_user_id_fkey (
            id,
            first_name,
            last_name,
            employee_id,
            departments(name, code)
          )
        `)
        .in("status", ["manager_confirmed", "hr_approved", "hr_rejected"])
        .order("created_at", { ascending: false })

      if (staggerError) {
        if (isSchemaIssue(staggerError)) {
          return buildDegradedModeResponse("hr", getSchemaIssueMessage(staggerError))
        }
        throw staggerError
      }

      // Also fetch this admin/HR user's own leave plan requests
      const { data: myRequests } = await supabase
        .from("leave_plan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const { data: myStaggerRequests } = await supabase
        .from("leave_plan_stagger_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      return NextResponse.json({
        mode: "hr",
        requests: data || [],
        staggerRequests: stagger || [],
        myRequests: myRequests || [],
        myStaggerRequests: myStaggerRequests || [],
      })
    }

    return NextResponse.json({ mode: "restricted", requests: [] })
  } catch (error) {
    const errMsg =
      error instanceof Error
        ? error.message
        : (() => {
            try {
              return JSON.stringify(error)
            } catch {
              return String(error)
            }
          })() || "Unknown error"
    console.error("[v0] Leave planning GET error:", error)
    return NextResponse.json({ error: `Failed to load leave planning data: ${errMsg}` }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
      .select("id, role, department_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = String(profile.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    const canSelfApply =
      isStaffRole(role) ||
      ["admin", "regional_manager", "department_head", "hr_officer", "hr_director", "director_hr", "manager_hr"].includes(role)
    if (!canSelfApply) {
      return NextResponse.json({ error: "Only staff, managers, and admins can submit leave plans." }, { status: 403 })
    }

    const shouldEnforceAttendance = ![
      "admin",
      "regional_manager",
      "department_head",
      "hr_officer",
      "hr_director",
      "director_hr",
      "manager_hr",
    ].includes(role)
    if (shouldEnforceAttendance) {
      const attendanceCheck = await validateAttendanceEngagementForRequest(admin, user.id)
      if (!attendanceCheck.ok) {
        return NextResponse.json({ error: attendanceCheck.error }, { status: attendanceCheck.status })
      }
    }

    const body = await request.json()
    const {
      leave_year_period,
      preferred_start_date,
      preferred_end_date,
      leave_type,
      reason,
      user_signature_mode,
      user_signature_text,
      user_signature_image_url,
      user_signature_data_url,
    } = body

    if (!preferred_start_date || !preferred_end_date) {
      return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 })
    }

    if ((leave_year_period || YEAR_PERIOD) !== YEAR_PERIOD) {
      return NextResponse.json({ error: "Only 2026/2027 leave period is supported in this workflow." }, { status: 400 })
    }

    const requestedDays = calculateRequestedDays(preferred_start_date, preferred_end_date)
        let entitlementDays: number | null = null
        let leaveTypeKey = String(leave_type || "annual").toLowerCase()
        try {
          const { data: policyRows, error: policyError } = await admin
            .from("leave_policy_catalog")
            .select("leave_type_key, entitlement_days, is_enabled")
            .eq("leave_year_period", YEAR_PERIOD)
            .eq("leave_type_key", leaveTypeKey)
            .limit(1)

          if (!policyError && policyRows && policyRows.length > 0) {
            const policy = policyRows[0] as any
            if (!policy.is_enabled) {
              return NextResponse.json({ error: "Selected leave type is disabled by policy." }, { status: 400 })
            }
            entitlementDays = Number(policy.entitlement_days || 0)
          } else {
            const fallback = DEFAULT_LEAVE_TYPES.find((t) => t.leaveTypeKey === leaveTypeKey)
            entitlementDays = fallback ? fallback.entitlementDays : null
          }
        } catch {
          const fallback = DEFAULT_LEAVE_TYPES.find((t) => t.leaveTypeKey === leaveTypeKey)
          entitlementDays = fallback ? fallback.entitlementDays : null
        }

        const canSubmitBeyondEntitlementForHrAdjustment =
          role === "admin" ||
          role === "regional_manager" ||
          role === "department_head" ||
          role === "hr_officer" ||
          role === "hr_director" ||
          role === "director_hr" ||
          role === "manager_hr" ||
          role.includes("manager")

        if (entitlementDays !== null && requestedDays > entitlementDays && !canSubmitBeyondEntitlementForHrAdjustment) {
          return NextResponse.json(
            {
              error: `Requested ${requestedDays} day(s) exceeds entitlement of ${entitlementDays} day(s) for this leave type.`,
            },
            { status: 400 },
          )
        }

    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Invalid leave date range." }, { status: 400 })
    }

    if (!user_signature_text && !user_signature_image_url && !user_signature_data_url) {
      return NextResponse.json({ error: "A staff signature is required (typed, uploaded, or on-screen draw)." }, { status: 400 })
    }

    const { data: requestRow, error: requestError } = await admin
      .from("leave_plan_requests")
      .insert({
        user_id: user.id,
        leave_year_period: YEAR_PERIOD,
        preferred_start_date,
        preferred_end_date,
        leave_type_key: leaveTypeKey,
        entitlement_days: entitlementDays,
        requested_days: requestedDays,
        reason: reason || null,
        status: "pending_manager_review",
        user_signature_mode: user_signature_mode || "typed",
        user_signature_text: user_signature_text || null,
        user_signature_image_url: user_signature_image_url || null,
        user_signature_data_url: user_signature_data_url || null,
        user_signature_hologram_code: buildHologramCode("USR"),
      })
      .select("*")
      .single()

    if (requestError || !requestRow) {
      const migrationError = handleMissingSchema(requestError)
      if (migrationError) return migrationError
      throw requestError
    }

    const { data: reviewers, error: reviewerError } = await admin
      .from("user_profiles")
      .select("id, role, department_id")
      .in("role", ["regional_manager", "department_head"])
      .eq("is_active", true)

    if (reviewerError) {
      throw reviewerError
    }

    const nonHrReviewers = (reviewers || []).filter((r: any) => {
      if (r.role === "regional_manager") return true
      if (r.role === "department_head") {
        return r.department_id && r.department_id === profile.department_id
      }
      return false
    })

    if (nonHrReviewers.length === 0) {
      return NextResponse.json(
        {
          error: "No regional manager or department head is configured for this workflow.",
        },
        { status: 400 },
      )
    }

    const reviewRows = nonHrReviewers.map((reviewer: any) => ({
      leave_plan_request_id: requestRow.id,
      reviewer_id: reviewer.id,
      reviewer_role: reviewer.role,
      decision: "pending",
    }))

    const { error: reviewInsertError } = await admin.from("leave_plan_reviews").insert(reviewRows)
    if (reviewInsertError) {
      const migrationError = handleMissingSchema(reviewInsertError)
      if (migrationError) return migrationError
      throw reviewInsertError
    }

    return NextResponse.json({ success: true, request: requestRow }, { status: 201 })
  } catch (error) {
    console.error("[v0] Leave planning POST error:", error)
    const errMsg =
      error instanceof Error
        ? error.message
        : (() => {
            try {
              return JSON.stringify(error)
            } catch {
              return String(error)
            }
          })() || "Unknown error"
    return NextResponse.json({ error: `Failed to submit leave planning request: ${errMsg}` }, { status: 500 })
  }
}
