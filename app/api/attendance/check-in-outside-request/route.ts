import { createAdminClient } from "@/lib/supabase/server"
import { isExemptFromAttendanceReasons } from "@/lib/attendance-utils"
import { validateMeaningfulText } from "@/lib/meaningful-text"
import { parseRuntimeFlags } from "@/lib/runtime-flags"
import { type NextRequest, NextResponse } from "next/server"

console.log("[v0] check-in-outside-request route module loaded")

export async function POST(request: NextRequest) {
  console.log("[v0] POST handler invoked for check-in-outside-request")
  
  try {
    console.log("[v0] Off-premises check-in API called")
    
    const body = await request.json()
    console.log("[v0] Request body received:", { location: body.current_location?.name, userId: body.user_id })
    
    const {
      current_location,
      device_info,
      user_id,
      reason,
      request_type,
      action,
      mode,
      off_grid_hours_before_request,
      off_grid_started_at,
    } = body

    // Normalize request type: accept `request_type`, `action`, or `mode` (legacy)
    const normalizedRequestType = (request_type || action || mode || 'checkin').toString().toLowerCase()
    const finalRequestType = normalizedRequestType.startsWith('checkout') ? 'checkout' : 'checkin'
    const isAutoApprovedAudit = finalRequestType === 'checkout' && body?.auto_approved === true

    if (!current_location) {
      console.error("[v0] Missing current_location")
      return NextResponse.json(
        { error: "Current location is required" },
        { status: 400 }
      )
    }

    if (!user_id) {
      console.error("[v0] Missing user_id")
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    console.log("[v0] Creating admin client...")
    const supabase = await createAdminClient()
    console.log("[v0] Admin client created")

    // Get user's direct manager (department head or regional manager they report to)
    const { data: userProfile, error: userProfileError } = await supabase
      .from("user_profiles")
      .select("id, department_id, role, first_name, last_name, email")
      .eq("id", user_id)
      .maybeSingle()

    console.log("[v0] User profile query result:", { userProfile, userProfileError, user_id })

    if (userProfileError) {
      console.error("[v0] Error querying user_profiles:", userProfileError)
      return NextResponse.json({ error: userProfileError.message }, { status: 500 })
    }

    if (!userProfile) {
      console.error("[v0] User profile not found for user_id:", user_id)
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    const isPrivilegedExempt = isExemptFromAttendanceReasons(userProfile.role)

    if (finalRequestType === 'checkout') {
      const { data: sysSettings } = await supabase.from("system_settings").select("settings").maybeSingle()
      const runtimeFlags = parseRuntimeFlags(sysSettings?.settings)

      if (!runtimeFlags.offPremisesCheckoutEnabled) {
        return NextResponse.json(
          { error: 'Off-premises check-out requests are currently disabled by admin policy.' },
          { status: 403 }
        )
      }

      const today = new Date().toISOString().split('T')[0]
      const { data: openAttendance, error: openAttendanceErr } = await supabase
        .from('attendance_records')
        .select('id, check_in_time, check_out_time')
        .eq('user_id', user_id)
        .gte('check_in_time', `${today}T00:00:00`)
        .lte('check_in_time', `${today}T23:59:59`)
        .is('check_out_time', null)
        .order('check_in_time', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (openAttendanceErr) {
        console.error('[v0] Failed to verify open attendance before off-premises checkout request:', openAttendanceErr)
        return NextResponse.json(
          { error: 'Failed to verify active attendance session' },
          { status: 500 }
        )
      }

      if (!openAttendance) {
        return NextResponse.json(
          { error: 'No active check-in found for today. Please check in first.' },
          { status: 400 }
        )
      }

      const hoursWorked = (Date.now() - new Date(openAttendance.check_in_time).getTime()) / (1000 * 60 * 60)
      if (hoursWorked < 7) {
        return NextResponse.json(
          { error: `Off-premises check-out request is available only after 7 hours of work. You have worked ${hoursWorked.toFixed(2)} hours.` },
          { status: 400 }
        )
      }

      {
        const now = new Date()
        const nowMinutes = now.getHours() * 60 + now.getMinutes()
        const [startHour, startMinute] = (runtimeFlags.offPremisesCheckoutStartTime || '15:00').split(':').map(Number)
        const [endHour, endMinute] = (runtimeFlags.offPremisesCheckoutEndTime || '23:59').split(':').map(Number)
        const startMinutes = startHour * 60 + (startMinute || 0)
        const endMinutes = endHour * 60 + (endMinute || 0)

        if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
          return NextResponse.json(
            {
              error: `Off-premises check-out requests are allowed only between ${runtimeFlags.offPremisesCheckoutStartTime} and ${runtimeFlags.offPremisesCheckoutEndTime}.`,
            },
            { status: 400 }
          )
        }
      }

      const reasonValidation = validateMeaningfulText(reason, {
        fieldLabel: 'Off-premises check-out reason',
        minLength: 10,
      })
      if (!reasonValidation.ok) {
        return NextResponse.json(
          { error: reasonValidation.error || 'A meaningful reason is required for off-premises check-out requests.' },
          { status: 400 }
        )
      }
    }

    // Resolve approvers as follows:
    //  - All admins should always receive notifications
    //  - The department head for the user's department should receive the request
    //  - The regional manager for the location's district (if determinable) should receive the request
    console.log('[v0] Resolving approvers: admins, department head, regional manager (if available)')

    // 1) Admins
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, role')
      .eq('role', 'admin')
      .eq('is_active', true)

    // 2) Department head for the user's department
    let departmentHeads: any[] = []
    if (userProfile.department_id) {
      const { data: deptHeads } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, role')
        .eq('role', 'department_head')
        .eq('department_id', userProfile.department_id)
        .eq('is_active', true)
      departmentHeads = deptHeads || []
    }

    // 3) Regional manager for the location's district (attempt to infer district)
    let regionalManagers: any[] = []
    let districtId: any = current_location?.district_id || null
    if (!districtId && current_location?.latitude && current_location?.longitude) {
      // Try to find a nearby geofence location and use its district
      const lat = Number(current_location.latitude)
      const lng = Number(current_location.longitude)
      const latDelta = 0.02
      const lngDelta = 0.02
      const { data: nearby } = await supabase
        .from('geofence_locations')
        .select('id, district_id')
        .gte('latitude', lat - latDelta)
        .lte('latitude', lat + latDelta)
        .gte('longitude', lng - lngDelta)
        .lte('longitude', lng + lngDelta)
        .limit(1)
      if (nearby && nearby.length > 0) {
        districtId = nearby[0].district_id
      }
    }

    if (districtId) {
      const { data: regional } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, role')
        .eq('role', 'regional_manager')
        .eq('district_id', districtId)
        .eq('is_active', true)
      regionalManagers = regional || []
    }

    // Merge unique managers: admins + departmentHeads + regionalManagers
    const managersMap: Record<string, any> = {}
    const pushUnique = (arr: any[] | undefined) => {
      (arr || []).forEach((m) => {
        if (m && m.id && !managersMap[m.id]) managersMap[m.id] = m
      })
    }

    pushUnique(admins)
    pushUnique(departmentHeads)
    pushUnique(regionalManagers)

    const managers = Object.values(managersMap)

    console.log('[v0] Approvers resolved:', { admins: admins?.length || 0, departmentHeads: departmentHeads.length, regionalManagers: regionalManagers.length, total: managers.length })

    if (managers.length === 0) {
      console.error('[v0] No approvers resolved for off-premises request')
      return NextResponse.json({
        success: false,
        error: 'Cannot submit off-premises request: No approvers available. Please contact HR.',
        requiresManualApproval: true,
      }, { status: 400 })
    }

    // Store the off-premises check-in request for manager approval
    console.log("[v0] Inserting pending off-premises request:", {
      user_id,
      location_name: current_location.name,
      request_type: finalRequestType,
      status: "pending",
    })

    // Server-side guard: prevent duplicate pending requests from the same user for the same day
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data: existing, error: existingErr } = await supabase
        .from('pending_offpremises_checkins')
        .select('id, status, created_at')
        .eq('user_id', user_id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .limit(1)
        .maybeSingle()

      if (existingErr) {
        console.warn('[v0] Could not check for existing pending off-premises request:', existingErr)
      } else if (existing && String(existing.status).toLowerCase() === 'pending') {
        console.log('[v0] Duplicate pending off-premises request detected for user:', user_id)
        return NextResponse.json({
          success: false,
          error: 'You already have a pending off‑premises request for today. Please wait for your approver to review it.',
          duplicate: true,
        }, { status: 409 })
      }
    } catch (dupErr) {
      console.warn('[v0] Error while checking duplicate off-premises request:', dupErr)
      // continue — do not block creation on duplicate-check failure
    }

    const normalizedDeviceInfo =
      device_info && typeof device_info === 'object'
        ? device_info
        : { raw: device_info }
    const enrichedDeviceInfo = {
      ...normalizedDeviceInfo,
      off_grid_hours_before_request:
        typeof off_grid_hours_before_request === 'number' ? off_grid_hours_before_request : null,
      off_grid_started_at: off_grid_started_at || null,
      submitted_request_type: finalRequestType,
    }

    // Try inserting with `reason` and `request_type` columns if they exist; fall back if DB doesn't have those columns yet
    let requestRecord: any = null
    try {
      const insertRes = await supabase
        .from("pending_offpremises_checkins")
        .insert({
          user_id,
          current_location_name: current_location.name,
          latitude: current_location.latitude,
          longitude: current_location.longitude,
          accuracy: current_location.accuracy,
          device_info: enrichedDeviceInfo,
          request_type: finalRequestType,
          google_maps_name: current_location.display_name || current_location.name,
          reason: reason || null,
          status: isAutoApprovedAudit ? "approved" : "pending",
        })
        .select()
        .single()

      requestRecord = insertRes.data
      if (insertRes.error) throw insertRes.error
    } catch (err: any) {
      // If column `reason` OR `request_type` is missing (older schemas), or if
      // PostgREST schema cache hasn't picked up the new column (PGRST204), retry
      const msg = (err?.message || "").toString().toLowerCase()
      const missingReason = msg.includes("column pending_offpremises_checkins.reason does not exist") || err?.code === '42703' || err?.code === 'PGRST204' || msg.includes("schema cache") && msg.includes("reason")
      const missingRequestType = msg.includes("column pending_offpremises_checkins.request_type does not exist") || err?.code === '42703' || err?.code === 'PGRST204' || msg.includes("schema cache") && msg.includes("request_type")

      if (missingReason || missingRequestType) {
        console.warn('[v0] Database missing columns or schema stale; retrying insert without reason/request_type')
        const payload: any = {
          user_id,
          current_location_name: current_location.name,
          latitude: current_location.latitude,
          longitude: current_location.longitude,
          accuracy: current_location.accuracy,
          device_info: enrichedDeviceInfo,
          google_maps_name: current_location.display_name || current_location.name,
          status: isAutoApprovedAudit ? 'approved' : 'pending',
        }

        // only include reason/request_type if DB likely supports them
        if (!missingReason && reason) payload.reason = reason
        if (!missingRequestType) payload.request_type = finalRequestType

        const { data: retryRecord, error: retryError } = await supabase
          .from('pending_offpremises_checkins')
          .insert(payload)
          .select()
          .single()

        if (retryError) {
          console.error('[v0] Failed retrying insert without reason/request_type:', retryError)
          return NextResponse.json({ error: 'Failed to process request: ' + retryError.message }, { status: 500 })
        }
        requestRecord = retryRecord
      } else {
        console.error('[v0] Failed to store pending check-in:', err)
        return NextResponse.json({ error: 'Failed to process request: ' + (err?.message || String(err)) }, { status: 500 })
      }
    }

    console.log('[v0] Request stored successfully:', requestRecord.id)

    // Send notifications to managers
    const isCheckoutRequest = finalRequestType === 'checkout'
    const managerNotifications = isAutoApprovedAudit ? [] : managers.map((manager: any) => ({
      recipient_id: manager.id,
      type: isCheckoutRequest ? "offpremises_checkout_request" : "offpremises_checkin_request",
      title: isCheckoutRequest ? "Off-Premises Check-Out Request" : "Off-Premises Check-In Request",
      message: isCheckoutRequest
        ? `${userProfile.first_name} ${userProfile.last_name} is requesting to check out from outside registered QCC locations at ${current_location.display_name || current_location.name}. Reason: ${reason || 'Not provided'}. Please review this request.`
        : `${userProfile.first_name} ${userProfile.last_name} is requesting to check in from outside their assigned location: ${current_location.display_name || current_location.name}. Reason: ${reason || 'Not provided'}. Please review and approve or deny.`,
      data: {
        request_id: requestRecord.id,
        staff_user_id: user_id,
        request_type: finalRequestType,
        staff_name: `${userProfile.first_name} ${userProfile.last_name}`,
        location_name: current_location.name,
        google_maps_name: current_location.display_name || current_location.name,
        coordinates: `${current_location.latitude}, ${current_location.longitude}`,
        reason: reason || 'Not provided',
        off_grid_hours_before_request:
          typeof off_grid_hours_before_request === 'number' ? off_grid_hours_before_request : null,
      },
      is_read: false,
    }))

    const { error: notificationError } = managerNotifications.length === 0
      ? { error: null }
      : await supabase
          .from("staff_notifications")
          .insert(managerNotifications)

    if (notificationError) {
      console.warn("[v0] Failed to send notifications:", notificationError)
      // Don't fail the request if notifications fail
    }

    return NextResponse.json(
      {
        success: true,
        message:
          isAutoApprovedAudit
            ? "Direct off-premises check-out was logged successfully for audit and archiving"
            : finalRequestType === 'checkout'
            ? "Your off-premises check-out request has been sent to your department head, supervisor, and admin for approval"
            : "Your off-premises check-in request has been sent to your managers for approval",
        request_id: requestRecord.id,
        pending_approval: true,
        request_type: finalRequestType,
      },
      { status: 200 }
    )
  } catch (error: any) {
    // normalize error to string message so we never return an empty object
    const message =
      (error && (error.message || String(error))) ||
      "Failed to process off-premises request"

    console.error("[v0] Off-premises check-in request error:", {
      message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
    })
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
