import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { computeLeaveDays, computeReturnToWorkDate } from "@/lib/leave-policy"
import { validateMeaningfulText } from "@/lib/meaningful-text"

const NON_ANNUAL_REQUIRES_APPROVED_ANNUAL = new Set([
  "sick",
  "maternity",
  "paternity",
  "study_with_pay",
  "study_without_pay",
  "casual",
  "compassionate",
  "special_unpaid",
])

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
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const staleOpenCheckout = rows.find((row: any) => {
    if (!row?.check_in_time || row?.check_out_time) return false
    const checkInDate = new Date(row.check_in_time)
    return checkInDate.toDateString() !== now.toDateString()
  })

  if (staleOpenCheckout) {
    return {
      ok: false as const,
      status: 403,
      error:
        "Please complete your pending check-out first in Attendance before submitting a leave request.",
      message:
        "Kindly pass through Attendance and complete your check-out. It helps HR process your leave quickly and keeps your records clean.",
    }
  }

  const hasRecentAttendance = rows.some((row: any) => {
    if (!row?.check_in_time) return false
    const checkInDate = new Date(row.check_in_time)
    return checkInDate >= sevenDaysAgo
  })

  if (!hasRecentAttendance) {
    return {
      ok: false as const,
      status: 403,
      error:
        "Attendance activity is required before requesting leave. Please check in and check out properly using the Attendance module.",
      message:
        "Please use the Attendance module consistently. If attendance usage is repeatedly missing, future leave and loan requests may be restricted.",
    }
  }

  return { ok: true as const }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Handle FormData for file uploads
    const formData = await request.formData()
    const start_date = formData.get("start_date") as string
    const end_date = formData.get("end_date") as string
    const reason = formData.get("reason") as string
    const leave_type = formData.get("leave_type") as string
    const leave_year_period = (formData.get("leave_year_period") as string) || "2026/2027"
    const document = formData.get("document") as File | null

    if (!start_date || !end_date || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const reasonValidation = validateMeaningfulText(reason, {
      fieldLabel: "Leave reason",
      minLength: 10,
    })
    if (!reasonValidation.ok) {
      return NextResponse.json({ error: reasonValidation.error }, { status: 400 })
    }

    const requestedDays = computeLeaveDays(start_date, end_date)
    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Invalid leave date range" }, { status: 400 })
    }

    const { data: roleProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const normalizedRole = String((roleProfile as any)?.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    const shouldEnforceAttendance = !["admin", "regional_manager", "department_head"].includes(normalizedRole)
    if (shouldEnforceAttendance) {
      const admin = await createAdminClient()
      const attendanceCheck = await validateAttendanceEngagementForRequest(admin, user.id)
      if (!attendanceCheck.ok) {
        return NextResponse.json(
          {
            error: attendanceCheck.error,
            message: attendanceCheck.message,
          },
          { status: attendanceCheck.status },
        )
      }
    }

    const canSubmitBeyondEntitlementForHrAdjustment =
      normalizedRole === "admin" ||
      normalizedRole === "regional_manager" ||
      normalizedRole === "department_head" ||
      normalizedRole.includes("manager")

    const leaveTypeKey = String(leave_type || "annual").toLowerCase().trim()

    if (NON_ANNUAL_REQUIRES_APPROVED_ANNUAL.has(leaveTypeKey)) {
      try {
        const { data: annualApproval, error: annualError } = await supabase
          .from("leave_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("leave_year_period", leave_year_period)
          .eq("leave_type", "annual")
          .eq("status", "approved")
          .limit(1)
          .maybeSingle()

        if (!annualError && !annualApproval) {
          return NextResponse.json(
            {
              error:
                "Annual leave must be approved first before applying for this leave type under current policy.",
            },
            { status: 400 },
          )
        }
      } catch {
        // Graceful fallback for legacy schemas without leave_type/leave_year_period columns.
      }
    }

    const returnToWorkDate = computeReturnToWorkDate(end_date)

    // Enforce entitlement policy (if policy table exists).
    try {
      const { data: policyRows, error: policyError } = await supabase
        .from("leave_policy_catalog")
        .select("entitlement_days, is_enabled")
        .eq("leave_year_period", leave_year_period)
        .eq("leave_type_key", leaveTypeKey)
        .limit(1)

      if (!policyError && policyRows && policyRows.length > 0) {
        const policy = policyRows[0] as any
        if (!policy.is_enabled) {
          return NextResponse.json({ error: "Selected leave type is currently disabled by policy." }, { status: 400 })
        }

        if (requestedDays > Number(policy.entitlement_days || 0) && !canSubmitBeyondEntitlementForHrAdjustment) {
          return NextResponse.json(
            {
              error: `Requested ${requestedDays} day(s) exceeds entitlement of ${policy.entitlement_days} for this leave type.`,
            },
            { status: 400 },
          )
        }
      }
    } catch {
      // Continue gracefully if policy table is not migrated yet.
    }

    let document_url = null

    // Handle file upload if provided
    if (document) {
      const fileExt = (document as any).name?.split('.').pop()
      const fileName = `${user.id}_${Date.now()}.${fileExt || 'bin'}`

      // Attempt upload with the current server client
      let uploadResult = await supabase.storage.from('leave-documents').upload(fileName, document)

      // If upload failed because the bucket is missing (404) and we have a service role key,
      // try to create the bucket and retry once.
      if (uploadResult.error) {
        console.error('Initial file upload error:', uploadResult.error)

        const isNotFound = (uploadResult.error as any)?.status === 404 || (uploadResult.error as any)?.statusCode === '404'

        if (isNotFound && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          try {
            // Create an admin client to manage buckets
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { createClient: createAdminClient } = require('@supabase/supabase-js')
            const admin = createAdminClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY
            )

            // Ensure bucket exists (public: false)
            const { error: createBucketError } = await admin.storage.createBucket('leave-documents', { public: false })
            if (createBucketError && (createBucketError as any).status !== 409) {
              console.error('Failed to create storage bucket leave-documents:', createBucketError)
            } else {
              // Retry upload once
              uploadResult = await supabase.storage.from('leave-documents').upload(fileName, document)
            }
          } catch (e) {
            console.error('Error while attempting to create bucket with service role key:', e)
          }
        }
      }

      if (uploadResult.error) {
        // Surface more details to make diagnosis easier
        console.error('Final file upload error:', uploadResult.error)
        const msg = (uploadResult.error as any)?.message || 'Failed to upload document'
        const status = (uploadResult.error as any)?.status || (uploadResult.error as any)?.statusCode || 500
        return NextResponse.json({ error: msg, details: uploadResult.error }, { status: Number(status) || 500 })
      }

      document_url = uploadResult.data?.path || null
    }

    const autoApproveRoles = ["admin", "regional_manager", "department_head"]
    const shouldAutoApprove = normalizedRole ? autoApproveRoles.includes(normalizedRole) : false

    // Create leave request (status depends on role)
    const payload: any = {
      user_id: user.id,
      start_date,
      end_date,
      reason: reasonValidation.normalized,
      leave_type: leaveTypeKey,
      leave_year_period,
      status: shouldAutoApprove ? "approved" : "pending",
      approved_by: shouldAutoApprove ? user.id : null,
      approved_at: shouldAutoApprove ? new Date().toISOString() : null,
      document_url,
    }

    // Try insert; if column not found (schema mismatch), retry without `leave_type` and return a helpful error
    let leaveRequest: any = null
    let requestError: any = null

    try {
      const res = await supabase.from("leave_requests").insert(payload).select().single()
      leaveRequest = res.data
      requestError = res.error
    } catch (e) {
      requestError = e
    }

    if (requestError) {
      const msg = (requestError && requestError.message) || String(requestError)
      const isMissingColumn =
        /Could not find the .*column/i.test(msg) ||
        /column ".*" does not exist/i.test(msg)

      if (isMissingColumn) {
        console.warn("leave_type/leave_year_period columns missing in DB schema; retrying without optional columns and advising migration")
        // remove optional columns and retry
        const altPayload = { ...payload }
        delete altPayload.leave_type
        delete altPayload.leave_year_period
        try {
          const res2 = await supabase.from("leave_requests").insert(altPayload).select().single()
          leaveRequest = res2.data
          requestError = res2.error
        } catch (e2) {
          requestError = e2
        }

        if (!requestError) {
          // Insert succeeded without leave_type; warn and continue
          console.warn("Inserted leave_request without leave_type. Please apply DB migration to add `leave_type` column.")
        } else {
          console.error("Retry insert without leave_type also failed:", requestError)
          return NextResponse.json({
            error: "Database schema mismatch: missing leave_type column. Apply the leave migration and try again.",
            details: requestError.message || String(requestError),
          }, { status: 500 })
        }
      } else {
        console.error("Failed to create leave_request:", requestError)
        return NextResponse.json({ error: requestError.message || String(requestError) }, { status: 400 })
      }
    }

    // Create notification for the leave request
    const { error: notificationError } = await supabase
      .from("leave_notifications")
      .insert({
        leave_request_id: leaveRequest.id,
        user_id: user.id,
        notification_type: shouldAutoApprove ? "leave_approved" : "leave_request",
        status: shouldAutoApprove ? "approved" : "pending",
      })

    if (notificationError) {
      console.warn("Failed to create leave notification:", notificationError.message)
    }

    // ── HOD notification via loan_hod_linkages ──────────────────────────────
    // Resolve the staff's HOD using the same linkage table as the loan system,
    // then notify them so they can approve in the leave management queue.
    if (!shouldAutoApprove) {
      try {
        const admin = await createAdminClient()
        const hodIds: string[] = []

        // 1. Primary: explicit linkage table (same as loan workflow)
        const { data: linkageRows } = await admin
          .from("loan_hod_linkages")
          .select("hod_user_id")
          .eq("staff_user_id", user.id)
          .limit(20)

        for (const row of linkageRows || []) {
          const id = (row as any)?.hod_user_id
          if (id && !hodIds.includes(id)) hodIds.push(id)
        }

        // 2. Fallback: department_head in same department
        if (hodIds.length === 0) {
          const { data: staffProfile } = await admin
            .from("user_profiles")
            .select("department_id, first_name, last_name, assigned_location_id")
            .eq("id", user.id)
            .maybeSingle()

          if ((staffProfile as any)?.department_id) {
            const { data: deptHods } = await admin
              .from("user_profiles")
              .select("id")
              .eq("department_id", (staffProfile as any).department_id)
              .eq("role", "department_head")
              .eq("is_active", true)
              .limit(10)

            for (const hod of deptHods || []) {
              const id = (hod as any)?.id
              if (id && !hodIds.includes(id)) hodIds.push(id)
            }
          }

          // 3. Further fallback: regional_manager at same location
          if (hodIds.length === 0 && (staffProfile as any)?.assigned_location_id) {
            const { data: rmList } = await admin
              .from("user_profiles")
              .select("id")
              .eq("assigned_location_id", (staffProfile as any).assigned_location_id)
              .eq("role", "regional_manager")
              .eq("is_active", true)
              .limit(5)

            for (const rm of rmList || []) {
              const id = (rm as any)?.id
              if (id && !hodIds.includes(id)) hodIds.push(id)
            }
          }
        }

        if (hodIds.length > 0) {
          const { data: staffProfile } = await admin
            .from("user_profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .maybeSingle()
          const staffName = staffProfile
            ? `${(staffProfile as any).first_name || ""} ${(staffProfile as any).last_name || ""}`.trim()
            : "A staff member"
          const notifRows = hodIds.map((hodId) => ({
            user_id: hodId,
            title: "New Leave Request",
            message: `${staffName} has submitted a leave request from ${start_date} to ${end_date}. Please review in Leave Management.`,
            type: "leave_request",
            data: { leave_request_id: leaveRequest.id, staff_user_id: user.id },
            is_read: false,
          }))
          await admin.from("staff_notifications").insert(notifRows)
        }
      } catch (hodErr) {
        // Non-fatal: HOD notification failure should not block the leave submission.
        console.warn("HOD leave notification failed:", hodErr)
      }
    }
    // ── end HOD notification ────────────────────────────────────────────────

    // If auto-approved, also populate per-day leave_status rows (trigger only handles updates)
    if (shouldAutoApprove) {
      try {
        const start = new Date(start_date)
        const end = new Date(end_date)
        const dates: string[] = []
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(new Date(d).toISOString().split("T")[0])
        }

        const rows = dates.map((dt) => ({
          user_id: user.id,
          date: dt,
          status: "on_leave",
          leave_request_id: leaveRequest.id,
        }))

        // Upsert to avoid conflicts
        const { error: leaveStatusError } = await supabase.from("leave_status").upsert(rows)
        if (leaveStatusError) {
          console.error("Failed to populate leave_status for auto-approved request:", leaveStatusError)
        }

        const today = new Date().toISOString().split("T")[0]
        const effectiveStatus = today >= start_date && today <= end_date ? "on_leave" : "active"

        const { error: profileUpdateError } = await supabase
          .from("user_profiles")
          .update({
            leave_status: effectiveStatus,
            leave_start_date: start_date,
            leave_end_date: end_date,
            leave_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id)

        if (profileUpdateError) {
          console.error("Failed updating user_profiles leave fields for auto-approved request:", profileUpdateError)
        }
      } catch (e) {
        console.error("Error populating leave_status for auto-approved request:", e)
      }
    }

    return NextResponse.json(
      {
        message: "Leave request submitted successfully",
        requestedDays,
        entitlementPeriod: leave_year_period,
        returnToWorkDate,
        leaveRequest,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Error creating leave request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const id = String(body?.id || "")
    const start_date = String(body?.start_date || "")
    const end_date = String(body?.end_date || "")
    const reason = String(body?.reason || "").trim()
    const leave_type = String(body?.leave_type || "").trim().toLowerCase()

    if (!id || !start_date || !end_date || !reason || !leave_type) {
      return NextResponse.json({ error: "id, start_date, end_date, leave_type and reason are required" }, { status: 400 })
    }

    const reasonValidation = validateMeaningfulText(reason, {
      fieldLabel: "Leave reason",
      minLength: 10,
    })
    if (!reasonValidation.ok) {
      return NextResponse.json({ error: reasonValidation.error }, { status: 400 })
    }

    const requestedDays = computeLeaveDays(start_date, end_date)
    if (requestedDays <= 0) {
      return NextResponse.json({ error: "Invalid leave date range" }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from("leave_requests")
      .select("id, user_id, status, approved_by, approved_at")
      .eq("id", id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 })
    }

    if (String(existing.user_id) !== user.id) {
      return NextResponse.json({ error: "You can only edit your own leave request" }, { status: 403 })
    }

    const hasReviewerAction =
      String(existing.status || "") !== "pending" ||
      Boolean(existing.approved_by) ||
      Boolean(existing.approved_at)

    if (hasReviewerAction) {
      return NextResponse.json(
        { error: "This leave request can no longer be edited because review has already started." },
        { status: 409 },
      )
    }

    const { data: reviewedNotification } = await supabase
      .from("leave_notifications")
      .select("id, status")
      .eq("leave_request_id", id)
      .neq("status", "pending")
      .limit(1)
      .maybeSingle()

    if (reviewedNotification?.id) {
      return NextResponse.json(
        { error: "This leave request can no longer be edited because it is already being handled." },
        { status: 409 },
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from("leave_requests")
      .update({
        start_date,
        end_date,
        reason: reasonValidation.normalized,
        leave_type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message || "Failed to update leave request" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: "Leave request updated successfully.", data: updated })
  } catch (error) {
    console.error("Error updating leave request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
