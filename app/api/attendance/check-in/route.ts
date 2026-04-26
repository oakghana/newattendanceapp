import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { requiresLatenessReason, canCheckInAtTime, getCheckInDeadline, isSecurityDept, isOperationalDept, isTransportDept } from "@/lib/attendance-utils"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    let overrideMeta: { type: string } | null = null

    const getClientIp = () => {
      return (request as any).ip || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null
    }

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // parse request body once
    const body = await request.json()

    // Check if user already checked in today IMMEDIATELY at the start
    const today = new Date().toISOString().split("T")[0]
    const { data: existingRecord, error: checkError } = await supabase
      .from("attendance_records")
      .select("id, check_in_time, check_out_time")
      .eq("user_id", user.id)
      .gte("check_in_time", `${today}T00:00:00`)
      .lt("check_in_time", `${today}T23:59:59`)
      .maybeSingle()

    if (checkError) {
      console.error("[v0] Error checking existing attendance:", checkError)
    }

    let deviceSharingWarning = null

    if (existingRecord && existingRecord.check_in_time) {
      console.log("[v0] DUPLICATE CHECK-IN BLOCKED - User already checked in today")

      // Log security violation
      if (body.device_info?.device_id) {
        const ipAddress = request.ip || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null

        try {
          await supabase.from("device_security_violations").insert({
            device_id: body.device_info.device_id,
            ip_address: ipAddress,
            attempted_user_id: user.id,
            bound_user_id: user.id,
            violation_type: "double_checkin_attempt",
            device_info: body.device_info,
          })
        } catch (err: any) {
          console.log("[v0] Could not log security violation (table may not exist):", err?.message || err)
        }
      }

      const checkInTime = new Date(existingRecord.check_in_time).toLocaleTimeString()

      if (existingRecord.check_out_time) {
        const checkOutTime = new Date(existingRecord.check_out_time).toLocaleTimeString()
        const workHours = existingRecord.work_hours || 0
        
        return NextResponse.json(
          {
            alreadyCompleted: true,
            error: `You have already completed your work for today! You checked in at ${checkInTime} and checked out at ${checkOutTime} (${workHours} hours worked). Great job! See you tomorrow.`,
            details: {
              checkInTime: checkInTime,
              checkOutTime: checkOutTime,
              workHours: workHours,
              message: "Your attendance for today is complete. No further action needed."
            }
          },
          { status: 400 },
        )
      } else {
        return NextResponse.json(
          {
            error: `DUPLICATE CHECK-IN BLOCKED: You have already checked in today at ${checkInTime}. You are currently on duty. Please check out when you finish your work. This attempt has been logged.`,
          },
          { status: 400 },
        )
      }
    }

    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select(`
        first_name,
        last_name,
        role,
        assigned_location_id,
        departments(code, name)
      `)
      .eq("id", user.id)
      .maybeSingle()

    // Check if user is on leave (per-day leave_status table)
    const { data: leaveStatus } = await supabase
      .from("leave_status")
      .select("date, leave_request_id")
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("status", "on_leave")
      .maybeSingle()

    if (leaveStatus) {
      let startDate: string | null = null
      let endDate: string | null = null
      if (leaveStatus.leave_request_id) {
        const { data: lr } = await supabase
          .from("leave_requests")
          .select("start_date, end_date")
          .eq("id", leaveStatus.leave_request_id)
          .maybeSingle()
        if (lr) {
          startDate = lr.start_date
          endDate = lr.end_date
        }
      }

      // check for override request from exempt staff
      if (override_request && override_reason) {
        const isSec = isSecurityDept(userProfile?.departments)
        const isOp = isOperationalDept(userProfile?.departments)
        const isTrans = isTransportDept(userProfile?.departments)
        if (isSec || isOp || isTrans) {
          // log override and continue with check-in
          await supabase.from("emergency_check_in_overrides").insert({
            user_id: user.id,
            check_in_time: new Date().toISOString(),
            override_type: 'leave_override',
            reason: override_reason,
            is_security_staff: isSec,
            is_operational_staff: isOp,
            is_transport_staff: isTrans,
          }).catch(() => {})
          overrideMeta = { type: 'leave_override' }
          // send notification to manager
          await supabase.from("staff_notifications").insert({
            user_id: user.id,
            title: "Emergency override used",
            message: "An override was used for leave restriction during check-in.",
            type: "info",
            is_read: false,
          }).catch(() => {})
          // allow to proceed (do nothing here)
        } else {
          return NextResponse.json(
            {
              error: `You are currently on approved leave${startDate && endDate ? ` from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}` : ""}. You cannot check in during this period. Please contact your manager if you believe this is incorrect.`,
              onLeave: true,
            },
            { status: 403 }
          )
        }
      } else {
        return NextResponse.json(
          {
            error: `You are currently on approved leave${startDate && endDate ? ` from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}` : ""}. You cannot check in during this period. Please contact your manager if you believe this is incorrect.`,
            onLeave: true,
          },
          { status: 403 }
        )
      }
    }

    const { latitude, longitude, location_id, device_info, qr_code_used, qr_timestamp, lateness_reason, lateness_proved_by, lateness_proved_by_id, accuracy, location_timestamp, location_source, override_request, override_reason } = body

    // Fetch geo settings from system settings for server-side enforcement
    const { data: sysSettings } = await supabase.from("system_settings").select("geo_settings").maybeSingle()
    const geoSettings = (sysSettings && (sysSettings as any).geo_settings) || {}
    const maxLocationAge = Number(geoSettings?.maxLocationAge ?? geoSettings?.max_location_age ?? 300000) // ms
    const requireHighAccuracy = geoSettings?.requireHighAccuracy ?? geoSettings?.require_high_accuracy ?? true
    const allowedAccuracy = requireHighAccuracy ? 100 : 500 // meters

    // Validate location timestamp to reduce spoofing/stale readings; accuracy is ignored per new policy
    if (!qr_code_used && latitude && longitude) {
      if (!location_timestamp) {
        console.warn("[v0] Missing location timestamp - rejecting GPS check-in")
        try {
          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "gps_missing_timestamp",
            table_name: "attendance_records",
            record_id: null,
            new_values: { latitude, longitude, accuracy: accuracy ?? null, location_source: location_source ?? null },
            ip_address: request.ip || null,
            user_agent: request.headers.get("user-agent"),
          })
        } catch {
          // ignore logging failure
        }

        return NextResponse.json({ error: "Stale or missing GPS timestamp. Please retry using a fresh location reading or use the QR code option." }, { status: 400 })
      }

      const ts = Number(location_timestamp)
      const age = Date.now() - ts
      if (age > maxLocationAge) {
        console.warn("[v0] Stale location reading detected (age ms):", age)
        try {
          await supabase.from("device_security_violations").insert({
            device_id: device_info?.device_id || null,
            ip_address: request.ip || null,
            attempted_user_id: user.id,
            bound_user_id: user.id,
            violation_type: "stale_location",
            device_info: device_info || null,
            details: { latitude, longitude, age_ms: age, max_allowed_ms: maxLocationAge },
          })
        } catch {
          // ignore failure
        }

        return NextResponse.json({ error: "Stale GPS reading. Please try again and ensure your device provides a fresh GPS fix (enable high accuracy)." }, { status: 400 })
      }

      // accuracy check omitted intentionally
    }

    if (device_info?.device_id) {
      const getValidIpAddress = () => {
        const possibleIps = [
          request.ip,
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          request.headers.get("x-real-ip"),
        ]
        for (const ip of possibleIps) {
          if (ip && ip !== "unknown" && ip !== "::1" && ip !== "127.0.0.1") {
            return ip
          }
        }
        return null
      }

      const ipAddress = getValidIpAddress()

      // Check if this device was recently used by another staff member
      // Enhanced detection using both device fingerprint (MAC-like) and IP address
      if (device_info?.device_id) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        
        console.log("[v0] Checking device sharing with enhanced detection:", {
          deviceId: device_info.device_id,
          ipAddress: ipAddress,
          userId: user.id
        })
        
        // First check: Same device fingerprint (MAC-like ID)
        const { data: recentDeviceSession } = await supabase
          .from("device_sessions")
          .select("user_id, last_activity, ip_address, device_id")
          .eq("device_id", device_info.device_id)
          .neq("user_id", user.id)
          .gte("last_activity", twoHoursAgo)
          .order("last_activity", { ascending: false })
          .limit(1)
          .maybeSingle()

        // Second check: Same IP address with different device ID (IP sharing detection)
        let ipSharingSession = null
        if (ipAddress) {
          const { data: ipSession } = await supabase
            .from("device_sessions")
            .select("user_id, last_activity, ip_address, device_id")
            .eq("ip_address", ipAddress)
            .neq("user_id", user.id)
            .neq("device_id", device_info.device_id)
            .gte("last_activity", twoHoursAgo)
            .order("last_activity", { ascending: false })
            .limit(1)
            .maybeSingle()
          
          ipSharingSession = ipSession
        }

        // Persist detection and return warning metadata for client visibility.
        if (recentDeviceSession) {
          const { data: previousUserProfile } = await supabase
            .from("user_profiles")
            .select("first_name, last_name, employee_id")
            .eq("id", recentDeviceSession.user_id)
            .maybeSingle()

          const previousUserName = previousUserProfile
            ? `${previousUserProfile.first_name} ${previousUserProfile.last_name}`
            : "another staff member"
          const previousEmployeeId = previousUserProfile?.employee_id || "unknown"
          const timeSinceLastUse = Math.round((Date.now() - new Date(recentDeviceSession.last_activity).getTime()) / (1000 * 60))

          deviceSharingWarning = {
            type: "device_sharing",
            message: `Device sharing detected during check-in: ${device_info.device_type} (${device_info.device_name}, Device ID ${device_info.device_id}) was used by ${previousUserName} (${previousEmployeeId}) ${timeSinceLastUse} min ago.`,
            deviceDetails: {
              device_id: device_info.device_id,
              device_type: device_info.device_type,
              device_name: device_info.device_name,
            },
          }

          await supabase
            .from("device_security_violations")
            .insert({
              device_id: device_info.device_id,
              ip_address: ipAddress,
              attempted_user_id: user.id,
              bound_user_id: recentDeviceSession.user_id,
              violation_type: "checkin_attempt",
              device_info: {
                ...device_info,
                detection_method: "device_fingerprint",
                previous_user_id: recentDeviceSession.user_id,
                previous_ip: recentDeviceSession.ip_address,
                time_since_last_use_minutes: timeSinceLastUse,
              },
            })
            .catch((err) => {
              console.warn("[v0] Could not persist check-in device sharing violation:", err)
            })
        } else if (ipSharingSession) {
          const { data: ipSharerProfile } = await supabase
            .from("user_profiles")
            .select("first_name, last_name, employee_id")
            .eq("id", ipSharingSession.user_id)
            .maybeSingle()

          const sharerName = ipSharerProfile
            ? `${ipSharerProfile.first_name} ${ipSharerProfile.last_name}`
            : "another staff member"
          const sharerEmployeeId = ipSharerProfile?.employee_id || "unknown"
          const timeSinceLastUse = Math.round((Date.now() - new Date(ipSharingSession.last_activity).getTime()) / (1000 * 60))

          deviceSharingWarning = {
            type: "ip_sharing",
            message: `IP sharing detected during check-in: Network ${ipAddress} was used by ${sharerName} (${sharerEmployeeId}) ${timeSinceLastUse} min ago. Current device: ${device_info.device_type} (${device_info.device_name}, Device ID ${device_info.device_id}).`,
            deviceDetails: {
              device_id: device_info.device_id,
              device_type: device_info.device_type,
              device_name: device_info.device_name,
            },
          }

          await supabase
            .from("device_security_violations")
            .insert({
              device_id: device_info.device_id,
              ip_address: ipAddress,
              attempted_user_id: user.id,
              bound_user_id: ipSharingSession.user_id,
              violation_type: "checkin_attempt",
              device_info: {
                ...device_info,
                detection_method: "ip_address",
                previous_user_id: ipSharingSession.user_id,
                previous_device_id: ipSharingSession.device_id,
                time_since_last_use_minutes: timeSinceLastUse,
              },
            })
            .catch((err) => {
              console.warn("[v0] Could not persist check-in IP sharing violation:", err)
            })
        }
      }
    } // close device_info?.device_id outer block

    // --- Server-side proximity validation to prevent client-side spoofing ---
    if (!qr_code_used && latitude && longitude) {
      // Fetch active QCC locations and device radius settings
      const [{ data: qccLocations }, { data: deviceRadiusSettings }] = await Promise.all([
        supabase.from("geofence_locations").select("id, name, latitude, longitude, radius_meters, is_active").eq("is_active", true),
        supabase.from("device_radius_settings").select("device_type, check_in_radius_meters").eq("is_active", true),
      ])

      if (!qccLocations || qccLocations.length === 0) {
        return NextResponse.json({ error: "No active QCC locations found" }, { status: 400 })
      }

      // Determine device type and radius
      const deviceType = device_info?.device_type || "desktop"
      let deviceCheckInRadius = 400 // safe default
      if (deviceRadiusSettings && deviceRadiusSettings.length > 0) {
        const s = deviceRadiusSettings.find((r: any) => r.device_type === deviceType)
        if (s) deviceCheckInRadius = s.check_in_radius_meters
      }

      // Haversine distance calculation (meters)
      const toRad = (deg: number) => (deg * Math.PI) / 180
      const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3
        const φ1 = toRad(lat1)
        const φ2 = toRad(lat2)
        const Δφ = toRad(lat2 - lat1)
        const Δλ = toRad(lon2 - lon1)
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return Math.round(R * c)
      }

      // Find nearest location and distance
      const distances = qccLocations.map((loc: any) => ({ loc, distance: distanceMeters(latitude, longitude, loc.latitude, loc.longitude) }))
      distances.sort((a: any, b: any) => a.distance - b.distance)
      const nearest = distances[0]

      // If user provided a location_id ensure it matches the computed nearest and is within radius
      if (location_id) {
        const providedLoc = qccLocations.find((l: any) => l.id === location_id)
        if (providedLoc) {
          const providedDistance = distanceMeters(latitude, longitude, providedLoc.latitude, providedLoc.longitude)
          // Cap any client-reported accuracy buffer on server - inaccurate data should not expand radius
          const MAX_ACCURACY_BUFFER = 500

          if (providedDistance > deviceCheckInRadius + MAX_ACCURACY_BUFFER) {
            // Log suspicious attempt
            try {
              await supabase.from("device_security_violations").insert({
                device_id: device_info?.device_id || null,
                ip_address: getClientIp() || null,
                attempted_user_id: user.id,
                bound_user_id: user.id,
                violation_type: "geofence_mismatch",
                device_info: device_info || null,
                details: {
                  provided_location: location_id,
                  computed_distance_m: providedDistance,
                  allowed_radius_m: deviceCheckInRadius,
                },
              })
            } catch (err) {
              // ignore logging failure
            }

            // allow override for exempt staff
            const isSec2 = isSecurityDept(userProfile?.departments)
            const isOp2 = isOperationalDept(userProfile?.departments)
            const isTrans2 = isTransportDept(userProfile?.departments)
            if (override_request && override_reason && (isSec2 || isOp2 || isTrans2)) {
              await supabase.from("emergency_check_in_overrides").insert({
                user_id: user.id,
                check_in_time: checkInTime.toISOString(),
                override_type: 'location_restriction',
                reason: override_reason,
                is_security_staff: isSec2,
                is_operational_staff: isOp2,
                is_transport_staff: isTrans2,
              }).catch(() => {})
              await supabase.from("staff_notifications").insert({
                user_id: user.id,
                title: "Emergency override used",
                message: "An override was used to bypass location restriction during check-in.",
                type: "info",
                is_read: false,
              }).catch(() => {})
              overrideMeta = { type: 'location_restriction' }
              // continue with check-in
            } else {
              return NextResponse.json({ error: "Your device appears to be outside the allowed proximity for the selected location. Please move closer or use the QR code option." }, { status: 400 })
            }
          }
        }
      } else {
        // If no location_id was provided, ensure the nearest location is within the allowed radius
        if (nearest && nearest.distance > deviceCheckInRadius + 500) {
          // allow emergency override for exempt staff
          const isSec3 = isSecurityDept(userProfile?.departments)
          const isOp3 = isOperationalDept(userProfile?.departments)
          const isTrans3 = isTransportDept(userProfile?.departments)
          if (override_request && override_reason && (isSec3 || isOp3 || isTrans3)) {
            await supabase.from("emergency_check_in_overrides").insert({
              user_id: user.id,
              check_in_time: checkInTime.toISOString(),
              override_type: 'location_restriction',
              reason: override_reason,
              is_security_staff: isSec3,
              is_operational_staff: isOp3,
              is_transport_staff: isTrans3,
            }).catch(() => {})
            await supabase.from("staff_notifications").insert({
              user_id: user.id,
              title: "Emergency override used",
              message: "An override was used to bypass location restriction during check-in.",
              type: "info",
              is_read: false,
            }).catch(() => {})
            overrideMeta = { type: 'location_restriction' }
            // proceed normally
          } else {
            return NextResponse.json({ error: "You are too far from any registered QCC location to check in. Please move closer or use the QR code." }, { status: 400 })
          }
        }
      }

      // Check for suspicious location changes (potential cached location spoofing)
      if (!qr_code_used && latitude && longitude) {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        
        const { data: recentCheckIns } = await supabase
          .from("attendance_records")
          .select("check_in_latitude, check_in_longitude, check_in_time")
          .eq("user_id", user.id)
          .gte("check_in_time", sevenDaysAgo.toISOString())
          .not("check_in_latitude", "is", null)
          .not("check_in_longitude", "is", null)
          .order("check_in_time", { ascending: false })
          .limit(5)
        
        if (recentCheckIns && recentCheckIns.length > 0) {
          // Calculate average location from recent check-ins
          const avgLat = recentCheckIns.reduce((sum, record) => sum + record.check_in_latitude, 0) / recentCheckIns.length
          const avgLng = recentCheckIns.reduce((sum, record) => sum + record.check_in_longitude, 0) / recentCheckIns.length
          
          // Check if current location is suspiciously far from average
          const distanceFromAverage = distanceMeters(latitude, longitude, avgLat, avgLng)
          
          // If more than 100km from average location, flag as suspicious
          if (distanceFromAverage > 100000) { // 100km
            console.warn("[v0] Suspicious location change detected:", {
              userId: user.id,
              currentLat: latitude,
              currentLng: longitude,
              avgLat,
              avgLng,
              distance: distanceFromAverage,
              recentLocations: recentCheckIns.length
            })
            
            // Log security violation
            try {
              await supabase.from("audit_logs").insert({
                user_id: user.id,
                action: "suspicious_location_change",
                table_name: "attendance_records",
                record_id: null,
                new_values: {
                  latitude,
                  longitude,
                  distance_from_average: distanceFromAverage,
                  average_latitude: avgLat,
                  average_longitude: avgLng,
                },
                ip_address: request.ip || null,
                user_agent: request.headers.get("user-agent"),
              })
            } catch (err) {
              // ignore logging failure
            }
            
            // Allow check-in but log the anomaly
            console.log("[v0] Allowing check-in despite suspicious location change")
          }
        }
      }
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayDate = yesterday.toISOString().split("T")[0]

    const { data: yesterdayRecord } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", user.id)
      .gte("check_in_time", `${yesterdayDate}T00:00:00`)
      .lt("check_in_time", `${yesterdayDate}T23:59:59`)
      .maybeSingle()

    let missedCheckoutWarning = null
    if (yesterdayRecord && yesterdayRecord.check_in_time && !yesterdayRecord.check_out_time) {
      // Auto check-out the previous day at 11:59 PM
      const autoCheckoutTime = new Date(`${yesterdayDate}T23:59:59`)
      const checkInTime = new Date(yesterdayRecord.check_in_time)
      const workHours = (autoCheckoutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

      await supabase
        .from("attendance_records")
        .update({
          check_out_time: autoCheckoutTime.toISOString(),
          work_hours: Math.round(workHours * 100) / 100,
          check_out_method: "auto_system",
          check_out_location_name: "Auto Check-out (Missed)",
          updated_at: new Date().toISOString(),
        })
        .eq("id", yesterdayRecord.id)

      // Create audit log for missed check-out
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "auto_checkout_missed",
        table_name: "attendance_records",
        record_id: yesterdayRecord.id,
        new_values: {
          reason: "Missed check-out from previous day",
          auto_checkout_time: autoCheckoutTime.toISOString(),
          work_hours_calculated: workHours,
        },
        ip_address: request.ip || null,
        user_agent: request.headers.get("user-agent"),
      })

      missedCheckoutWarning = {
        date: yesterdayDate,
        message: "You did not check out yesterday. This has been recorded and will be visible to your department head.",
      }
    }

    const { data: locationData, error: locationError } = await supabase
      .from("geofence_locations")
      .select("name, address, district_id")
      .eq("id", location_id)
      .single()

    if (locationError) {
      console.error("Location lookup error:", locationError)
    }

    // Get district name separately if needed
    let districtName = null
    if (locationData?.district_id) {
      const { data: district } = await supabase
        .from("districts")
        .select("name")
        .eq("id", locationData.district_id)
        .maybeSingle()
      districtName = district?.name
    }

    let deviceSessionId = null
    if (device_info?.device_id) {
      // First try to find existing session
      const { data: existingSession } = await supabase
        .from("device_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("device_id", device_info.device_id)
        .maybeSingle()

      if (existingSession) {
        // Update existing session
        const { data: updatedSession } = await supabase
          .from("device_sessions")
          .update({
            device_name: device_info.device_name || null,
            device_type: device_info.device_type || null,
            browser_info: device_info.browser_info || null,
            ip_address: request.ip || null,
            is_active: true,
            last_activity: new Date().toISOString(),
          })
          .eq("id", existingSession.id)
          .select("id")
          .maybeSingle()

        if (updatedSession) {
          deviceSessionId = updatedSession.id
        }
      } else {
        // Create new session only if we have a valid device_id
        const { data: newSession, error: sessionError } = await supabase
          .from("device_sessions")
          .insert({
            user_id: user.id,
            device_id: device_info.device_id,
            device_name: device_info.device_name || null,
            device_type: device_info.device_type || null,
            browser_info: device_info.browser_info || null,
            ip_address: request.ip || null,
            is_active: true,
            last_activity: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle()

        if (sessionError) {
          console.error("[v0] Device session creation error:", sessionError)
          // Continue without device session - it's optional
        } else if (newSession) {
          deviceSessionId = newSession.id
        }
      }
    }

    // Check if check-in is after 9:00 AM (late arrival)
    const checkInTime = new Date()
    const checkInHour = checkInTime.getHours()
    const checkInMinutes = checkInTime.getMinutes()
    const isWeekend = checkInTime.getDay() === 0 || checkInTime.getDay() === 6
    const isLateArrival = checkInHour > 9 || (checkInHour === 9 && checkInMinutes > 0)

    // CHECK TIME RESTRICTION: Check if check-in is after 1 PM (13:00)
    const canCheckIn = canCheckInAtTime(checkInTime, userProfile?.departments, userProfile?.role)
    if (!canCheckIn) {
      // allow eligible staff to override
      const isSec = isSecurityDept(userProfile?.departments)
      const isOp = isOperationalDept(userProfile?.departments)
      const isTrans = isTransportDept(userProfile?.departments)
      if (override_request && override_reason && (isSec || isOp || isTrans)) {
        await supabase.from("emergency_check_in_overrides").insert({
          user_id: user.id,
          check_in_time: checkInTime.toISOString(),
          override_type: 'time_restriction',
          reason: override_reason,
          is_security_staff: isSec,
          is_operational_staff: isOp,
          is_transport_staff: isTrans,
        }).catch(() => {})
        overrideMeta = { type: 'time_restriction' }
        await supabase.from("staff_notifications").insert({
          user_id: user.id,
          title: "Emergency override used",
          message: "An override was used to bypass time restriction during check-in.",
          type: "info",
          is_read: false,
        }).catch(() => {})
        // continue to normal check-in flow, but also inform front-end
        // we can attach a flag later in response
      } else {
        return NextResponse.json({
          error: `Check-in is only allowed before ${getCheckInDeadline()}. Your department/role does not have exceptions for late check-ins.`,
          checkInBlocked: true,
          currentTime: checkInTime.toLocaleTimeString(),
          deadline: getCheckInDeadline(),
        }, { status: 403 })
      }
    }

    const latenessRequired = requiresLatenessReason(checkInTime, userProfile?.departments, userProfile?.role)
    if (isLateArrival && latenessRequired && (!lateness_reason || lateness_reason.trim().length === 0)) {
      return NextResponse.json({
        error: "Lateness reason is required when checking in after 9:00 AM",
        requiresLatenessReason: true,
        checkInTime: checkInTime.toLocaleTimeString(),
      }, { status: 400 })
    }

    const attendanceData = {
      user_id: user.id,
      check_in_time: checkInTime.toISOString(),
      check_in_location_id: location_id,
      device_session_id: deviceSessionId,
      status: isLateArrival ? "late" : "present",
      check_in_method: qr_code_used ? "qr_code" : "gps",
      check_in_location_name: locationData?.name || null,
      is_remote_location: false, // Will be calculated based on user's assigned location
    }

    // Add GPS coordinates only if available
    if (latitude && longitude) {
      attendanceData.check_in_latitude = latitude
      attendanceData.check_in_longitude = longitude
    }

    // Add QR code timestamp if used
    if (qr_code_used && qr_timestamp) {
      attendanceData.qr_check_in_timestamp = qr_timestamp
    }

    // Add lateness reason if provided
    if (lateness_reason) {
      attendanceData.lateness_reason = lateness_reason.trim()
      if (lateness_proved_by) attendanceData.lateness_proved_by = String(lateness_proved_by).trim()
      if (lateness_proved_by_id) attendanceData.lateness_proved_by_id = lateness_proved_by_id
    }

    if (userProfile?.assigned_location_id && userProfile.assigned_location_id !== location_id) {
      attendanceData.is_remote_location = true
    }

    const { data: attendanceRecord, error: attendanceError } = await supabase
      .from("attendance_records")
      .insert(attendanceData)
      .select("*")
      .single()

    // Calculate check-in position for the location today
    let checkInPosition = null
    if (attendanceRecord && location_id) {
      const { count } = await supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("check_in_location_id", location_id)
        .gte("check_in_time", `${today}T00:00:00`)
        .lte("check_in_time", attendanceRecord.check_in_time)

      checkInPosition = count || 1
    }

    if (attendanceError) {
      console.error("[v0] Attendance insert error:", attendanceError)

      // Check if error is due to unique constraint violation
      if (attendanceError.code === "23505" || attendanceError.message?.includes("idx_unique_daily_checkin")) {
        console.log("[v0] RACE CONDITION CAUGHT - Unique constraint prevented duplicate check-in")
        return NextResponse.json(
          {
            error:
              "DUPLICATE CHECK-IN BLOCKED: You have already checked in today. This was a race condition that was prevented by the system. Please refresh your page.",
          },
          { status: 400 },
        )
      }

      // In development return more details to help debugging; avoid leaking DB internals in production
      const devDetails = process.env.NODE_ENV === "production" ? undefined : {
        message: attendanceError.message,
        code: attendanceError.code,
        details: attendanceError.details || attendanceError.hint || null,
      }

      console.error("[v0] Failed to record attendance - returning error response")
      return NextResponse.json(
        { error: "Failed to record attendance", dbError: devDetails },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      )
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "check_in",
      table_name: "attendance_records",
      record_id: attendanceRecord.id,
      new_values: {
        ...attendanceRecord,
        location_name: locationData?.name,
        district_name: districtName,
        check_in_method: attendanceData.check_in_method,
        is_remote_location: attendanceData.is_remote_location,
      },
      ip_address: request.ip || null,
      user_agent: request.headers.get("user-agent"),
    })

    // Prepare response with late arrival warning if applicable
    let checkInMessage = attendanceData.is_remote_location
      ? `Successfully checked in at ${locationData?.name} (different from your assigned location). Remember to check out at the end of your work today.`
      : `Successfully checked in at ${locationData?.name}. Remember to check out at the end of your work today.`

    if (isLateArrival) {
      const arrivalTime = `${checkInHour}:${checkInMinutes.toString().padStart(2, '0')}`
      checkInMessage = `Late arrival detected - You checked in at ${arrivalTime} (after 9:00 AM). ${checkInMessage}`
    }

    return NextResponse.json({ 
      success: true,
      attendance: attendanceRecord,
      message: checkInMessage,
      deviceSharingWarning,
      checkInPosition: checkInPosition,
      overrideUsed: overrideMeta !== null,
      overrideType: overrideMeta?.type || null,
    });
  }
  catch (error: unknown) {
    console.error("Check-in error:", error);
    // expose message when not in production so client can diagnose
    const message =
      typeof error === "string"
        ? error
        : error && (error as any).message
        ? (error as any).message
        : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }


}
