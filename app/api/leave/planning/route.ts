import { NextRequest, NextResponse } from "next/server"
import { notifyLeaveSubmitted } from "@/lib/workflow-emails"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  buildHologramCode,
  calculateRequestedDays,
  isHrPlanningRole,
  isHrApproverRole,
  isHrLeaveOfficeRole,
  isHrDepartment,
  isManagerRole,
  isStaffRole,
  HR_OFFICE_PENDING_STATUSES,
} from "@/lib/leave-planning"
import { DEFAULT_LEAVE_TYPES } from "@/lib/leave-policy"

const YEAR_PERIOD = "2026/2027"

const EDITABLE_STATUSES = [
  "pending_manager_review",
  "manager_changes_requested",
  "manager_rejected",
  "pending_hod_review",
  "hod_changes_requested",
  "hod_rejected",
  "hr_rejected",
] as const

const OVERLAP_BLOCKING_STATUSES = [
  "pending",
  "pending_hod",
  "pending_hr",
  "pending_manager_review",
  "pending_hod_review",
  "manager_changes_requested",
  "hod_changes_requested",
  "manager_confirmed",
  "hod_approved",
  "hr_office_forwarded",
  "approved",
  "hr_approved",
] as const

const DUPLICATE_BLOCKING_STATUSES = OVERLAP_BLOCKING_STATUSES

function normalizeRoleValue(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "_")
}

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

function buildDegradedModeResponse(mode: "staff" | "manager" | "hr" | "hr_office", warning: string) {
  if (mode === "manager") {
    return NextResponse.json({ mode: "manager", reviews: [], staggerReviews: [], degraded: true, warning }, { status: 200 })
  }
  if (mode === "hr_office") {
    return NextResponse.json({ mode: "hr_office", requests: [], myRequests: [], degraded: true, warning }, { status: 200 })
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

async function resolveManagerReviewers(admin: any, userId: string, departmentId: string | null) {
  const linkedReviewerIds: string[] = []
  const { data: linkages } = await admin
    .from("loan_hod_linkages")
    .select("hod_user_id")
    .eq("staff_user_id", userId)
    .limit(20)

  for (const row of linkages || []) {
    const reviewerId = String((row as any)?.hod_user_id || "")
    if (reviewerId && !linkedReviewerIds.includes(reviewerId)) linkedReviewerIds.push(reviewerId)
  }

  if (linkedReviewerIds.length > 0) {
    const { data: linkedReviewers } = await admin
      .from("user_profiles")
      .select("id, role")
      .in("id", linkedReviewerIds)
      .in("role", ["regional_manager", "department_head"])
      .eq("is_active", true)

    const reviewers = (linkedReviewers || []).map((r: any) => ({
      id: String(r.id),
      role: String(r.role || ""),
    }))

    if (reviewers.length > 0) return reviewers
  }

  const { data: reviewers } = await admin
    .from("user_profiles")
    .select("id, role, department_id")
    .in("role", ["regional_manager", "department_head"])
    .eq("is_active", true)

  return (reviewers || []).filter((r: any) => {
    if (r.role === "regional_manager") return true
    if (r.role === "department_head") return Boolean(r.department_id && departmentId && r.department_id === departmentId)
    return false
  }).map((r: any) => ({ id: String(r.id), role: String(r.role || "") }))
}

async function syncManagerReviews(admin: any, leavePlanRequestId: string, reviewers: Array<{ id: string; role: string }>) {
  await admin.from("leave_plan_reviews").delete().eq("leave_plan_request_id", leavePlanRequestId)
  if (reviewers.length === 0) return

  const reviewRows = reviewers.map((reviewer) => ({
    leave_plan_request_id: leavePlanRequestId,
    reviewer_id: reviewer.id,
    reviewer_role: reviewer.role,
    decision: "pending",
  }))

  await admin.from("leave_plan_reviews").insert(reviewRows)
}

async function resolveEntitlementDays(admin: any, leaveTypeKey: string) {
  const normalizedLeaveTypeKey = String(leaveTypeKey || "annual").toLowerCase()
  try {
    const { data: policyRows, error: policyError } = await admin
      .from("leave_policy_catalog")
      .select("leave_type_key, entitlement_days, is_enabled")
      .eq("leave_year_period", YEAR_PERIOD)
      .eq("leave_type_key", normalizedLeaveTypeKey)
      .limit(1)

    if (!policyError && policyRows && policyRows.length > 0) {
      const policy = policyRows[0] as any
      if (!policy.is_enabled) return { error: "Selected leave type is disabled by policy.", entitlementDays: null }
      return { entitlementDays: Number(policy.entitlement_days || 0), error: null }
    }
  } catch {
    // Use default fallback below.
  }

  const fallback = DEFAULT_LEAVE_TYPES.find((t) => t.leaveTypeKey === normalizedLeaveTypeKey)
  return { entitlementDays: fallback ? fallback.entitlementDays : null, error: null }
}

function formatMemoDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-GH", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return value
  }
}

