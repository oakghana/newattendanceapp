import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { validateCheckoutLocation, type LocationData } from "@/lib/geolocation"
import { requiresEarlyCheckoutReason, canCheckOutAtTime, canAutoCheckoutOutOfRange, getCheckOutDeadline, isSecurityDept, isOperationalDept, isTransportDept, isExemptFromAttendanceReasons } from "@/lib/attendance-utils"
import { parseRuntimeFlags } from "@/lib/runtime-flags"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    let overrideMeta: { type: string } | null = null

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      latitude,
      longitude,
      location_id,
      qr_code_used,
      qr_timestamp,
      early_checkout_reason,
      early_checkout_proved_by,
      early_checkout_proved_by_id,
      override_request,
      override_reason,
      auto_checkout,
      auto_checkout_reason,
      login_issue_recovery,
    } = body

    if (!qr_code_used && (!latitude || !longitude)) {
      return NextResponse.json({ error: "Location coordinates are required for GPS check-out" }, { status: 400 })
    }

    const now = new Date()
    const today = new Date().toISOString().split("T")[0]

    // OPTIMIZATION: Parallelize database queries
    const [
      { data: userProfile },
      { data: attendanceRecord, error: findError },
    ] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("leave_status, leave_end_date, role, departments(code, name)")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("attendance_records")
        .select(`
          *,
          geofence_locations!check_in_location_id (
            name,
            address
          )
        `)
        .eq("user_id", user.id)
        .gte("check_in_time", `${today}T00:00:00`)
        .lt("check_in_time", `${today}T23:59:59`)
        .maybeSingle(),
    ])

    // Prefer per-day `leave_status` table for accurate leave checks for today
    const { data: onLeave } = await supabase
      .from("leave_status")
      .select("date, leave_request_id")
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("status", "on_leave")
      .maybeSingle()

    if (onLeave) {
      let startDate: string | null = null
      let endDate: string | null = null
      if (onLeave.leave_request_id) {
        const { data: lr } = await supabase
          .from("leave_requests")
          .select("start_date, end_date")
          .eq("id", onLeave.leave_request_id)
          .maybeSingle()
        if (lr) {
          startDate = lr.start_date
          endDate = lr.end_date
        }
      }

      const isSec = isSecurityDept(userProfile?.departments)
      const isOp = isOperationalDept(userProfile?.departments)
      const isTrans = isTransportDept(userProfile?.departments)
      if (override_request && override_reason && (isSec || isOp || isTrans)) {
        await supabase.from("emergency_check_in_overrides").insert({
          user_id: user.id,
          check_out_time: new Date().toISOString(),
          override_type: 'leave_override',
          reason: override_reason,
          is_security_staff: isSec,
          is_operational_staff: isOp,
          is_transport_staff: isTrans,
        }).catch(() => {})
        await supabase.from("staff_notifications").insert({
          user_id: user.id,
          title: "Emergency override used",
          message: "An override was used to bypass leave restriction during check-out.",
          type: "info",
          is_read: false,
        }).catch(() => {})
        // continue
      } else {
        return NextResponse.json(
          {
            error: `You are currently on approved leave${startDate && endDate ? ` from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}` : ""}. You cannot check out during this period.`,
          },
          { status: 403 },
        )
      }
    }

    // Fallback: respect legacy `user_profiles.leave_status` if present
    if (userProfile && userProfile.leave_status && userProfile.leave_status !== "active") {
      const leaveType = userProfile.leave_status === "on_leave" ? "on leave" : "on sick leave"
      const endDate = userProfile.leave_end_date
        ? new Date(userProfile.leave_end_date).toLocaleDateString()
        : "unspecified"

      return NextResponse.json(
        {
          error: `You are currently marked as ${leaveType} until ${endDate}. You cannot check out during your leave period.`,
        },
        { status: 403 },
      )
    }

    if (findError || !attendanceRecord) {
      return NextResponse.json({ error: "No check-in record found for today" }, { status: 400 })
    }

    if (attendanceRecord.check_out_time) {
      // Log this as a security violation - attempt to check out twice
      const deviceId = request.headers.get("x-device-id") || "unknown"
      const ipAddress = request.ip || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null

      await supabase
        .from("device_security_violations")
        .insert({
          device_id: deviceId,
          ip_address: ipAddress,
          attempted_user_id: user.id,
          bound_user_id: user.id,
          violation_type: "double_checkout_attempt",
          device_info: {
            userAgent: request.headers.get("user-agent"),
            timestamp: new Date().toISOString(),
          },
        })
        .catch((err) => {
          // Ignore if table doesn't exist yet
          if (err.code !== "PGRST205") {
            console.error("[v0] Failed to log checkout violation:", err)
          }
        })

      return NextResponse.json(
        {
          error: `DUPLICATE CHECK-OUT BLOCKED: You have already checked out today at ${new Date(attendanceRecord.check_out_time).toLocaleTimeString()}. Only one check-out per day is allowed. This attempt has been logged as a security violation.`,
        },
        { status: 400 },
      )
    }

    // Retry history-driven recovery rules based on today's logged checkout failures.
    // - Out-of-range users after 5:30 PM with >=4 failed attempts can proceed.
    // - In-range users with >=2 failed attempts are auto-checked out.
    const todayStartIso = `${today}T00:00:00`
    const todayEndIso = `${today}T23:59:59`
    const { data: failedCheckoutAttempts } = await supabase
      .from("audit_logs")
      .select("created_at, action, new_values")
      .eq("user_id", user.id)
      .in("action", ["check_out_failed", "offpremises_checkout_failed", "qr_check_out_failed", "auto_checkout_failed"])
      .gte("created_at", todayStartIso)
      .lte("created_at", todayEndIso)

    const retryStats = (failedCheckoutAttempts || []).reduce(
      (acc, row: any) => {
        const payload = (row?.new_values && typeof row.new_values === "object") ? row.new_values : {}
        const nearestDistance = Number(payload?.nearest_location_distance_m)
        const nearestName = typeof payload?.nearest_location_name === "string" ? payload.nearest_location_name : null
        const createdAt = new Date(row.created_at)
        const minutes = createdAt.getHours() * 60 + createdAt.getMinutes()
        const isAfter530 = minutes >= 17 * 60 + 30

        if (Number.isFinite(nearestDistance)) {
          if (nearestDistance <= 100) {
            acc.inRangeFailures += 1
          } else if (isAfter530) {
            acc.outOfRangeAfter530Failures += 1
            if (!acc.lastOutOfRangeLocationName && nearestName) {
              acc.lastOutOfRangeLocationName = nearestName
            }
          }
        }

        return acc
      },
      {
        inRangeFailures: 0,
        outOfRangeAfter530Failures: 0,
        lastOutOfRangeLocationName: null as string | null,
      },
    )

    const checkInTimeForPolicy = new Date(attendanceRecord.check_in_time)
    const provisionalWorkHours = (now.getTime() - checkInTimeForPolicy.getTime()) / (1000 * 60 * 60)
    const serverTimeMinutes = now.getHours() * 60 + now.getMinutes()
    const isAfter530PmServerTime = serverTimeMinutes >= 17 * 60 + 30
    const hasWorkedAtLeast7Hours = provisionalWorkHours >= 7
    const isPrivilegedRole = isExemptFromAttendanceReasons(userProfile?.role)

    // Staff policy: minimum 2 hours required for regular checkout.
    // Emergency checkout has its own separate endpoint and rules.
    if (!isPrivilegedRole && provisionalWorkHours < 2) {
      return NextResponse.json(
        {
          error: `You can check out after 2 hours of work. You have worked ${provisionalWorkHours.toFixed(2)} hours so far.`,
          minimumHoursRequired: 2,
          workedHours: Number(provisionalWorkHours.toFixed(2)),
        },
        { status: 400 },
      )
    }

    const allowCheckoutPolicyBypass = hasWorkedAtLeast7Hours

    // CHECK TIME RESTRICTION: Check if check-out is after 6 PM (18:00)
    const timeRestrictCheckData = { 
      departments: userProfile?.departments, 
      role: userProfile?.role 
    }
    const { data: sysSettings } = await supabase.from("system_settings").select("settings").maybeSingle()
    const runtimeFlags = parseRuntimeFlags(sysSettings?.settings)
    const canCheckOutBySchedule = canCheckOutAtTime(now, timeRestrictCheckData?.departments, timeRestrictCheckData?.role, {
      checkoutCutoffTime: runtimeFlags.checkoutCutoffTime,
    })
    const canCheckOut = canCheckOutBySchedule || allowCheckoutPolicyBypass
    
    // determine bypass if remote checkout (either originally off-premises OR currently out-of-range)
    const isOffPremisesCheckedIn = !!attendanceRecord.on_official_duty_outside_premises || !!attendanceRecord.is_remote_location
    // Declare checkoutLocationData early so it can be referenced when determining time-rule bypasses
    let checkoutLocationData: any = null
    const bypassTimeRules = isOffPremisesCheckedIn || allowCheckoutPolicyBypass || retryStats.outOfRangeAfter530Failures >= 4

    if (!canCheckOut && !bypassTimeRules) {
      // allow overrides for eligible staff
      const isSec = isSecurityDept(userProfile?.departments)
      const isOp = isOperationalDept(userProfile?.departments)
      const isTrans = isTransportDept(userProfile?.departments)
      if (override_request && override_reason && (isSec || isOp || isTrans)) {
        await supabase.from("emergency_check_in_overrides").insert({
          user_id: user.id,
          check_out_time: now.toISOString(),
          override_type: 'time_restriction',
          reason: override_reason,
          is_security_staff: isSec,
          is_operational_staff: isOp,
          is_transport_staff: isTrans,
        }).catch(() => {})
        await supabase.from("staff_notifications").insert({
          user_id: user.id,
          title: "Emergency override used",
          message: "An override was used to bypass time restriction during check-out.",
          type: "info",
          is_read: false,
        }).catch(() => {})
        overrideMeta = { type: 'time_restriction' }
        // continue through flow
      } else {
        // Create a notification for users trying to check out after 6 PM
        await supabase
          .from("staff_notifications")
          .insert({
            user_id: user.id,
            title: "Check-out Time Exceeded",
            message: `You attempted to check out after ${getCheckOutDeadline()}. Check-outs are only allowed until ${getCheckOutDeadline()} unless you are in an exempt department (Operational/Security).`,
            type: "warning",
            is_read: false,
          })
          .catch(() => {}) // Silently fail if notification table doesn't exist

        return NextResponse.json({
          error: `Check-out is only allowed before ${getCheckOutDeadline()}. Your department/role does not have exceptions for late check-outs.`,
          checkOutBlocked: true,
          currentTime: now.toLocaleTimeString(),
          deadline: getCheckOutDeadline(),
          notification: "Your attempt to check out after hours has been recorded."
        }, { status: 403 })
      }
    }

    // Enhanced device sharing detection for checkout
    const device_info = body.device_info
    let deviceSharingWarning = null
    
    if (device_info?.device_id) {
      const getValidIpAddress = () => {
        const forwardedFor = request.headers.get("x-forwarded-for")
        const forwardedCandidates = forwardedFor
          ? forwardedFor
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : []

        const possibleIps = [
          request.headers.get("x-vercel-forwarded-for"),
          request.headers.get("cf-connecting-ip"),
          request.headers.get("x-real-ip"),
          request.headers.get("x-client-ip"),
          request.ip,
          ...forwardedCandidates,
        ]

        for (const rawIp of possibleIps) {
          if (!rawIp || rawIp === "unknown") continue

          const normalizedIp = rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp
          if (normalizedIp === "::1" || normalizedIp === "127.0.0.1") continue

          if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalizedIp) || /^[0-9a-fA-F:]+$/.test(normalizedIp)) {
            return normalizedIp
          }
        }

        return null
      }

      const ipAddress = getValidIpAddress()
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      
      console.log("[v0] Checkout - Enhanced device sharing check:", {
        deviceId: device_info.device_id,
        ipAddress: ipAddress,
        userId: user.id
      })
      
      // OPTIMIZATION: Parallelize device sharing checks
      const [
        { data: recentDeviceSession },
        { data: ipSession }
      ] = await Promise.all([
        supabase
          .from("device_sessions")
          .select("user_id, last_activity, ip_address, device_id")
          .eq("device_id", device_info.device_id)
          .neq("user_id", user.id)
          .gte("last_activity", twoHoursAgo)
          .order("last_activity", { ascending: false })
          .limit(1)
          .maybeSingle(),
        ipAddress ? supabase
          .from("device_sessions")
          .select("user_id, last_activity, ip_address, device_id")
          .eq("ip_address", ipAddress)
          .neq("user_id", user.id)
          .neq("device_id", device_info.device_id)
          .gte("last_activity", twoHoursAgo)
          .order("last_activity", { ascending: false })
          .limit(1)
          .maybeSingle()
          : Promise.resolve({ data: null })
      ])
      
      let ipSharingSession = ipSession
      
      // Process device sharing warnings
      if (recentDeviceSession) {
        const { data: previousUserProfile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, employee_id")
          .eq("id", recentDeviceSession.user_id)
          .single()

        if (previousUserProfile) {
          const previousUserName = `${previousUserProfile.first_name} ${previousUserProfile.last_name}`
          const timeSinceLastUse = Math.round((Date.now() - new Date(recentDeviceSession.last_activity).getTime()) / (1000 * 60))
          
          deviceSharingWarning = {
            type: "device_sharing",
            message: `Device sharing detected during checkout: ${device_info.device_type} (${device_info.device_name}, Device ID ${device_info.device_id}) was used by ${previousUserName} (${previousUserProfile.employee_id}) ${timeSinceLastUse} min ago.`,
            deviceDetails: {
              device_id: device_info.device_id,
              device_type: device_info.device_type,
              device_name: device_info.device_name
            }
          }

          console.warn(`[v0] CHECKOUT - Device Sharing: ${device_info.device_type} (${device_info.device_name}, Device ID ${device_info.device_id}) used by ${previousUserName}`)

          await supabase
            .from("device_security_violations")
            .insert({
              device_id: device_info.device_id,
              ip_address: ipAddress,
              attempted_user_id: user.id,
              bound_user_id: recentDeviceSession.user_id,
              violation_type: "checkout_attempt",
              device_info: {
                ...device_info,
                detection_method: "device_fingerprint",
                previous_user_id: recentDeviceSession.user_id,
                previous_ip: recentDeviceSession.ip_address,
                time_since_last_use_minutes: timeSinceLastUse,
              },
            })
            .catch((err) => {
              console.warn("[v0] Failed to persist checkout device sharing violation:", err)
            })

          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "checkout_device_sharing_detected",
            table_name: "device_sessions",
            record_id: device_info.device_id,
            new_values: {
              current_user: user.id,
              previous_user: recentDeviceSession.user_id,
              previous_user_name: previousUserName,
              time_since_last_use_minutes: timeSinceLastUse,
              device_id: device_info.device_id,
              device_mac_address: device_info.device_id,
              device_type: device_info.device_type,
              device_name: device_info.device_name,
              current_ip: ipAddress,
              previous_ip: recentDeviceSession.ip_address,
              detection_method: "device_fingerprint",
              browser_info: device_info.browser_info
            },
            ip_address: ipAddress || null,
            user_agent: request.headers.get("user-agent"),
          })
        }
      } else if (ipSharingSession) {
        const { data: ipSharerProfile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, employee_id")
          .eq("id", ipSharingSession.user_id)
          .single()

        if (ipSharerProfile) {
          const sharerName = `${ipSharerProfile.first_name} ${ipSharerProfile.last_name}`
          const timeSinceLastUse = Math.round((Date.now() - new Date(ipSharingSession.last_activity).getTime()) / (1000 * 60))
          
          deviceSharingWarning = {
            type: "ip_sharing",
            message: `IP sharing detected during checkout: Network ${ipAddress} was used by ${sharerName} (${ipSharerProfile.employee_id}) ${timeSinceLastUse} min ago. Current device: ${device_info.device_type} (${device_info.device_name}, Device ID ${device_info.device_id}).`,
            deviceDetails: {
              device_id: device_info.device_id,
              device_type: device_info.device_type,
              device_name: device_info.device_name
            }
          }

          console.warn(`[v0] CHECKOUT - IP Sharing: Current ${device_info.device_type} (${device_info.device_name}, Device ID ${device_info.device_id}) | Previous Device ID: ${ipSharingSession.device_id}`)

          await supabase
            .from("device_security_violations")
            .insert({
              device_id: device_info.device_id,
              ip_address: ipAddress,
              attempted_user_id: user.id,
              bound_user_id: ipSharingSession.user_id,
              violation_type: "checkout_attempt",
              device_info: {
                ...device_info,
                detection_method: "ip_address",
                previous_user_id: ipSharingSession.user_id,
                previous_device_id: ipSharingSession.device_id,
                time_since_last_use_minutes: timeSinceLastUse,
              },
            })
            .catch((err) => {
              console.warn("[v0] Failed to persist checkout IP sharing violation:", err)
            })

          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "checkout_ip_sharing_detected",
            table_name: "device_sessions",
            record_id: ipAddress || "unknown",
            new_values: {
              current_user: user.id,
              previous_user: ipSharingSession.user_id,
              previous_user_name: sharerName,
              time_since_last_use_minutes: timeSinceLastUse,
              current_device_id: device_info.device_id,
              current_device_mac: device_info.device_id,
              current_device_type: device_info.device_type,
              current_device_name: device_info.device_name,
              previous_device_id: ipSharingSession.device_id,
              previous_device_mac: ipSharingSession.device_id,
              shared_ip: ipAddress,
              detection_method: "ip_address",
              browser_info: device_info.browser_info
            },
            ip_address: ipAddress || null,
            user_agent: request.headers.get("user-agent"),
          })
        }
      }
    }

    const checkInDate = new Date(attendanceRecord.check_in_time).toISOString().split("T")[0]
    const currentDate = now.toISOString().split("T")[0]

    if (checkInDate !== currentDate) {
      return NextResponse.json(
        {
          error:
            "Check-out must be done before 11:59 PM on the same day. The system has switched to check-in mode for the new day.",
          requiresNewCheckIn: true,
        },
        { status: 400 },
      )
    }

    const { data: qccLocations, error: locationsError } = await supabase
      .from("geofence_locations")
      .select("id, name, address, latitude, longitude, radius_meters, district_id")
      .eq("is_active", true)

    if (locationsError || !qccLocations || qccLocations.length === 0) {
      return NextResponse.json({ error: "No active QCC locations found" }, { status: 400 })
    }

    const checkInTime = new Date(attendanceRecord.check_in_time)
    const checkOutTime = new Date()
    const workHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)
    const allowLocationBypass = workHours >= 7 || retryStats.outOfRangeAfter530Failures >= 4
    let policyLocationBypassUsed = false
    let retryAutoCheckoutInRangeUsed = false
    let retryOutOfRangeRecoveryUsed = false

    // OPTIMIZATION: Parallelize settings fetches
    const [
      { data: settingsData },
      { data: deviceRadiusSettings },
    ] = await Promise.all([
      supabase.from("system_settings").select("geo_settings").maybeSingle(),
      supabase
        .from("device_radius_settings")
        .select("device_type, check_out_radius_meters")
        .eq("is_active", true),
    ])

    // Get device type from request headers (sent by client)
    const deviceType = request.headers.get("x-device-type") || "desktop"
    
    // Find the checkout radius for this device type, default to 1000m if not found
    let deviceCheckOutRadius = 1000
    if (deviceRadiusSettings && deviceRadiusSettings.length > 0) {
      const deviceRadiusSetting = deviceRadiusSettings.find((s: any) => s.device_type === deviceType)
      if (deviceRadiusSetting) {
        deviceCheckOutRadius = deviceRadiusSetting.check_out_radius_meters
      }
    }

    console.log("[v0] Checkout - Device radius settings:", {
      deviceType,
      checkOutRadius: deviceCheckOutRadius,
      foundSettings: deviceRadiusSettings?.length || 0,
    })

    // `checkoutLocationData` already declared above; assign as needed below
    // Determine whether this attendance record was created from an approved off-premises request
    const isAttendanceOffPremises = !!attendanceRecord.on_official_duty_outside_premises || !!attendanceRecord.is_remote_location

    if (isAttendanceOffPremises) {
      // If the user is currently within range, only 2 hours minimum is required.
      // Remote / out-of-range checkout for off-premises sessions still requires 7 hours.
      let withinRangeNow = false
      if (!qr_code_used && typeof latitude === "number" && typeof longitude === "number") {
        const tempLoc: LocationData = {
          latitude,
          longitude,
          accuracy: typeof accuracy === "number" ? accuracy : 50,
        }
        const tempValidation = validateCheckoutLocation(tempLoc, qccLocations, deviceCheckOutRadius)
        withinRangeNow = tempValidation.canCheckOut
      }

      const minHours = withinRangeNow ? 2 : 7
      if (workHours < minHours) {
        return NextResponse.json(
          {
            error: withinRangeNow
              ? `You need at least 2 hours of work before checking out. You have worked ${workHours.toFixed(2)} hours so far.`
              : `Approved off-premises sessions can check out remotely only after 7 hours of work. You have worked ${workHours.toFixed(2)} hours so far.`,
            minimumHoursRequired: minHours,
            workedHours: Number(workHours.toFixed(2)),
          },
          { status: 400 },
        )
      }
    }

    if (!qr_code_used && latitude && longitude) {
      const userLocation: LocationData = {
        latitude,
        longitude,
        accuracy: 10,
      }

      // Security and Transport departments bypass location range checks for checkout
      const isSecOrTrans = isSecurityDept(userProfile?.departments) || isTransportDept(userProfile?.departments) || isOperationalDept(userProfile?.departments)

      // If the staff was checked-in via approved off-premises or is Security/Transport, skip strict geofence validation
      if (!isAttendanceOffPremises && !isSecOrTrans) {
        const validation = validateCheckoutLocation(userLocation, qccLocations, deviceCheckOutRadius)
        const withinStandardRange = typeof validation.distance === "number" && validation.distance <= 100
        const allowAutomaticOutOfRangeCheckout = Boolean(
          auto_checkout &&
            canAutoCheckoutOutOfRange({
              now,
              hasCheckedIn: true,
              hasCheckedOut: false,
              isOutOfRange: !validation.canCheckOut,
              hasMetMinimumTime: workHours >= 7,
              hoursWorked: workHours,
            }),
        )

        const allowOutOfRangeByRetries = !validation.canCheckOut && retryStats.outOfRangeAfter530Failures >= 4
        const autoCheckoutInRangeByRetries = validation.canCheckOut && retryStats.inRangeFailures >= 2

        if (autoCheckoutInRangeByRetries) {
          retryAutoCheckoutInRangeUsed = true
          checkoutLocationData = validation.nearestLocation
        }

        if (!validation.canCheckOut && (allowLocationBypass || allowOutOfRangeByRetries)) {
          console.log("[v0] Checkout policy bypass: allowing out-of-range checkout", {
            reason: allowOutOfRangeByRetries ? "after_5_30pm_failed_attempts>=4" : "worked_7_hours",
            distance: validation.distance,
            nearestLocation: validation.nearestLocation?.name,
            workHours,
          })
          checkoutLocationData = null
          policyLocationBypassUsed = true
          retryOutOfRangeRecoveryUsed = allowOutOfRangeByRetries
        } else if (!validation.canCheckOut && withinStandardRange) {
          console.log("[v0] Checkout override: within <=100m treated as in-range", {
            distance: validation.distance,
            nearestLocation: validation.nearestLocation?.name,
          })
          checkoutLocationData = validation.nearestLocation
        } else

        if (!validation.canCheckOut && !withinStandardRange && workHours < 7) {
          return NextResponse.json(
            {
              error: "Out-of-location check-out is available only after working at least 7 hours.",
            },
            { status: 400 },
          )
        }

        if (!validation.canCheckOut && !withinStandardRange && allowAutomaticOutOfRangeCheckout) {
          console.log("[v0] Automatic out-of-range checkout allowed after 4 PM")
          checkoutLocationData = null
        } else if (!validation.canCheckOut && !withinStandardRange) {
          console.log("[v0] Out-of-range checkout allowed after mandatory 7 hours")
          checkoutLocationData = null
        } else if (!checkoutLocationData) {
          checkoutLocationData = validation.nearestLocation
        }
      } else {
        // off-premises checked-in — treat this as remote checkout (no geofence enforcement)
        checkoutLocationData = null
      }
    } else if (location_id) {
      const { data: locationData, error: locationError } = await supabase
        .from("geofence_locations")
        .select("id, name, address, district_id, districts(name)")
        .eq("id", location_id)
        .single()

      if (!locationError && locationData) {
        checkoutLocationData = locationData
      }
    }

    // (already determined earlier for time-restriction logic)
    // If staff was checked in via an APPROVED off‑premises request, allow remote checkout

    if (!checkoutLocationData && !isOffPremisesCheckedIn) {
      // user is out of range and not already flagged remote; allow remote checkout
      // immediately rather than blocking
      console.log("[v0] Out-of-range checkout allowed (remote)")
    }

    // determine remote checkout status: anything outside a known location is treated
    // as a remote/off-premises checkout.  Approved off-premises check-ins are also
    // included, though the first condition already covers them.
    const willBeRemoteCheckout = !checkoutLocationData || isOffPremisesCheckedIn

    // Get user's assigned location with working hours configuration
    const { data: userProfileData } = await supabase
      .from("user_profiles")
      .select(`
        role,
        departments(code, name),
        assigned_location_id,
        assigned_location:geofence_locations!user_profiles_assigned_location_id_fkey (
          id,
          name,
          check_out_end_time,
          require_early_checkout_reason
        )
      `)
      .eq("id", user.id)
      .maybeSingle()

    // Get location-specific checkout end time (default to 17:00 if not set)
    const checkOutEndTime = userProfileData?.assigned_location?.check_out_end_time || "17:00"
    const requireEarlyCheckoutReason = userProfileData?.assigned_location?.require_early_checkout_reason ?? true
    const effectiveRequireEarlyCheckoutReason = requiresEarlyCheckoutReason(
      checkOutTime,
      requireEarlyCheckoutReason,
      userProfileData?.role,
      userProfileData?.departments,
    )
    const isPrivilegedReasonExempt = isExemptFromAttendanceReasons(userProfileData?.role)
    const requiresOutOfLocationReason =
      willBeRemoteCheckout && !isPrivilegedReasonExempt && !auto_checkout && !allowLocationBypass
    
    // Parse checkout end time (HH:MM format)
    const [endHour, endMinute] = checkOutEndTime.split(":").map(Number)
    const checkoutEndTimeMinutes = endHour * 60 + (endMinute || 0)
    const currentTimeMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes()
    
    const isEarlyCheckout = currentTimeMinutes < checkoutEndTimeMinutes
    
    // determine weekend status for logging and warnings
    const isWeekend = checkOutTime.getDay() === 0 || checkOutTime.getDay() === 6
    
    let earlyCheckoutWarning = null

    console.log("[v0] API Checkout validation:", {
      userId: user.id,
      assignedLocation: userProfileData?.assigned_location?.name || "Unknown",
      checkOutEndTime,
      currentTime: `${checkOutTime.getHours()}:${checkOutTime.getMinutes().toString().padStart(2, '0')}`,
      isEarlyCheckout,
      requireEarlyCheckoutReason,
      isWeekend,
    })

    // Only mark earlyCheckoutWarning when the location requires a reason AND it's NOT a weekend
    // However, if the user has already worked 9 or more hours, allow checkout without requiring a reason.
    const checkInTimeForHours = new Date(attendanceRecord.check_in_time)
    const hoursWorked = (checkOutTime.getTime() - checkInTimeForHours.getTime()) / (1000 * 60 * 60)

    if (isEarlyCheckout && effectiveRequireEarlyCheckoutReason && !isWeekend && hoursWorked < 9 && !isAfter530PmServerTime && !hasWorkedAtLeast7Hours) {
      earlyCheckoutWarning = {
        message: `Early checkout detected at ${checkOutTime.toLocaleTimeString()}. Standard work hours end at ${checkOutEndTime}.`,
        checkoutTime: checkOutTime.toISOString(),
        standardEndTime: checkOutEndTime,
      }
      // Require early checkout reason
      if (!early_checkout_reason || early_checkout_reason.trim().length === 0) {
        return NextResponse.json({
          error: "Early checkout reason is required when checking out before standard end time",
          requiresEarlyCheckoutReason: true,
          checkoutTime: checkOutTime.toLocaleTimeString(),
          standardEndTime: checkOutEndTime,
        }, { status: 400 })
      }
    }

    if (requiresOutOfLocationReason) {
      if (!early_checkout_reason || String(early_checkout_reason).trim().length === 0) {
        return NextResponse.json(
          {
            error: "A reason is required when checking out outside registered QCC locations.",
            requiresOutOfLocationReason: true,
          },
          { status: 400 },
        )
      }
    }

    const checkoutData: Record<string, any> = {
      check_out_time: checkOutTime.toISOString(),
      check_out_location_id: checkoutLocationData?.id || null,
      work_hours: Math.round(workHours * 100) / 100,
      updated_at: new Date().toISOString(),
      check_out_method: auto_checkout
        ? "auto_out_of_range_after_4pm"
        : willBeRemoteCheckout
          ? "remote_offpremises"
          : (qr_code_used ? "qr_code" : "gps"),
      check_out_location_name: checkoutLocationData?.name || (auto_checkout
        ? "Auto Check-out (Out of Range after 4 PM)"
        : (willBeRemoteCheckout ? "Off‑Premises (reason provided)" : "Unknown Location")),
      // mark remote checkout if user was approved off‑premises and not within a QCC location
      is_remote_checkout: willBeRemoteCheckout || false,
    }

    if (login_issue_recovery) {
      const recoveryNote = "Checkout completed after resolving login issue."
      checkoutData.notes = checkoutData.notes
        ? `${checkoutData.notes}\n${recoveryNote}`
        : recoveryNote
    }

    if (auto_checkout_reason && String(auto_checkout_reason).trim().length > 0) {
      checkoutData.notes = String(auto_checkout_reason).trim()
    }

    if (policyLocationBypassUsed) {
      const policyNote = hasWorkedAtLeast7Hours
        ? "Checkout location bypass applied: staff has worked at least 7 hours."
        : "Checkout location bypass applied: checkout requested after 5:30 PM server time."
      checkoutData.notes = checkoutData.notes ? `${checkoutData.notes}\n${policyNote}` : policyNote
    }

    if (retryOutOfRangeRecoveryUsed) {
      const retryLocation = retryStats.lastOutOfRangeLocationName || "Out-of-range location"
      checkoutData.check_out_location_name = retryLocation
      checkoutData.notes = checkoutData.notes
        ? `${checkoutData.notes}\nRetry recovery applied: checkout allowed after 4+ failed attempts after 5:30 PM while out of range.`
        : "Retry recovery applied: checkout allowed after 4+ failed attempts after 5:30 PM while out of range."
    }

    if (retryAutoCheckoutInRangeUsed) {
      checkoutData.check_out_method = "auto_after_retries_in_range"
      checkoutData.notes = checkoutData.notes
        ? `${checkoutData.notes}\nAuto checkout applied after 2+ failed in-range attempts.`
        : "Auto checkout applied after 2+ failed in-range attempts."
    }

    if (latitude && longitude) {
      checkoutData.check_out_latitude = latitude
      checkoutData.check_out_longitude = longitude
    }

    if (qr_code_used && qr_timestamp) {
      checkoutData.qr_check_out_timestamp = qr_timestamp
    }

    if (early_checkout_reason) {
      checkoutData.early_checkout_reason = early_checkout_reason
      if (early_checkout_proved_by) checkoutData.early_checkout_proved_by = String(early_checkout_proved_by).trim()
      if (early_checkout_proved_by_id) checkoutData.early_checkout_proved_by_id = early_checkout_proved_by_id
    }

    console.log(`[v0] Checkout - updating attendance id=${attendanceRecord.id}`, { checkoutData })

    const updateRes = await supabase
      .from("attendance_records")
      .update(checkoutData)
      .eq("id", attendanceRecord.id)
      .select(`
        *,
        geofence_locations!check_in_location_id (
          name,
          address
        ),
        checkout_location:geofence_locations!check_out_location_id (
          name,
          address
        )
      `)
      .single()

    let updatedRecord = updateRes.data
    let updateError = updateRes.error

    if (updateError) {
      console.error("[v0] Update error:", updateError)

      // Attempt an admin-client fallback in case RLS/permission issues prevented
      // the authenticated server client from performing the update. This helps
      // recover when cookies/tokens are missing or RLS rules are overly strict.
      try {
        console.log("[v0] Attempting admin-client fallback for checkout update")
        const adminSupabase = await createAdminClient()
        const adminRes = await adminSupabase
          .from("attendance_records")
          .update(checkoutData)
          .eq("id", attendanceRecord.id)
          .select(`
            *,
            geofence_locations!check_in_location_id (
              name,
              address
            ),
            checkout_location:geofence_locations!check_out_location_id (
              name,
              address
            )
          `)
          .single()

        if (adminRes.error) {
          console.error("[v0] Admin fallback update failed:", adminRes.error)
        } else {
          console.log("[v0] Admin fallback update succeeded for checkout")
          updatedRecord = adminRes.data
          updateError = null
        }
      } catch (adminErr) {
        console.error("[v0] Admin fallback exception:", adminErr)
      }
    }

    if (updateError) {
      const devDetails = process.env.NODE_ENV === "production" ? undefined : {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details || updateError.hint || null,
      }

      return NextResponse.json({ error: "Failed to record check-out", dbError: devDetails }, { status: 500 })
    }

    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: login_issue_recovery ? "check_out_after_login_recovery" : "check_out",
        table_name: "attendance_records",
        record_id: attendanceRecord.id,
        old_values: attendanceRecord,
        new_values: {
          ...updatedRecord,
          login_issue_recovery: Boolean(login_issue_recovery),
        },
        ip_address: request.ip || null,
        user_agent: request.headers.get("user-agent"),
      })
    } catch (auditError) {
      console.error("[v0] Audit log error (non-critical):", auditError)
    }

    return NextResponse.json({
      success: true,
      earlyCheckoutWarning,
      deviceSharingWarning,
      data: updatedRecord,
      message: `Successfully checked out at ${updatedRecord?.check_out_location_name || checkoutLocationData?.name || "recorded location"}. Work hours: ${workHours.toFixed(2)}`,
      overrideUsed: overrideMeta !== null,
      overrideType: overrideMeta?.type || null,
    })
  } catch (error) {
    console.error("[v0] Check-out error:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 },
    )
  }
}
