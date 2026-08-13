import { createAdminClient, createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { computeLeaveDays, computeReturnToWorkDate, getMaternityEntitlementDays } from "@/lib/leave-policy"
import { validateMeaningfulText } from "@/lib/meaningful-text"
import { getNextQccReference } from "@/lib/reference-number"
import { calculateAnnualLeaveBreakdown } from "@/lib/annual-leave-calculator"
import { REGIONAL_NON_ANNUAL_STAGES, isAnnualLeave, isRegionalHrLeaveOfficeRole, resolveRegionalHrOffice, routeLeave } from "@/lib/hr-workflow"

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
    const requested_days_raw = formData.get("requested_days") as string | null
    const requested_days = requested_days_raw ? Number(requested_days_raw) : null
    const leave_type = formData.get("leave_type") as string
    const leave_year_period = (formData.get("leave_year_period") as string) || "2026/2027"
    const document = formData.get("document") as File | null
    const maternity_delivery_type = formData.get("maternity_delivery_type") as string | null
    const delivery_date = formData.get("delivery_date") as string | null

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

    const leaveTypeKey = String(leave_type || "annual").toLowerCase().trim()
    const explicitRequestedDays = requested_days_raw !== null && requested_days_raw.trim() !== ""
    const requestedDays = explicitRequestedDays && Number.isInteger(requested_days) && requested_days > 0
      ? requested_days
      : computeLeaveDays(start_date, end_date)
    if (requestedDays <= 0 || (explicitRequestedDays && (!Number.isInteger(requested_days) || requested_days <= 0))) {
      return NextResponse.json({ error: "Invalid leave date range" }, { status: 400 })
    }

    const { data: roleProfile } = await supabase
      .from("user_profiles")
      .select("role, staff_category, date_of_appointment, years_of_service, position, rank")
      .eq("id", user.id)
      .maybeSingle()

    const normalizedRole = String((roleProfile as any)?.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
    const admin = await createAdminClient()
    const referenceNumber = await getNextQccReference(admin)

    const canSubmitBeyondEntitlementForHrAdjustment =
      normalizedRole === "admin" ||
      normalizedRole === "regional_manager" ||
      normalizedRole === "department_head" ||
      normalizedRole.includes("manager")

    if (leaveTypeKey === "maternity" || leaveTypeKey === "paternity") {
      if (!document || document.size === 0) {
        return NextResponse.json({ error: leaveTypeKey === "paternity" ? "Spouse delivery proof is required for paternity leave." : "Maternity evidence is required." }, { status: 400 })
      }
    }

    if (leaveTypeKey === "maternity") {
      if (!["normal", "cs", "twins", "regular", "cs_twins"].includes(String(maternity_delivery_type || ""))) {
        return NextResponse.json({ error: "Select normal delivery, Caesarean section, or twins delivery." }, { status: 400 })
      }
      if (!delivery_date) {
        return NextResponse.json({ error: "Delivery date is required for maternity leave." }, { status: 400 })
      }
      const maternityDays = getMaternityEntitlementDays(maternity_delivery_type)
      const expectedEnd = new Date(start_date)
      expectedEnd.setDate(expectedEnd.getDate() + maternityDays - 1)
      const expectedEndDate = expectedEnd.toISOString().split("T")[0]
      if (end_date !== expectedEndDate || requestedDays !== maternityDays) {
        return NextResponse.json({ error: `Maternity leave must be ${maternityDays} days for the selected delivery type.` }, { status: 400 })
      }
    }

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

    // Annual leave uses the staff-specific entitlement plus travel days.
    // Travel days are included in the allowed total but remain separately tracked.
    const annualCalculation = leaveTypeKey === "annual" || leaveTypeKey === "annual_leave"
      ? calculateAnnualLeaveBreakdown((roleProfile as any) || {}, 0)
      : null

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

        const allowedEntitlement = annualCalculation?.totalGrantedDays ?? Number(policy.entitlement_days || 0)
        const zeroEntitlementDecisionRequest = allowedEntitlement === 0 && explicitRequestedDays
        if (requestedDays > allowedEntitlement && !canSubmitBeyondEntitlementForHrAdjustment && !zeroEntitlementDecisionRequest) {
          return NextResponse.json(
            {
              error: `Requested ${requestedDays} day(s) exceeds the available annual leave total of ${allowedEntitlement} day(s) (including travelling days).`,
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

    const autoApproveRoles = ["admin"]
    const shouldAutoApprove = normalizedRole ? autoApproveRoles.includes(normalizedRole) : false
    const staffRoutingProfile = await admin
      .from("user_profiles")
      .select("region_id, assigned_location_id")
      .eq("id", user.id)
      .maybeSingle()

    const routingProfile = (staffRoutingProfile.data || {}) as any
    let regionId = routingProfile.region_id || null
    let locationName: string | null = null
    if (routingProfile.assigned_location_id) {
      const { data: assignedLocation } = await admin
        .from("geofence_locations")
        .select("name, address, districts (region_id)")
        .eq("id", routingProfile.assigned_location_id)
        .maybeSingle()
      locationName = assignedLocation?.name || assignedLocation?.address || null
      regionId = regionId || (assignedLocation?.districts as any)?.region_id || null
    }

    const regionalOffice = await resolveRegionalHrOffice(admin, regionId)
    const leaveRoute = routeLeave({
      leaveType: leaveTypeKey,
      locationName,
      hasRegionalOffice: Boolean(regionalOffice),
    })
    const initialStatus = shouldAutoApprove
      ? "approved"
      : leaveRoute.route === "regional_non_annual" && leaveRoute.firstStage
        ? leaveRoute.firstStage
        : "pending"

    // Create leave request (status depends on role and route)
    const payload: any = {
      user_id: user.id,
      reference_number: referenceNumber,
      start_date,
      end_date,
      reason: reasonValidation.normalized,
      leave_type: leaveTypeKey,
      leave_year_period,
      status: initialStatus,
      approved_by: shouldAutoApprove ? user.id : null,
      approved_at: shouldAutoApprove ? new Date().toISOString() : null,
      document_url,
      requested_days: requestedDays,
      maternity_delivery_type: leaveTypeKey === "maternity" ? maternity_delivery_type : null,
      delivery_date: leaveTypeKey === "maternity" ? delivery_date : null,
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
        delete altPayload.reference_number
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

    // Regional non-annual requests start with Regional HR Office adjustment and must not notify HOD.
    const isRegionalNonAnnual = leaveRoute.route === "regional_non_annual" && Boolean(leaveRoute.firstStage)
    const isHrLeaveOffice = normalizedRole === "hr_leave_office" || isRegionalHrLeaveOfficeRole(normalizedRole)

    if (!shouldAutoApprove && !isHrLeaveOffice && !isRegionalNonAnnual) {
      try {
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

        // 2. Fallback: department_head, manager_hr, director_hr in same department
        if (hodIds.length === 0) {
          const { data: staffProfile } = await admin
            .from("user_profiles")
            .select("department_id, region_id, first_name, last_name, assigned_location_id")
            .eq("id", user.id)
            .maybeSingle()

          // Regional non-annual leave must go to the Regional Manager first.
          // The Regional HR Office role is the regional leave-office owner, while the
          // Regional Manager linkage determines the staff population it serves.
          const isNonAnnualLeave = leaveTypeKey !== "annual" && leaveTypeKey !== "annual_leave"
          if (isNonAnnualLeave && (staffProfile as any)?.region_id) {
            const { data: regionalManagers } = await admin
              .from("user_profiles")
              .select("id")
              .eq("region_id", (staffProfile as any).region_id)
              .eq("role", "regional_manager")
              .eq("is_active", true)
              .limit(5)

            for (const manager of regionalManagers || []) {
              const id = (manager as any)?.id
              if (id && !hodIds.includes(id)) hodIds.push(id)
            }
          }

          if (hodIds.length === 0 && (staffProfile as any)?.department_id) {
            // Fetch all possible HOD roles (department_head, manager_hr, director_hr)
            const { data: deptHods } = await admin
              .from("user_profiles")
              .select("id, role")
              .eq("department_id", (staffProfile as any).department_id)
              .in("role", ["department_head", "manager_hr", "director_hr"])
              .eq("is_active", true)
              .limit(20)

            for (const hod of deptHods || []) {
              const id = (hod as any)?.id
              if (id && !hodIds.includes(id)) hodIds.push(id)
            }
          }

          // Fallback: regional_manager at the same location
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

        if (hodIds.length === 0) {
          return NextResponse.json(
            {
              error:
                "No HOD/manager routing found for your profile. Please contact HR/Admin to complete staff-to-HOD linkage before submitting leave.",
            },
            { status: 400 },
          )
        }

        const leaveNotifications = hodIds.map((hodId) => ({
          leave_request_id: leaveRequest.id,
          recipient_id: hodId,
          sender_id: user.id,
          notification_type: "leave_request_hod",
          message: `Leave request requires your review (${start_date} to ${end_date}).`,
          status: "pending_hod",
        }))

        const { error: leaveNotifError } = await admin.from("leave_notifications").insert(leaveNotifications)
        if (leaveNotifError) {
          console.warn("Failed to create HOD leave notifications:", leaveNotifError.message)
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
            recipient_id: hodId,
            title: "New Leave Request",
            message: `${staffName} has submitted a leave request from ${start_date} to ${end_date}. Please review in Leave Management.`,
            type: "leave_request",
            data: { leave_request_id: leaveRequest.id, staff_user_id: user.id },
            is_read: false,
          }))
          await admin.from("staff_notifications").insert(notifRows)

          // Send email notifications to HODs for prompt review
          try {
            const { data: hodProfiles } = await admin
              .from("user_profiles")
              .select("email, first_name, last_name, role")
              .in("id", hodIds)
            
            if (hodProfiles && hodProfiles.length > 0) {
              const staffProfile = await admin
                .from("user_profiles")
                .select("first_name, last_name, employee_id")
                .eq("id", user.id)
                .maybeSingle()
              
              const staffData = staffProfile.data as any
              const staffName = `${staffData?.first_name || ""} ${staffData?.last_name || ""}`.trim()
              const staffId = staffData?.employee_id || "N/A"
              
              // Create email notifications
              const emailNotifications = hodProfiles.map((hod: any) => ({
                recipient_email: hod.email,
                recipient_id: hod.id,
                subject: `[URGENT] Leave Request from ${staffName} - Awaiting Review`,
                message: `A new leave request from ${staffName} (ID: ${staffId}) requires your review:\n\nLeave Period: ${start_date} to ${end_date}\nReason: ${reasonValidation.normalized}\n\nPlease review and endorse promptly in the Leave Management system.`,
                notification_type: "leave_request_hod",
                leave_request_id: leaveRequest.id,
                is_sent: false,
                created_at: new Date().toISOString(),
              }))
              
              const { error: emailError } = await admin
                .from("email_notifications")
                .insert(emailNotifications)
              
              if (emailError) {
                console.warn("Failed to queue email notifications to HODs:", emailError.message)
              } else {
                console.log(`[v0] Queued ${emailNotifications.length} email notifications to HODs for leave request ${leaveRequest.id}`)
              }
            }
          } catch (emailErr) {
            // Non-fatal: email notification failure should not block the leave submission
            console.warn("HOD email notification setup failed:", emailErr)
          }
        }
      } catch (hodErr) {
        // Non-fatal: HOD notification failure should not block the leave submission.
        console.warn("HOD leave notification failed:", hodErr)
      }
    }
    if (!shouldAutoApprove && !isHrLeaveOffice && isRegionalNonAnnual && regionalOffice?.user_id) {
      const regionalHrId = regionalOffice.user_id
      const message = `Regional leave request requires HR Office adjustment (${start_date} to ${end_date}).`
      await admin.from("leave_notifications").insert({
        leave_request_id: leaveRequest.id,
        recipient_id: regionalHrId,
        sender_id: user.id,
        notification_type: "leave_request_regional_hr",
        message,
        status: "pending_regional_hr_review",
      })
      await admin.from("staff_notifications").insert({
        recipient_id: regionalHrId,
        title: "Regional Leave Request",
        message,
        type: "leave_request_regional_hr",
        data: { leave_request_id: leaveRequest.id, staff_user_id: user.id },
        is_read: false,
      })
    }
    // ── end leave notification ────────────────────────────────────────────────

    if (shouldAutoApprove) {
      const { error: notificationError } = await supabase
        .from("leave_notifications")
        .insert({
          leave_request_id: leaveRequest.id,
          recipient_id: user.id,
          sender_id: user.id,
          notification_type: "leave_approved",
          message: "Leave auto-approved by admin workflow.",
          status: "approved",
        })

      if (notificationError) {
        console.warn("Failed to create leave notification:", notificationError.message)
      }
    }

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