function buildInitialLeaveMemoDraft(payload: {
  leaveTypeKey: string
  leaveYearPeriod: string
  preferredStartDate: string
  preferredEndDate: string
  requestedDays: number
  submittedAt: string
}) {
  const leaveTypeLabel = String(payload.leaveTypeKey || "annual")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())

  const subject = `LEAVE REQUEST RECEIVED - ${leaveTypeLabel} (${payload.leaveYearPeriod})`
  const body = [
    "Your leave request has been received and is now in workflow review.",
    "",
    `Leave Type: ${leaveTypeLabel}`,
    `Requested Period: ${formatMemoDate(payload.preferredStartDate)} to ${formatMemoDate(payload.preferredEndDate)}`,
    `Requested Days: ${payload.requestedDays}`,
    `Submitted On: ${formatMemoDate(payload.submittedAt)}`,
    "",
    "Current Stage: Pending HOD/Manager Review",
    "",
    "This memo is generated automatically for your reference and for HR Leave Office records.",
  ].join("\n")

  return { subject, body }
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA <= endB && startB <= endA
}

async function findOverlapSuggestion(
  admin: any,
  userId: string,
  requestedStartDate: string,
  requestedEndDate: string,
  durationDays: number,
  excludeRequestId?: string,
) {
  let query = admin
    .from("leave_plan_requests")
    .select("id, preferred_start_date, preferred_end_date, status")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .in("status", [...OVERLAP_BLOCKING_STATUSES])
    .order("preferred_start_date", { ascending: true })

  if (excludeRequestId) {
    query = query.neq("id", excludeRequestId)
  }

  const { data: existingRows, error } = await query
  if (error) {
    throw error
  }

  const requestedStart = new Date(requestedStartDate)
  const requestedEnd = new Date(requestedEndDate)
  if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
    return null
  }

  const ranges = (existingRows || [])
    .map((row: any) => ({
      id: String(row.id),
      status: String(row.status || ""),
      start: new Date(row.preferred_start_date),
      end: new Date(row.preferred_end_date),
    }))
    .filter((row: any) => !Number.isNaN(row.start.getTime()) && !Number.isNaN(row.end.getTime()))

  const firstConflict = ranges.find((row: any) => rangesOverlap(requestedStart, requestedEnd, row.start, row.end))
  if (!firstConflict) {
    return null
  }

  let candidateStart = addDays(firstConflict.end, 1)

  while (true) {
    const candidateEnd = addDays(candidateStart, Math.max(durationDays, 1) - 1)
    const blockingRange = ranges.find((row: any) => rangesOverlap(candidateStart, candidateEnd, row.start, row.end))
    if (!blockingRange) {
      return {
        conflict: {
          id: firstConflict.id,
          status: firstConflict.status,
          start_date: formatDateOnly(firstConflict.start),
          end_date: formatDateOnly(firstConflict.end),
        },
        suggested_start_date: formatDateOnly(candidateStart),
        suggested_end_date: formatDateOnly(candidateEnd),
      }
    }
    candidateStart = addDays(blockingRange.end, 1)
  }
}

