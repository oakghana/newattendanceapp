import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

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
      .select("role, department_id")
      .eq("id", user_id)
      .single()

    if (approverError || !approverProfile) {
      console.error("[v0] Failed to get approver profile:", approverError)
      return NextResponse.json(
        { error: "Approver profile not found" },
        { status: 404 }
      )
    }

    if (!["department_head", "regional_manager", "admin"].includes(approverProfile.role)) {
      console.error("[v0] User not authorized to approve:", approverProfile.role)
      return NextResponse.json(
        { error: "Only managers can approve off-premises check-ins" },
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

    // new policy: off-premises check-out requests are deprecated and cannot be approved
    if ((pendingRequest.request_type || 'checkin') === 'checkout') {
      console.warn('[v0] Attempted to process deprecated checkout request', pendingRequest.id)
      return NextResponse.json({ error: 'Off-premises check-out requests are no longer supported' }, { status: 400 })
    }

    // Permission validation based on role
    if (approverProfile.role === "admin") {
      // Admins can approve all requests
      console.log("[v0] Admin approving request")
    } else if (approverProfile.role === "department_head") {
      // Department heads can only approve requests from staff in their department
      if (pendingRequest.user_profiles?.department_id !== approverProfile.department_id) {
        console.error("[v0] Department head trying to approve outside their department")
        return NextResponse.json(
          { error: "You can only approve requests from staff in your department" },
          { status: 403 }
        )
      }
    }
    // Regional managers can approve all in current setup since we don't have location filtering

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

      const baseAttendancePayload: any = {
        actual_location_name: pendingRequest.google_maps_name || pendingRequest.current_location_name,
        actual_latitude: pendingRequest.latitude,
        actual_longitude: pendingRequest.longitude,
        on_official_duty_outside_premises: true,
        device_info: pendingRequest.device_info,
        check_in_type: "offpremises_confirmed",
        check_in_method: "approved_offpremises",
        is_remote_location: true,
        status: "present",
        check_in_location_id: assignedLocationId,
        check_in_location_name: assignedLocationName || "Assigned Location",
        updated_at: new Date().toISOString(),
        notes: `Off-premises check-in approved by manager. ${comments ? "Comments: " + comments : ""}`,
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
            check_in_location_id: existingAttendance.check_in_location_id || assignedLocationId,
            check_in_location_name: existingAttendance.check_in_location_name || assignedLocationName || "Assigned Location",
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
