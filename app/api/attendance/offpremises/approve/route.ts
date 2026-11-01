import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"
import { isNonRegionalLocation } from "@/lib/location-mappings"
import { isRegionalManagerLocationMatch, loadLocationHierarchyMap } from "@/lib/regional-manager-scope"
import { emailService } from "@/lib/email-service"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { request_id, approved, comments, user_id } = body

    if (!request_id) {
      return NextResponse.json(
        { error: "Request ID is required" },
        { status: 400 }
      )
    }

    if (!user_id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    console.log("[v0] Processing approval:", { request_id, approved, manager_id: user_id })

    const supabase = await createAdminClient()

    // Verify the approver is a department head, regional manager, or admin
    const { data: approverProfile, error: approverError } = await supabase
      .from("user_profiles")
      .select("role, department_id, assigned_location_id")
      .eq("id", user_id)
      .single()

    if (approverError || !approverProfile) {
      console.error("[v0] Failed to get approver profile:", approverError)
      return NextResponse.json(
        { error: "Approver profile not found" },
        { status: 404 }
      )
    }

    const approverRole = normalizeAppRole(approverProfile.role)
    const roleLabel = String(approverProfile.role || "").trim().toLowerCase().replace(/[ -]+/g, "_")
    const canApproveAsAdmin = approverRole === "admin" || roleLabel === "super_admin" || roleLabel === "system_admin"
    const canApproveAsHod = approverRole === "department_head" || roleLabel.includes("department_head") || roleLabel.includes("dept_head") || roleLabel === "hod" || roleLabel.includes("head_of_department")
    const canApproveAsRm = isRegionalManagerRole(approverRole) || roleLabel.includes("regional_manager") || roleLabel === "rm" || roleLabel.includes("regional_director")
    const canApproveAsRegionalHr = isRegionalHrRole(approverRole) || roleLabel.includes("regional_hr") || roleLabel.includes("regional_human")
    if (!canApproveAsAdmin && !canApproveAsHod && !canApproveAsRm && !canApproveAsRegionalHr) {
      console.error("[v0] User not authorized to approve:", approverProfile.role)
      return NextResponse.json(
        { error: "Only the staff member's HOD, Regional Manager, Regional HR, or an administrator can approve off-premises check-ins" },
        { status: 403 }
      )
    }

    // Get the pending check-in request with staff details
    const { data: pendingRequest, error: getError } = await supabase
      .from("pending_offpremises_checkins")
      .select(`
        *,
        user_profiles!pending_offpremises_checkins_user_id_fkey (
          id,
          first_name,
          last_name,
          email,
          department_id,
          assigned_location_id
        )
      `)
      .eq("id", request_id)
      .single()

    if (getError || !pendingRequest) {
      console.error("[v0] Request not found:", getError)
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 }
      )
    }

    if (pendingRequest.status !== "pending") {
      console.error("[v0] Request already processed:", pendingRequest.status)
      return NextResponse.json(
        { error: "This request has already been processed" },
        { status: 400 }
      )
    }

    // Permission validation based on role
    const staffLocationId = pendingRequest.user_profiles?.assigned_location_id || null
    const locationMap = await loadLocationHierarchyMap(supabase, [approverProfile.assigned_location_id, staffLocationId])
    const staffLocation = locationMap.get(String(staffLocationId || ""))

    const { data: hodLinks } = await supabase
      .from("loan_hod_linkages")
      .select("hod_user_id")
      .eq("staff_user_id", pendingRequest.user_id)
    const hodIds = (hodLinks || []).map((link) => link.hod_user_id).filter(Boolean)
    const { data: hodProfiles } = hodIds.length
      ? await supabase.from("user_profiles").select("first_name, last_name").in("id", hodIds)
      : { data: [] as { first_name: string | null; last_name: string | null }[] }
    const headOfDepartment = (hodProfiles || [])
      .map((hod) => `${hod.first_name || ""} ${hod.last_name || ""}`.trim())
      .filter(Boolean)
      .join(", ") || "Not assigned"
    const requestReason = pendingRequest.reason || pendingRequest.purpose || "Not provided"

    if (canApproveAsAdmin) {
      // Admins can approve all requests
      console.log("[v0] Admin approving request")
    } else if (canApproveAsHod && (
      pendingRequest.user_profiles?.department_id !== approverProfile.department_id ||
      !isNonRegionalLocation(staffLocation?.name)
    )) {
      // Nonregional department heads can approve only their department's nonregional staff requests.
      console.error("[v0] Department head trying to approve outside their department")
      return NextResponse.json(
        { error: "You can only approve nonregional requests from staff in your department" },
        { status: 403 }
      )
    } else if ((canApproveAsRm || canApproveAsRegionalHr) && (
      !staffLocationId ||
      isNonRegionalLocation(staffLocation?.name) ||
      !isRegionalManagerLocationMatch(staffLocationId, staffLocation, approverProfile.assigned_location_id, locationMap)
    )) {
      return NextResponse.json(
        { error: "You can only approve regional or district office requests within your assigned regional office" },
        { status: 403 }
      )
    }

    if (approved) {
      console.log("[v0] Approving request (type=%s)", pendingRequest.request_type || 'checkin')

      // If this is a CHECK-OUT request, attempt to mark the staff member as checked out
      if ((pendingRequest.request_type || 'checkin') === 'checkout') {
        console.log('[v0] Processing off-premises CHECK-OUT approval')

        // Find today's open attendance record for the user (no check_out_time)
        const today = new Date().toISOString().split('T')[0]
        const { data: openAttendance, error: findError } = await supabase
          .from('attendance_records')
          .select('*')
          .eq('user_id', pendingRequest.user_id)
          .gte('check_in_time', `${today}T00:00:00`)
          .lte('check_in_time', `${today}T23:59:59`)
          .is('check_out_time', null)
          .order('check_in_time', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (findError) console.error('[v0] Error finding open attendance for checkout:', findError)

        if (openAttendance) {
          const checkOutTime = new Date(pendingRequest.created_at || new Date().toISOString()).toISOString()
          const checkInTime = new Date(openAttendance.check_in_time)
          const workHours = Math.round(((new Date(checkOutTime).getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100

          const updatePayload: any = {
            check_out_time: checkOutTime,
            check_out_location_id: null,
            check_out_latitude: pendingRequest.latitude || null,
            check_out_longitude: pendingRequest.longitude || null,
            check_out_location_name: pendingRequest.google_maps_name || pendingRequest.current_location_name || 'Off‑Premises (approved)',
            check_out_method: 'remote_offpremises',
            is_remote_checkout: true,
            work_hours: workHours,
            updated_at: new Date().toISOString(),
          }

          if (comments) updatePayload.early_checkout_reason = comments

          const coLat = pendingRequest.latitude
          const coLon = pendingRequest.longitude
          const coLocationName = pendingRequest.google_maps_name || pendingRequest.current_location_name || "Off-Premises Location"
          const coGpsStr = (coLat != null && coLon != null)
            ? ` GPS: ${Number(coLat).toFixed(5)}°, ${Number(coLon).toFixed(5)}°.`
            : ""
          updatePayload.notes = `Off-premises check-out. Location: ${coLocationName}.${coGpsStr}${comments ? " Comments: " + comments : ""}`

          const { data: updated, error: updateError } = await supabase
            .from('attendance_records')
            .update(updatePayload)
            .eq('id', openAttendance.id)
            .select()
            .single()

          if (updateError) {
            console.error('[v0] Failed to record remote checkout:', updateError)
            // continue to update request status below
          }

          // Update pending request status
          const { error: reqUpdateErr } = await supabase
            .from('pending_offpremises_checkins')
            .update({
              status: 'approved',
              approved_by_id: user_id,
              approved_at: new Date().toISOString(),
            })
            .eq('id', request_id)

          if (reqUpdateErr) {
            console.error('[v0] Failed to update request status after checkout approval:', reqUpdateErr)
            return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 })
          }

          // Notify staff
          try {
            await supabase.from('staff_notifications').insert({
              user_id: pendingRequest.user_id,
              type: 'offpremises_checkout_approved',
              title: 'Off‑Premises Check‑Out Approved',
              message: `Your off‑premises check‑out request from ${pendingRequest.google_maps_name || pendingRequest.current_location_name} has been approved — you were checked out remotely at ${new Date(checkOutTime).toLocaleString()}.`,
              data: { request_id, attendance_record_id: updated?.id },
              is_read: false,
            })
            const staffEmail = String(pendingRequest.user_profiles?.email || '').trim()
            if (staffEmail) {
              await emailService.sendEmail(staffEmail, {
                subject: 'Off-Premises Check-Out Approved',
                html: `<p>Your off-premises check-out request has been approved.</p><p>You were checked out remotely at ${new Date(checkOutTime).toLocaleString()}.</p>`,
                text: `Your off-premises check-out request has been approved. You were checked out remotely at ${new Date(checkOutTime).toLocaleString()}.`,
              }, { idempotencyKey: `offpremises-approved/${request_id}` })
            }
          } catch (err) {
            console.warn('[v0] Failed to send checkout approval notification:', err)
          }

          return NextResponse.json({ success: true, message: 'Off‑premises check‑out approved and recorded', attendance_record_id: updated?.id }, { status: 200 })
        } else {
          console.warn('[v0] No open attendance record found for user — approving request without recording checkout')

          // Mark request approved but inform approver that no open attendance record existed
          const { error: statusErr } = await supabase
            .from('pending_offpremises_checkins')
            .update({ status: 'approved', approved_by_id: user_id, approved_at: new Date().toISOString() })
            .eq('id', request_id)

          if (statusErr) {
            console.error('[v0] Failed to update request status (no open attendance):', statusErr)
            return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 })
          }

          // Notify staff
          try {
            await supabase.from('staff_notifications').insert({
              user_id: pendingRequest.user_id,
              type: 'offpremises_checkout_approved',
              title: 'Off‑Premises Check‑Out Approved (manual follow-up required)',
              message: `Your off‑premises check‑out request has been approved by your manager but no active check‑in was found to attach the checkout to. Please contact HR or your manager for manual correction.`,
              data: { request_id },
              is_read: false,
            })
            const staffEmail = String(pendingRequest.user_profiles?.email || '').trim()
            if (staffEmail) {
              await emailService.sendEmail(staffEmail, {
                subject: 'Off-Premises Request Approved',
                html: '<p>Your off-premises request has been approved by your manager.</p><p>No active check-in was found, so HR or your manager must complete the manual correction.</p>',
                text: 'Your off-premises request has been approved by your manager. No active check-in was found, so HR or your manager must complete the manual correction.',
              }, { idempotencyKey: `offpremises-approved/${request_id}` })
            }
          } catch (err) {
            console.warn('[v0] Failed to send notification (no open attendance):', err)
          }

          return NextResponse.json({ success: true, message: 'Request approved but no open attendance record found' }, { status: 200 })
        }
      }

      // Default: approve as a CHECK‑IN
      console.log("[v0] Approving request and creating/updating check-in")

      const requestTime = pendingRequest.created_at || new Date().toISOString()
      const requestDate = new Date(requestTime)
      const dayStart = new Date(requestDate)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(requestDate)
      dayEnd.setUTCHours(23, 59, 59, 999)

      const assignedLocationId = pendingRequest.user_profiles?.assigned_location_id || null
      let assignedLocationName: string | null = null

      if (assignedLocationId) {
        const { data: assignedLocation } = await supabase
          .from("geofence_locations")
          .select("name")
          .eq("id", assignedLocationId)
          .maybeSingle()

        assignedLocationName = assignedLocation?.name || null
      }

      const offPremisesLocationName = pendingRequest.google_maps_name || pendingRequest.current_location_name || "Off-Premises Location"
      const offPremisesLat = pendingRequest.latitude
      const offPremisesLon = pendingRequest.longitude
      const gpsStr = (offPremisesLat != null && offPremisesLon != null)
        ? ` GPS: ${Number(offPremisesLat).toFixed(5)}°, ${Number(offPremisesLon).toFixed(5)}°.`
        : ""

      const baseAttendancePayload: any = {
        actual_location_name: offPremisesLocationName,
        actual_latitude: offPremisesLat,
        actual_longitude: offPremisesLon,
        on_official_duty_outside_premises: true,
        device_info: pendingRequest.device_info,
        check_in_type: "offpremises_confirmed",
        check_in_method: "approved_offpremises",
        is_remote_location: true,
        status: "present",
        // Off-premises — do NOT link to the staff member's assigned geofence location
        check_in_location_id: null,
        check_in_location_name: offPremisesLocationName,
        updated_at: new Date().toISOString(),
        notes: `Off-premises check-in. Location: ${offPremisesLocationName}.${gpsStr}${comments ? " Comments: " + comments : ""}`,
      }

      const { data: existingAttendance, error: existingAttendanceError } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", pendingRequest.user_id)
        .gte("check_in_time", dayStart.toISOString())
        .lte("check_in_time", dayEnd.toISOString())
        .order("check_in_time", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingAttendanceError) {
        console.error("[v0] Failed to look up existing attendance record:", existingAttendanceError)
        return NextResponse.json(
          { error: "Failed to verify existing attendance for this request" },
          { status: 500 }
        )
      }

      let attendanceRecord = existingAttendance
      let attendanceError = null

      if (existingAttendance?.id) {
        const { data: updatedAttendance, error: updateAttendanceError } = await supabase
          .from("attendance_records")
          .update({
            ...baseAttendancePayload,
            // Keep existing check-in location only if it is not the assigned location placeholder;
            // for off-premises records always prefer the actual off-premises location name.
            check_in_location_id: null,
            check_in_location_name: offPremisesLocationName,
            check_in_method: existingAttendance.check_in_method || "approved_offpremises",
            status: existingAttendance.status || "present",
          })
          .eq("id", existingAttendance.id)
          .select()
          .single()

        attendanceRecord = updatedAttendance
        attendanceError = updateAttendanceError
      } else {
        const { data: newAttendanceRecord, error: insertAttendanceError } = await supabase
          .from("attendance_records")
          .insert({
            user_id: pendingRequest.user_id,
            check_in_time: requestTime,
            ...baseAttendancePayload,
          })
          .select()
          .single()

        attendanceRecord = newAttendanceRecord
        attendanceError = insertAttendanceError
      }

      if (attendanceError) {
        console.error("[v0] Failed to create/update attendance record:", attendanceError)
        return NextResponse.json(
          { error: attendanceError.message || "Failed to record approved off-premises attendance" },
          { status: 500 }
        )
      }

      // Update pending request status
      const { error: updateError2 } = await supabase
        .from("pending_offpremises_checkins")
        .update({
          status: "approved",
          approved_by_id: user_id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", request_id)

      if (updateError2) {
        console.error("[v0] Failed to update request status:", updateError2)
        return NextResponse.json(
          { error: "Failed to update request status" },
          { status: 500 }
        )
      }

      // Send notification to the staff member
      try {
        await supabase.from("staff_notifications").insert({
          user_id: pendingRequest.user_id,
          type: "offpremises_checkin_approved",
          title: "Off-Premises Check-In Approved",
          message: `Your off-premises check-in request from ${pendingRequest.google_maps_name || pendingRequest.current_location_name} has been approved. You are checked in to your assigned location on official duty.`,
          data: {
            request_id: request_id,
            attendance_record_id: attendanceRecord?.id,
          },
          is_read: false,
        })

        const staffEmail = String(pendingRequest.user_profiles?.email || "").trim()
        if (staffEmail) {
          await emailService.sendEmail(staffEmail, {
            subject: "Off-Premises Check-In Approved",
            html: `
              <div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#172554;">
                <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe5f0;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
                  <div style="background:#2563eb;padding:30px 34px;color:#ffffff;">
                    <div style="font-size:12px;letter-spacing:2px;font-weight:700;opacity:.85;">QCC ATTENDANCE</div>
                    <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;">Off-premises approval</h1>
                    <p style="margin:10px 0 0;font-size:15px;opacity:.9;">Your attendance request has been completed.</p>
                  </div>
                  <div style="padding:30px 34px;">
                    <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Hello ${pendingRequest.user_profiles?.first_name || "there"},</p>
                    <div style="border:1px solid #dbe5f0;border-radius:12px;padding:18px 20px;margin-bottom:22px;">
                      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Status</div>
                      <div style="margin-top:6px;color:#15803d;font-size:19px;font-weight:700;">Approved and checked in</div>
                    </div>
                    <p style="margin:0 0 10px;font-size:15px;font-weight:700;">Request details</p>
                    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">
                      <tr><td style="padding:9px 0;color:#64748b;width:34%;">Location</td><td style="padding:9px 0;font-weight:600;">${pendingRequest.google_maps_name || pendingRequest.current_location_name || "Approved location"}</td></tr>
                      <tr><td style="padding:9px 0;color:#64748b;">Reason</td><td style="padding:9px 0;">${requestReason}</td></tr>
                      <tr><td style="padding:9px 0;color:#64748b;">Reviewed by</td><td style="padding:9px 0;">${headOfDepartment}</td></tr>
                    </table>
                    <p style="margin:24px 0 0;color:#475569;font-size:14px;line-height:1.6;">You have been checked in on official duty. Keep this email for your records.</p>
                  </div>
                  <div style="border-top:1px solid #e2e8f0;padding:16px 34px;color:#64748b;font-size:12px;">QCC Attendance System · Automated notification</div>
                </div>
              </div>`,
            text: `Off-premises approval\n\nHello ${pendingRequest.user_profiles?.first_name || "there"},\nYour request was approved and you were checked in on official duty.\n\nLocation: ${pendingRequest.google_maps_name || pendingRequest.current_location_name || "Approved location"}\nReason: ${requestReason}\nReviewed by: ${headOfDepartment}`,
          }, {
            idempotencyKey: `offpremises-approved/${request_id}`,
            emailModule: "off_premises",
            emailEvent: "approval",
            useInlineTemplate: true,
            firstName: pendingRequest.user_profiles?.first_name || pendingRequest.user_profiles?.full_name || "Staff member",
            requestTitle: "Off-premises check-in approval",
            details: `OFF-PREMISES CHECK-IN APPROVAL

STAFF MEMBER
Name: ${pendingRequest.user_profiles?.first_name || "Staff member"} ${pendingRequest.user_profiles?.last_name || ""}

REQUEST
Request ID: ${request_id}
Location: ${pendingRequest.google_maps_name || pendingRequest.current_location_name || "Approved location"}

STAFF REASON
${requestReason || "No reason provided."}

APPROVAL
Reviewed by: ${headOfDepartment || "Authorized approver"}
Status: Approved and checked in on official duty.`,
          })
        }
      } catch (err) {
        console.warn("[v0] Failed to send approval notification:", err)
      }

      console.log("[v0] Request approved successfully:", request_id)
      
      return NextResponse.json(
        {
          success: true,
          message: "Off-premises check-in approved and staff member has been automatically checked in",
          attendance_record_id: attendanceRecord?.id,
        },
        { status: 200 }
      )
    } else {
      console.log("[v0] Rejecting off-premises check-in request:", request_id)

      // Update pending request status
      const { error: updateError } = await supabase
        .from("pending_offpremises_checkins")
        .update({
          status: "rejected",
          approved_by_id: user_id,
          approved_at: new Date().toISOString(),
          rejection_reason: comments,
        })
        .eq("id", request_id)

      if (updateError) {
        console.error("[v0] Failed to update request status:", updateError)
        return NextResponse.json(
          { error: "Failed to update request status" },
          { status: 500 }
        )
      }

      // Send notification to the staff member
      try {
        await supabase.from("staff_notifications").insert({
          user_id: pendingRequest.user_id,
          type: "offpremises_checkin_rejected",
          title: "Off-Premises Check-In Rejected",
          message: `Your off-premises check-in request from ${pendingRequest.google_maps_name || pendingRequest.current_location_name} has been rejected. ${comments ? `Reason: ${comments}` : ""}`,
          data: {
            request_id: request_id,
          },
          is_read: false,
        })

        const staffEmail = String(pendingRequest.user_profiles?.email || "").trim()
        if (staffEmail) {
          const reason = comments ? ` Reason: ${comments}` : ""
          await emailService.sendEmail(staffEmail, {
            subject: "Off-Premises Check-In Rejected",
            html: `<p>Your off-premises check-in request has been rejected.</p>${comments ? `<p>Reason: ${comments}</p>` : ""}`,
            text: `Your off-premises check-in request has been rejected.${reason}`,
          }, {
            idempotencyKey: `offpremises-rejected/${request_id}`,
            emailModule: "off_premises",
            emailEvent: "decision",
            firstName: pendingRequest.user_profiles?.first_name || pendingRequest.user_profiles?.full_name || "Staff member",
            requestTitle: "Off-premises check-in decision",
            details: `Request ID: ${request_id}\nHead of Department: ${headOfDepartment}\nLocation: ${pendingRequest.google_maps_name || pendingRequest.current_location_name || "Requested location"}\nReason given by staff: ${requestReason}\nStatus: Rejected.${comments ? `\nReviewer comments: ${comments}` : ""}`,
          })
        }
      } catch (err) {
        console.warn("[v0] Failed to send rejection notification:", err)
      }

      console.log("[v0] Request rejected successfully:", request_id)

      return NextResponse.json(
        {
          success: true,
          message: "Off-premises check-in request has been rejected",
        },
        { status: 200 }
      )
    }
  } catch (error: any) {
    console.error("[v0] Off-premises approval error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process approval" },
      { status: 500 }
    )
  }
}