async function findDuplicateLeaveRequest(
  admin: any,
  userId: string,
  leaveTypeKey: string,
  preferredStartDate: string,
  preferredEndDate: string,
  excludeRequestId?: string,
) {
  let query = admin
    .from("leave_plan_requests")
    .select("id, leave_type_key, preferred_start_date, preferred_end_date, status, submitted_at")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .eq("leave_type_key", leaveTypeKey)
    .eq("preferred_start_date", preferredStartDate)
    .eq("preferred_end_date", preferredEndDate)
    .in("status", [...DUPLICATE_BLOCKING_STATUSES])
    .order("submitted_at", { ascending: false })
    .limit(1)

  if (excludeRequestId) {
    query = query.neq("id", excludeRequestId)
  }

  const { data, error } = await query
  if (error) throw error

  const existing = Array.isArray(data) ? data[0] : null
  if (!existing) return null

  return {
    id: String(existing.id),
    status: String(existing.status || ""),
    leave_type_key: String(existing.leave_type_key || leaveTypeKey),
    start_date: String(existing.preferred_start_date || preferredStartDate),
    end_date: String(existing.preferred_end_date || preferredEndDate),
    submitted_at: existing.submitted_at || null,
  }
}

async function findSameMonthSameTypeRequest(
  admin: any,
  userId: string,
  leaveTypeKey: string,
  preferredStartDate: string,
  excludeRequestId?: string,
) {
  // Fetch all active requests of this leave type for this user (not archived)
  let query = admin
    .from("leave_plan_requests")
    .select("id, leave_type_key, preferred_start_date, preferred_end_date, status, submitted_at")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .eq("leave_type_key", leaveTypeKey)
    .in("status", [...DUPLICATE_BLOCKING_STATUSES])
    .order("submitted_at", { ascending: false })

  if (excludeRequestId) {
    query = query.neq("id", excludeRequestId)
  }

  const { data, error } = await query
  if (error) throw error

  if (!Array.isArray(data) || data.length === 0) return null

  const newStart = new Date(preferredStartDate)
  if (Number.isNaN(newStart.getTime())) return null

  const newYear = newStart.getFullYear()
  const newMonth = newStart.getMonth()

  // Check if any existing request of the same type starts or ends in the same calendar month
  for (const row of data) {
    const rowStart = new Date(row.preferred_start_date)
    const rowEnd = new Date(row.preferred_end_date)
    if (Number.isNaN(rowStart.getTime())) continue

    const rowStartYear = rowStart.getFullYear()
    const rowStartMonth = rowStart.getMonth()
    const rowEndYear = rowEnd.getFullYear()
    const rowEndMonth = rowEnd.getMonth()

    // Conflict if the new request's month overlaps with any month the existing request spans
    const requestedYear = newStart.getFullYear()
    const requestedMonth = newStart.getMonth()

    // Build a set of months the existing request covers
    const existingStart = new Date(rowStart.getFullYear(), rowStart.getMonth(), 1)
    const existingEnd = new Date(rowEnd.getFullYear(), rowEnd.getMonth(), 1)
    let cursor = existingStart
    while (cursor <= existingEnd) {
      if (cursor.getFullYear() === requestedYear && cursor.getMonth() === requestedMonth) {
        return {
          id: String(row.id),
          status: String(row.status || ""),
          leave_type_key: String(row.leave_type_key || leaveTypeKey),
          start_date: String(row.preferred_start_date),
          end_date: String(row.preferred_end_date),
          submitted_at: row.submitted_at || null,
        }
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
  }

  return null
}

async function fetchStaffLeaveHistory(admin: any, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return {}

  const { data, error } = await admin
    .from("leave_plan_requests")
    .select(`
      id,
      user_id,
      leave_type_key,
      preferred_start_date,
      preferred_end_date,
      adjusted_start_date,
      adjusted_end_date,
      requested_days,
      adjusted_days,
      entitlement_days,
      status,
      submitted_at,
      created_at,
      manager_recommendation,
      adjustment_reason,
      hr_approval_note,
      is_archived
    `)
    .in("user_id", uniqueUserIds)
    .order("submitted_at", { ascending: false })

  if (error) throw error

  const historyByUser: Record<string, any[]> = {}
  for (const row of data || []) {
    const userId = String((row as any).user_id || "")
    if (!userId) continue
    if (!historyByUser[userId]) {
      historyByUser[userId] = []
    }
    if (historyByUser[userId].length < 8) {
      historyByUser[userId].push(row)
    }
  }

  return historyByUser
}

async function fetchHrOfficeAnalytics(admin: any) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await admin
    .from("leave_plan_requests")
    .select(`
      id,
      status,
      leave_type_key,
      preferred_start_date,
      preferred_end_date,
      adjusted_start_date,
      adjusted_end_date,
      requested_days,
      adjusted_days,
      submitted_at,
      created_at,
      is_archived,
      user:user_profiles!leave_plan_requests_user_id_fkey (
        id,
        first_name,
        last_name,
        employee_id,
        departments(name, code),
        geofence_locations!user_profiles_assigned_location_id_fkey(name, address)
      )
    `)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })

  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  const outstanding = rows.filter((row: any) => (HR_OFFICE_PENDING_STATUSES as string[]).includes(String(row?.status || "")))
  const approved = rows.filter((row: any) => String(row?.status || "") === "hr_approved")

  const onLeaveNow = approved.filter((row: any) => {
    const start = new Date(String(row?.adjusted_start_date || row?.preferred_start_date || ""))
    const end = new Date(String(row?.adjusted_end_date || row?.preferred_end_date || ""))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return start <= today && end >= today
  })

  const upcoming = approved.filter((row: any) => {
    const start = new Date(String(row?.adjusted_start_date || row?.preferred_start_date || ""))
    if (Number.isNaN(start.getTime())) return false
    start.setHours(0, 0, 0, 0)
    return start > today
  })

  const completed = approved.filter((row: any) => {
    const end = new Date(String(row?.adjusted_end_date || row?.preferred_end_date || ""))
    if (Number.isNaN(end.getTime())) return false
    end.setHours(23, 59, 59, 999)
    return end < today
  })

  const uniqueOnLeaveStaff = new Set(onLeaveNow.map((row: any) => String(row?.user?.id || "")).filter(Boolean)).size
  const uniqueUpcomingStaff = new Set(upcoming.map((row: any) => String(row?.user?.id || "")).filter(Boolean)).size
  const uniqueCompletedStaff = new Set(completed.map((row: any) => String(row?.user?.id || "")).filter(Boolean)).size

  const typeCountMap = new Map<string, { leave_type_key: string; total: number; on_leave_now: number; upcoming: number; completed: number }>()
  const locationCountMap = new Map<string, { name: string; total: number; on_leave_now: number; upcoming: number }>()

  for (const row of approved) {
    const typeKey = String(row?.leave_type_key || "annual")
    const typeEntry = typeCountMap.get(typeKey) || { leave_type_key: typeKey, total: 0, on_leave_now: 0, upcoming: 0, completed: 0 }
    typeEntry.total += 1
    if (onLeaveNow.some((item: any) => item.id === row.id)) typeEntry.on_leave_now += 1
    if (upcoming.some((item: any) => item.id === row.id)) typeEntry.upcoming += 1
    if (completed.some((item: any) => item.id === row.id)) typeEntry.completed += 1
    typeCountMap.set(typeKey, typeEntry)

    const locationName = String(
      row?.user?.geofence_locations?.name || row?.user?.departments?.name || "Unassigned Location",
    )
    const locationEntry = locationCountMap.get(locationName) || { name: locationName, total: 0, on_leave_now: 0, upcoming: 0 }
    locationEntry.total += 1
    if (onLeaveNow.some((item: any) => item.id === row.id)) locationEntry.on_leave_now += 1
    if (upcoming.some((item: any) => item.id === row.id)) locationEntry.upcoming += 1
    locationCountMap.set(locationName, locationEntry)
  }

  const currentLeaveRoster = onLeaveNow.slice(0, 8).map((row: any) => ({
    id: row.id,
    staff_name: [row?.user?.first_name, row?.user?.last_name].filter(Boolean).join(" ") || row?.user?.employee_id || "Staff",
    employee_id: row?.user?.employee_id || null,
    leave_type_key: row?.leave_type_key || "annual",
    start_date: row?.adjusted_start_date || row?.preferred_start_date || null,
    end_date: row?.adjusted_end_date || row?.preferred_end_date || null,
    days: Number(row?.adjusted_days || row?.requested_days || 0),
    location_name: row?.user?.geofence_locations?.name || row?.user?.departments?.name || "Unassigned Location",
  }))

  return {
    totals: {
      outstanding_requests: outstanding.length,
      approved_total: approved.length,
      staff_on_leave_now: uniqueOnLeaveStaff,
      staff_yet_to_enjoy: uniqueUpcomingStaff,
      staff_completed_leave: uniqueCompletedStaff,
      completed_leave_requests: completed.length,
    },
    outstanding_by_status: [
      {
        status: "hod_approved",
        total: outstanding.filter((row: any) => String(row?.status || "") === "hod_approved").length,
      },
      {
        status: "manager_confirmed",
        total: outstanding.filter((row: any) => String(row?.status || "") === "manager_confirmed").length,
      },
    ],
    leave_type_breakdown: Array.from(typeCountMap.values()).sort((a, b) => b.total - a.total),
    location_ranking: Array.from(locationCountMap.values()).sort((a, b) => b.total - a.total).slice(0, 8),
    current_leave_roster: currentLeaveRoster,
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const includeArchived = url.searchParams.get("includeArchived") === "true"

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
      .select("id, role, department_id, departments(name, code)")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = normalizeRoleValue(profile.role)
    const departmentName = (profile as any)?.departments?.name || null
    const departmentCode = (profile as any)?.departments?.code || null
    const isHrOffice = isHrLeaveOfficeRole(role)
    const isHrApprover = isHrApproverRole(role, departmentName, departmentCode)
    const isHr = isHrOffice || isHrApprover || isHrPlanningRole(role, departmentName, departmentCode)

    // ── HR Leave Office mode: sees HOD-approved requests, can adjust & forward ──
    if (isHrOffice && !isHrApprover) {
      let officeQuery = admin
        .from("leave_plan_requests")
        .select(`
          *,
          user:user_profiles!leave_plan_requests_user_id_fkey (
            id, first_name, last_name, employee_id,
            departments(name, code),
            geofence_locations!user_profiles_assigned_location_id_fkey(name, address)
          )
        `)
        .order("created_at", { ascending: false })

      if (!includeArchived) {
        officeQuery = officeQuery.eq("is_archived", false)
      }

      const { data: requests, error: reqError } = await officeQuery

      if (reqError) {
        if (isSchemaIssue(reqError)) return buildDegradedModeResponse("hr_office", getSchemaIssueMessage(reqError))
        throw reqError
      }

      const { data: myRequests } = await admin
        .from("leave_plan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const analytics = await fetchHrOfficeAnalytics(admin)

      return NextResponse.json({
        mode: "hr_office",
        requests: requests || [],
        myRequests: myRequests || [],
        analytics,
      })
    }

    if (isStaffRole(role)) {
      const { data, error } = await admin
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

      const { data: stagger, error: staggerError } = await admin
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
      const { data, error } = await admin
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
            is_archived,
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

      const nonArchivedReviews = (data || []).filter((row: any) => !row?.leave_plan_request?.is_archived)

      const { data: staggerReviews, error: staggerError } = await admin
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
      const { data: myRequests } = await admin
        .from("leave_plan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const { data: myStaggerRequests } = await admin
        .from("leave_plan_stagger_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const reviewUserIds = (nonArchivedReviews || [])
        .map((row: any) => String(row?.leave_plan_request?.user?.id || ""))
        .filter(Boolean)
      const staffHistoryByUser = await fetchStaffLeaveHistory(admin, reviewUserIds)

      return NextResponse.json({
        mode: "manager",
        reviews: nonArchivedReviews,
        staggerReviews: staggerReviews || [],
        myRequests: myRequests || [],
        myStaggerRequests: myStaggerRequests || [],
        staffHistoryByUser,
      })
    }

    if (isHr) {
      const { data, error } = await admin
        .from("leave_plan_requests")
        .select(`
          *,
          user:user_profiles!leave_plan_requests_user_id_fkey (
            id,
            first_name,
            last_name,
            employee_id,
            departments(name, code)
          )
        `)
        .order("created_at", { ascending: false })

      if (error) {
        if (isSchemaIssue(error)) {
          return buildDegradedModeResponse("hr", getSchemaIssueMessage(error))
        }
        throw error
      }

      const { data: stagger, error: staggerError } = await admin
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
        .order("created_at", { ascending: false })

      if (staggerError) {
        if (isSchemaIssue(staggerError)) {
          return buildDegradedModeResponse("hr", getSchemaIssueMessage(staggerError))
        }
        throw staggerError
      }

      // Also fetch this admin/HR user's own leave plan requests
      const { data: myRequests } = await admin
        .from("leave_plan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const { data: myStaggerRequests } = await admin
        .from("leave_plan_stagger_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const requestUserIds = (data || []).map((row: any) => String(row?.user?.id || row?.user_id || "")).filter(Boolean)
      const staffHistoryByUser = await fetchStaffLeaveHistory(admin, requestUserIds)

      const analytics = await fetchHrOfficeAnalytics(admin)

      return NextResponse.json({
        mode: "hr",
        requests: data || [],
        staggerRequests: stagger || [],
        myRequests: myRequests || [],
        myStaggerRequests: myStaggerRequests || [],
        staffHistoryByUser,
        analytics,
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
      [
        "admin",
        "regional_manager",
        "department_head",
        "hr_officer",
        "hr_director",
        "director_hr",
        "manager_hr",
        "hr_leave_office",
        "hr_office",
        "loan_office",
      ].includes(role)
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
      "hr_leave_office",
      "hr_office",
      "loan_office",
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
    const leaveTypeKey = String(leave_type || "annual").toLowerCase()
    const entitlementResult = await resolveEntitlementDays(admin, leaveTypeKey)
    if (entitlementResult.error) {
      return NextResponse.json({ error: entitlementResult.error }, { status: 400 })
    }
    const entitlementDays = entitlementResult.entitlementDays

    if (entitlementDays !== null && requestedDays > entitlementDays) {
      return NextResponse.json(
        {
          error: `Requested ${requestedDays} day(s) exceeds entitlement of ${entitlementDays} day(s) for this leave type. HR Leave Office may adjust the final leave days with a reason after review.`,
          code: "LEAVE_ENTITLEMENT_EXCEEDED",
          entitlement_days: entitlementDays,
          requested_days: requestedDays,
        },
        { status: 400 },
      )
    }

    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Invalid leave date range." }, { status: 400 })
    }

    const duplicateRequest = await findDuplicateLeaveRequest(
      admin,
      user.id,
      leaveTypeKey,
      preferred_start_date,
      preferred_end_date,
    )
    if (duplicateRequest) {
      return NextResponse.json(
        {
          error: "This leave request has already been submitted with the same leave type and date range.",
          code: "DUPLICATE_LEAVE_REQUEST",
          duplicate: duplicateRequest,
        },
        { status: 409 },
      )
    }

    const sameMonthRequest = await findSameMonthSameTypeRequest(
      admin,
      user.id,
      leaveTypeKey,
      preferred_start_date,
    )
    if (sameMonthRequest) {
      const monthName = new Date(preferred_start_date).toLocaleString("default", { month: "long", year: "numeric" })
      return NextResponse.json(
        {
          error: `You already have an active ${leaveTypeKey.replace(/_/g, " ")} request for ${monthName} (${sameMonthRequest.start_date} to ${sameMonthRequest.end_date}). Only one request per leave type per month is allowed.`,
          code: "SAME_MONTH_LEAVE_REQUEST",
          existing: sameMonthRequest,
        },
        { status: 409 },
      )
    }

    const overlapSuggestion = await findOverlapSuggestion(
      admin,
      user.id,
      preferred_start_date,
      preferred_end_date,
      requestedDays,
    )
    if (overlapSuggestion) {
      return NextResponse.json(
        {
          error: "The selected leave period overlaps with an existing leave request.",
          code: "LEAVE_DATE_OVERLAP",
          ...overlapSuggestion,
        },
        { status: 409 },
      )
    }

    if (!user_signature_text && !user_signature_image_url && !user_signature_data_url) {
      return NextResponse.json({ error: "A staff signature is required (typed, uploaded, or on-screen draw)." }, { status: 400 })
    }

    const initialMemo = buildInitialLeaveMemoDraft({
      leaveTypeKey,
      leaveYearPeriod: YEAR_PERIOD,
      preferredStartDate: preferred_start_date,
      preferredEndDate: preferred_end_date,
      requestedDays,
      submittedAt: new Date().toISOString(),
    })

    const { data: requestRow, error: requestError } = await admin
      .from("leave_plan_requests")
      .insert({
        memo_subject: initialMemo.subject,
        memo_body: initialMemo.body,
        memo_draft_subject: initialMemo.subject,
        memo_draft_body: initialMemo.body,
        user_id: user.id,
        leave_year_period: YEAR_PERIOD,
        preferred_start_date,
        preferred_end_date,
        leave_type_key: leaveTypeKey,
        entitlement_days: entitlementDays,
        requested_days: requestedDays,
        reason: reason || null,
        status: "pending_hod_review",
        user_signature_mode: user_signature_mode || "typed",
        user_signature_text: user_signature_text || null,
        user_signature_image_url: user_signature_image_url || null,
        user_signature_data_url: user_signature_data_url || null,
        user_signature_hologram_code: buildHologramCode("USR"),
        memo_generated: true,
        memo_generated_at: new Date().toISOString(),
      })
      .select("*")
      .single()

    if (requestError || !requestRow) {
      const migrationError = handleMissingSchema(requestError)
      if (migrationError) return migrationError
      throw requestError
    }

    const nonHrReviewers = await resolveManagerReviewers(admin, user.id, (profile as any).department_id || null)

    if (nonHrReviewers.length === 0) {
      return NextResponse.json(
        {
          error: "No regional manager or department head is configured for this workflow.",
        },
        { status: 400 },
      )
    }

    await syncManagerReviews(admin, requestRow.id, nonHrReviewers as any)

    // Fire-and-forget email to HOD reviewers
    const staffProfile = await admin
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle()
    const staffName = staffProfile.data
      ? `${staffProfile.data.first_name || ""} ${staffProfile.data.last_name || ""}`.trim()
      : "Staff Member"
    notifyLeaveSubmitted(admin, {
      leavePlanRequestId: requestRow.id,
      staffName,
      leaveType: leaveTypeKey,
      startDate: preferred_start_date,
      endDate: preferred_end_date,
      requestedDays,
    }).catch(() => {})

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

export async function PUT(request: NextRequest) {
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

    const role = normalizeRoleValue(profile.role)
    const canSelfApply =
      isStaffRole(role) ||
      [
        "admin",
        "regional_manager",
        "department_head",
        "hr_officer",
        "hr_director",
        "director_hr",
        "manager_hr",
        "hr_leave_office",
        "hr_office",
        "loan_office",
      ].includes(role)

    if (!canSelfApply) {
      return NextResponse.json({ error: "Only staff, managers, and admins can update leave plans." }, { status: 403 })
    }

    const body = await request.json()
    const {
      id,
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

    if (!id || !preferred_start_date || !preferred_end_date) {
      return NextResponse.json({ error: "id, start date, and end date are required." }, { status: 400 })
    }

    if ((leave_year_period || YEAR_PERIOD) !== YEAR_PERIOD) {
      return NextResponse.json({ error: "Only 2026/2027 leave period is supported in this workflow." }, { status: 400 })
    }

    const { data: existing, error: existingError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, status")
      .eq("id", id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: "Leave plan request not found." }, { status: 404 })
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "You can only update your own leave request." }, { status: 403 })
    }

    if (!EDITABLE_STATUSES.includes(String(existing.status || "") as any)) {
      return NextResponse.json({ error: "This leave request cannot be edited at its current stage." }, { status: 400 })
    }

    const requestedDays = calculateRequestedDays(preferred_start_date, preferred_end_date)
    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Invalid leave date range." }, { status: 400 })
    }

    const overlapSuggestion = await findOverlapSuggestion(
      admin,
      user.id,
      preferred_start_date,
      preferred_end_date,
      requestedDays,
      id,
    )
    if (overlapSuggestion) {
      return NextResponse.json(
        {
          error: "The selected leave period overlaps with an existing leave request.",
          code: "LEAVE_DATE_OVERLAP",
          ...overlapSuggestion,
        },
        { status: 409 },
      )
    }

    const leaveTypeKey = String(leave_type || "annual").toLowerCase()
    const entitlementResult = await resolveEntitlementDays(admin, leaveTypeKey)
    if (entitlementResult.error) {
      return NextResponse.json({ error: entitlementResult.error }, { status: 400 })
    }
    const entitlementDays = entitlementResult.entitlementDays

    if (entitlementDays !== null && requestedDays > entitlementDays) {
      return NextResponse.json(
        {
          error: `Requested ${requestedDays} day(s) exceeds entitlement of ${entitlementDays} day(s) for this leave type. HR Leave Office may adjust the final leave days with a reason after review.`,
          code: "LEAVE_ENTITLEMENT_EXCEEDED",
          entitlement_days: entitlementDays,
          requested_days: requestedDays,
        },
        { status: 400 },
      )
    }

    const duplicateRequest = await findDuplicateLeaveRequest(
      admin,
      user.id,
      leaveTypeKey,
      preferred_start_date,
      preferred_end_date,
      id,
    )
    if (duplicateRequest) {
      return NextResponse.json(
        {
          error: "This leave request has already been submitted with the same leave type and date range.",
          code: "DUPLICATE_LEAVE_REQUEST",
          duplicate: duplicateRequest,
        },
        { status: 409 },
      )
    }

    const sameMonthRequestEdit = await findSameMonthSameTypeRequest(
      admin,
      user.id,
      leaveTypeKey,
      preferred_start_date,
      id,
    )
    if (sameMonthRequestEdit) {
      const monthName = new Date(preferred_start_date).toLocaleString("default", { month: "long", year: "numeric" })
      return NextResponse.json(
        {
          error: `You already have an active ${leaveTypeKey.replace(/_/g, " ")} request for ${monthName} (${sameMonthRequestEdit.start_date} to ${sameMonthRequestEdit.end_date}). Only one request per leave type per month is allowed.`,
          code: "SAME_MONTH_LEAVE_REQUEST",
          existing: sameMonthRequestEdit,
        },
        { status: 409 },
      )
    }

    const updatePayload: Record<string, any> = {
      leave_year_period: YEAR_PERIOD,
      preferred_start_date,
      preferred_end_date,
      leave_type_key: leaveTypeKey,
      entitlement_days: entitlementDays,
      requested_days: requestedDays,
      reason: reason || null,
      status: "pending_manager_review",
      manager_recommendation: null,
      updated_at: new Date().toISOString(),
    }

    if (user_signature_mode !== undefined) updatePayload.user_signature_mode = user_signature_mode || "typed"
    if (user_signature_text !== undefined) updatePayload.user_signature_text = user_signature_text || null
    if (user_signature_image_url !== undefined) updatePayload.user_signature_image_url = user_signature_image_url || null
    if (user_signature_data_url !== undefined) updatePayload.user_signature_data_url = user_signature_data_url || null

    const { data: updated, error: updateError } = await admin
      .from("leave_plan_requests")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: "Failed to update leave request." }, { status: 500 })
    }

    const reviewers = await resolveManagerReviewers(admin, user.id, (profile as any).department_id || null)
    if (reviewers.length === 0) {
      return NextResponse.json(
        {
          error: "No regional manager or department head is configured for this workflow.",
        },
        { status: 400 },
      )
    }

    await syncManagerReviews(admin, id, reviewers)

    return NextResponse.json({ success: true, request: updated })
  } catch (error: any) {
    console.error("[v0] Leave planning PUT error:", error)
    return NextResponse.json({ error: error?.message || "Failed to update leave planning request." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const id = String(body?.id || "")
    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 })
    }

    const { data: existing, error: existingError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id, status")
      .eq("id", id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: "Leave plan request not found." }, { status: 404 })
    }

    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "You can only delete your own leave request." }, { status: 403 })
    }

    if (!EDITABLE_STATUSES.includes(String(existing.status || "") as any)) {
      return NextResponse.json({ error: "This leave request cannot be deleted at its current stage." }, { status: 400 })
    }

    await admin.from("leave_plan_reviews").delete().eq("leave_plan_request_id", id)
    const { error: deleteError } = await admin.from("leave_plan_requests").delete().eq("id", id)
    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Leave planning DELETE error:", error)
    return NextResponse.json({ error: error?.message || "Failed to delete leave planning request." }, { status: 500 })
  }
}
