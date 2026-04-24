"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  getCurrentLocation,
  safeGetCurrentLocation,
  getAveragedLocation,
  validateAttendanceLocation,
  validateCheckoutLocation,
  calculateDistance,
  detectWindowsLocationCapabilities,
  type LocationData,
  type ProximitySettings,
  type GeoSettings,
  reverseGeocode,
} from "@/lib/geolocation"
import { getDeviceInfo } from "@/lib/device-info"
import type { QRCodeData } from "@/lib/qr-code"
import { useRealTimeLocations } from "@/hooks/use-real-time-locations"
import { useDeviceRadiusSettings } from "@/hooks/use-device-radius-settings"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  MapPin,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Laptop,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { LocationCodeDialog } from "@/components/dialogs/location-code-dialog"
import { QRScannerDialog } from "@/components/dialogs/qr-scanner-dialog"
import { FlashMessage } from "@/components/notifications/flash-message"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { ToastAction } from "@/components/ui/toast"
import { clearAttendanceCache, shouldClearCache, setCachedDate } from "@/lib/utils/attendance-cache"
import { cn } from "@/lib/utils"
import { requiresLatenessReason, requiresEarlyCheckoutReason, canCheckInAtTime, canCheckOutAtTime, canAutoCheckoutOutOfRange, getCheckInDeadline, getCheckOutDeadline, isSecurityDept, isOperationalDept, isTransportDept } from "@/lib/attendance-utils"
import { DeviceActivityHistory } from "@/components/attendance/device-activity-history"
import { ActiveSessionTimer } from "@/components/attendance/active-session-timer"
import {
  getPasswordEnforcementMessage,
  isPasswordChangeRequired,
} from "@/lib/security"
import { DEFAULT_RUNTIME_FLAGS, type RuntimeFlags } from "@/lib/runtime-flags"

interface GeofenceLocation {
  id: string
  name: string
  address?: string
  latitude: number
  longitude: number
  radius_meters: number
}

interface UserProfile {
  id: string
  first_name: string
  last_name: string
  employee_id: string
  position: string
  role?: string
  assigned_location_id?: string
  departments?: {
    name: string
    code: string
  }
}

interface AssignedLocationInfo {
  location: GeofenceLocation
  distance?: number
  isAtAssignedLocation: boolean
  name: string // Added for convenience
  check_in_start_time?: string | null
  check_out_end_time?: string | null
}

interface AttendanceRecorderProps {
  todayAttendance?: {
    id: string
    check_in_time: string
    check_out_time?: string
    work_hours?: number
    check_in_location_name?: string
    check_out_location_name?: string
    is_remote_location?: boolean
    different_checkout_location?: boolean
  } | null
  geoSettings?: GeoSettings
  locations?: GeofenceLocation[]
  canCheckIn?: boolean
  canCheckOut?: boolean
  className?: string
  userLeaveStatus?: "active" | "pending" | "rejected" | null
}

// Placeholder for WindowsCapabilities, assuming it's defined elsewhere or inferred
type WindowsCapabilities = ReturnType<typeof detectWindowsLocationCapabilities>

const REFRESH_PAUSE_DURATION = 50000 // 50 seconds instead of 120000 (2 minutes)

// Helper function to get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(num: number): string {
  const j = num % 10
  const k = num % 100
  if (j === 1 && k !== 11) {
    return "st"
  }
  if (j === 2 && k !== 12) {
    return "nd"
  }
  if (j === 3 && k !== 13) {
    return "rd"
  }
  return "th"
}

export function AttendanceRecorder({
  todayAttendance: initialTodayAttendance,
  geoSettings,
  locations: propLocations,
  canCheckIn: initialCanCheckIn,
  canCheckOut: initialCanCheckOut,
  className,
  userLeaveStatus,
}: AttendanceRecorderProps) {
  const router = useRouter()
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [checkingMessage, setCheckingMessage] = useState("")
  const [runtimeFlags, setRuntimeFlags] = useState<RuntimeFlags>(DEFAULT_RUNTIME_FLAGS)

  const [isLoading, setIsLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<LocationData | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [assignedLocationInfo, setAssignedLocationInfo] = useState<AssignedLocationInfo | null>(null)
  const {
    locations: realTimeLocations, // Renamed from `locations` to avoid conflict with propLocations
    loading: locationsLoading,
    error: locationsError,
    isConnected,
  } = useRealTimeLocations()
  const { settings: deviceRadiusSettings, loading: deviceRadiusLoading } = useDeviceRadiusSettings()
  const [proximitySettings, setProximitySettings] = useState<ProximitySettings>({
    checkInProximityRange: 50,
    defaultRadius: 20,
    requireHighAccuracy: true,
    allowManualOverride: false,
  })
  const [locationValidation, setLocationValidation] = useState<{
    canCheckIn: boolean
    canCheckOut?: boolean
    nearestLocation?: GeofenceLocation
    distance?: number
    message: string
    accuracyWarning?: string
    criticalAccuracyIssue?: boolean
    allLocations?: { location: GeofenceLocation; distance: number }[]
    availableLocations?: { location: GeofenceLocation; distance: number }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [successDialogMessage, setSuccessDialogMessage] = useState("")
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [qrScanMode, setQrScanMode] = useState<"checkin" | "checkout">("checkin")
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<{
    granted: boolean | null
    message: string
  }>({ granted: null, message: "" })
  const [showLocationHelp, setShowLocationHelp] = useState(false)
  const [windowsCapabilities, setWindowsCapabilities] = useState<ReturnType<
    typeof detectWindowsLocationCapabilities
  > | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split("T")[0])
  const [showEarlyCheckoutDialog, setShowEarlyCheckoutDialog] = useState(false)
  const [earlyCheckoutReason, setEarlyCheckoutReason] = useState("")
  const [earlyCheckoutProvedBy, setEarlyCheckoutProvedBy] = useState("")
  const [earlyCheckoutReasonRequired, setEarlyCheckoutReasonRequired] = useState(true)
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{
    location: LocationData | null
    nearestLocation: any
  } | null>(null)
  const [showLatenessDialog, setShowLatenessDialog] = useState(false)
  const [latenessReason, setLatenessReason] = useState("")
  const [latenessProvedBy, setLatenessProvedBy] = useState("")
  const [showOffPremisesReasonDialog, setShowOffPremisesReasonDialog] = useState(false)
  const [offPremisesReason, setOffPremisesReason] = useState("")
  const [pendingOffPremisesLocation, setPendingOffPremisesLocation] = useState<LocationData | null>(null)
  const [hasPendingOffPremisesRequest, setHasPendingOffPremisesRequest] = useState(false)
  // 'checkin' | 'checkout' - reused by the off-premises reason dialog
  // off-premises request mode is no longer needed; only check-in requests are supported

  // Helper: treat Security department as exempt from lateness / early-checkout reason prompts
  const isSecurityStaff = useMemo(() => {
    const deptName = userProfile?.departments?.name || ""
    const deptCode = (userProfile?.departments?.code || "").toString()
    return Boolean(
      deptCode.toLowerCase() === "security" ||
      deptName.toLowerCase().includes("security")
    )
  }, [userProfile]);

  const [pendingCheckInData, setPendingCheckInData] = useState<{
    location: LocationData | null
    nearestLocation: any
    qrCodeUsed: boolean
    qrTimestamp: string | null
  } | null>(null)
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showLocationCodeDialog, setShowLocationCodeDialog] = useState(false) // Added

  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  const [detectedLocationName, setDetectedLocationName] = useState<string | null>(null)

  const [locationPermissionStatusSimplified, setLocationPermissionStatusSimplified] = useState<{
    granted: boolean
    message: string
  }>({
    granted: false,
    message: "Click 'Get Current Location' to enable GPS-based attendance",
  })

  const [recentCheckIn, setRecentCheckIn] = useState(false)
  const [recentCheckOut, setRecentCheckOut] = useState(false)
  const [localTodayAttendance, setLocalTodayAttendance] = useState(initialTodayAttendance)
  const serverClockRef = useRef<{ baseServerMs: number; basePerfMs: number } | null>(null)
  const [, setSystemClockTick] = useState(0)
  const autoCheckoutAttemptedRef = useRef(false)
  const autoCheckInAttemptedRef = useRef(false)

  const [checkoutTimeReached, setCheckoutTimeReached] = useState(false)
  // remote checkout timer disabled (only normal checkouts allowed)

  const [isCheckInProcessing, setIsCheckInProcessing] = useState(false)
  const [lastCheckInAttempt, setLastCheckInAttempt] = useState<number>(0)
  const [deviceInfo, setDeviceInfo] = useState(() => getDeviceInfo())
  const [timeRestrictionWarning, setTimeRestrictionWarning] = useState<{ type: 'checkin' | 'checkout'; message: string } | null>(null)

  const loadRuntimeFlags = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/runtime", { cache: "no-store" })
      if (!response.ok) return

      const data = (await response.json()) as { flags?: RuntimeFlags }
      if (data.flags) {
        setRuntimeFlags(data.flags)
      }
    } catch {
      // Keep defaults when runtime settings endpoint is unavailable.
    }
  }, [])

  const getSystemNow = useCallback(() => {
    const clock = serverClockRef.current
    if (!clock) return new Date()

    const elapsedMs = performance.now() - clock.basePerfMs
    return new Date(clock.baseServerMs + elapsedMs)
  }, [])

  useEffect(() => {
    void loadRuntimeFlags()
    const id = setInterval(() => {
      void loadRuntimeFlags()
    }, 60_000)

    return () => clearInterval(id)
  }, [loadRuntimeFlags])

  useEffect(() => {
    let isCancelled = false

    const syncServerTime = async () => {
      try {
        const response = await fetch("/api/system-time", { cache: "no-store" })
        if (!response.ok) return

        const payload = (await response.json()) as { utcEpochMs?: number }
        if (!payload.utcEpochMs) return

        serverClockRef.current = {
          baseServerMs: payload.utcEpochMs,
          basePerfMs: performance.now(),
        }

        if (!isCancelled) {
          setSystemClockTick((value) => value + 1)
        }
      } catch {
        // Keep fallback clock and retry on next sync cycle.
      }
    }

    void syncServerTime()

    const tickId = setInterval(() => {
      if (!isCancelled && serverClockRef.current) {
        setSystemClockTick((value) => value + 1)
      }
    }, 1000)

    const syncId = setInterval(() => {
      void syncServerTime()
    }, 60_000)

    return () => {
      isCancelled = true
      clearInterval(tickId)
      clearInterval(syncId)
    }
  }, [])

  // Check time restrictions and show warnings
  useEffect(() => {
    const now = getSystemNow()
    const userDept = userProfile?.departments
    const userRole = userProfile?.role

    // If user is in an exempt department (security / operations / transport),
    // do not show time-based restriction warnings — they can check in/out anytime.
    const isExemptDept = isSecurityDept(userDept) || isOperationalDept(userDept) || isTransportDept(userDept)
    if (isExemptDept) {
      setTimeRestrictionWarning(null)
      return
    }

    const canCheckIn = canCheckInAtTime(now, userDept, userRole)
    const canCheckOut = canCheckOutAtTime(now, userDept, userRole)

    if (!canCheckIn && !localTodayAttendance?.check_in_time) {
      setTimeRestrictionWarning({
        type: 'checkin',
        message: `Check-in is only allowed before ${getCheckInDeadline()}. Your department does not have exemptions for late check-ins.`
      })
    } else if (!canCheckOut && localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time) {
      setTimeRestrictionWarning({
        type: 'checkout',
        message: `Check-out is only allowed before ${getCheckOutDeadline()}. Your department does not have exemptions for late check-outs.`
      })
    } else {
      setTimeRestrictionWarning(null)
    }
  }, [userProfile, localTodayAttendance, getSystemNow])

  // Check if cache should be cleared (new day)
  useEffect(() => {
    if (shouldClearCache()) {
      console.log("[v0] New day detected - clearing attendance cache")
      clearAttendanceCache()

      // Reset local state
      setLocalTodayAttendance(null)
      setRecentCheckIn(false)
      setRecentCheckOut(false)

      // Fetch fresh data
      fetchTodayAttendance()
      // fetchLeaveStatus() // Fetch leave status again on new day

      // Update cached date
      const today = getSystemNow().toISOString().split("T")[0]
      setCachedDate(today)
    }
  }, [getSystemNow]) // Run once on component mount

  useEffect(() => {
    const checkDateChange = setInterval(() => {
      if (shouldClearCache()) {
        console.log("[v0] Date changed while app is active - clearing cache")
        clearAttendanceCache()

        // Reset local state
        setLocalTodayAttendance(null)
        setRecentCheckIn(false)
        setRecentCheckOut(false)

        // Fetch fresh data
        fetchTodayAttendance()
        // fetchLeaveStatus() // Fetch leave status again on date change

        // Update cached date
        const today = getSystemNow().toISOString().split("T")[0]
        setCachedDate(today)
      }
    }, 60000) // Check every minute

    return () => clearInterval(checkDateChange)
  }, [getSystemNow])

  const [flashMessage, setFlashMessage] = useState<{
    message: string
    type: "success" | "error" | "info" | "warning"
  } | null>(null)

  const [refreshTimer, setRefreshTimer] = useState<number | null>(null)

  const [minutesUntilCheckout, setMinutesUntilCheckout] = useState<number | null>(null)

  const fetchTodayAttendance = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const today = getSystemNow().toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", user.id)
        .gte("check_in_time", `${today}T00:00:00`)
        .lte("check_in_time", `${today}T23:59:59`)
        .order("check_in_time", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error("[v0] Error fetching today's attendance:", error)
        return
      }

      if (data) {
        setLocalTodayAttendance(data)
      }
    } catch (error) {
      console.error("[v0] Error in fetchTodayAttendance:", error)
    }
  }



  // SMART LEAVE HANDLING: Disable check-in/check-out when user is on leave
  // Note: 'active' means working/at post, 'on_leave' or 'sick_leave' means actually on leave
  const isOnLeave = userLeaveStatus === "on_leave" || userLeaveStatus === "sick_leave"
  
  // Default canCheckIn to true if not explicitly set, allowing staff to check in any time after midnight
  // MUST also verify user is within proximity range (matches checkout validation logic)
  const canCheckInButton = (initialCanCheckIn ?? true) && !recentCheckIn && !localTodayAttendance?.check_in_time && !isOnLeave && locationValidation?.canCheckIn === true
  
  // CRITICAL: Checkout button should ONLY be enabled if:
  // 1. User has actually checked in today
  // 2. User is within the proximity range (location validation passes)
  // 3. Haven't checked out yet
  // This prevents users from checking out when out of range
  const canCheckOutButton =
    (initialCanCheckOut ?? true) &&
    !recentCheckOut &&
    !!localTodayAttendance?.check_in_time && // Must have a check-in record
    !localTodayAttendance?.check_out_time &&
    !isOnLeave &&
    // Allow checkout when either location validation passes, the session was started
    // as an off‑premises request, or the minimum two‑hour duration has been reached.
    (locationValidation?.canCheckOut === true ||
      localTodayAttendance?.on_official_duty_outside_premises === true ||
      checkoutTimeReached)

  const handleQRScanSuccess = async (qrData: QRCodeData) => {
    console.log("[v0] QR scan successful, mode:", qrScanMode)
    setShowQRScanner(false)

    if (qrScanMode === "checkin") {
      await handleQRCheckIn(qrData)
    } else {
      await handleQRCheckOut(qrData)
    }
  }

  const handleQRCheckIn = async (qrData: QRCodeData) => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      console.log("[v0] Processing QR check-in with data:", qrData)

      const response = await fetch("/api/attendance/qr-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: qrData.locationId,
          qr_timestamp: qrData.timestamp,
          userLatitude: qrData.userLatitude,
          userLongitude: qrData.userLongitude,
          device_info: getDeviceInfo(),
        }),
      })

      const result = await response.json()
      console.log("[v0] QR check-in API response:", result)

      if (!response.ok) {
        const errorMsg = result.message || result.error || "Failed to check in with QR code"
        throw new Error(errorMsg)
      }

      setSuccess("✓ Checked in successfully with QR code!")
      console.log("[v0] QR check-in successful")

      // mutate() // Assuming mutate is a function from SWR or similar, not defined here, so commented out.

      // Show success popup
      setTimeout(() => {
        setSuccess(null)
      }, 5000)
    } catch (error: any) {
      console.error("[v0] QR check-in error:", error)
      setError(error.message || "Failed to check in with QR code")

      toast({
        title: "Check-in Failed",
        description: error.message || "Failed to check in with QR code",
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleQRCheckOut = async (qrData: QRCodeData) => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      console.log("[v0] Processing QR check-out with data:", qrData)

      const response = await fetch("/api/attendance/qr-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: qrData.locationId,
          qr_timestamp: qrData.timestamp,
          userLatitude: qrData.userLatitude,
          userLongitude: qrData.userLongitude,
          device_info: getDeviceInfo(),
        }),
      })

      const result = await response.json()
      console.log("[v0] QR check-out API response:", result)

      if (!response.ok) {
        const errorMsg = result.message || result.error || "Failed to check out with QR code"
        throw new Error(errorMsg)
      }

      setSuccess("✓ Checked out successfully with QR code!")
      console.log("[v0] QR check-out successful")

      // mutate() // Assuming mutate is a function from SWR or similar, not defined here, so commented out.

      // Show success popup
      setTimeout(() => {
        setSuccess(null)
      }, 5000)
    } catch (error: any) {
      console.error("[v0] QR check-out error:", error)
      setError(error.message || "Failed to check out with QR code")

      toast({
        title: "Check-out Failed",
        description: error.message || "Failed to check out with QR code",
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleUseQRCode = (mode: "checkin" | "checkout") => {
    // Redirect to QR Events page with mode parameter
    window.location.href = `/dashboard/qr-events?mode=${mode}`
  }

  useEffect(() => {
    fetchUserProfile()
    loadProximitySettings()
    const capabilities = detectWindowsLocationCapabilities()
    setWindowsCapabilities(capabilities)
    console.log("[v0] Windows location capabilities detected:", capabilities)

    // Initialize device info
    setDeviceInfo(getDeviceInfo())

    const autoLoadLocation = async () => {
      const shouldSilentlyLoadLocation = Boolean(
        initialTodayAttendance?.check_in_time && !initialTodayAttendance?.check_out_time,
      )

      if (!shouldSilentlyLoadLocation) {
        console.log("[v0] Skipping automatic GPS load until attendance action is needed")
        return
      }

      try {
        console.log("[v0] Silently loading location for active attendance session...")
        const { location } = await safeGetCurrentLocation(true)
        if (location) {
          setUserLocation(location)
          setLocationPermissionStatus({ granted: true, message: "Location access granted" })
          console.log("[v0] Silent location load succeeded:", location)
        }
      } catch (error) {
        console.log("[v0] Silent location load skipped; user can use QR or refresh manually:", error)
      }
    }

    autoLoadLocation()
  }, [])

  useEffect(() => {
    if (userLocation?.latitude && userLocation?.longitude) {
      reverseGeocode(userLocation.latitude, userLocation.longitude)
        .then((name) => {
          console.log("[v0] Detected location name:", name)
          setDetectedLocationName(name)
        })
        .catch((err) => console.error("[v0] Failed to get location name:", err))
    }
  }, [userLocation])

  useEffect(() => {
    loadProximitySettings()
  }, [])

  useEffect(() => {
    const checkDateChange = () => {
      const newDate = getSystemNow().toISOString().split("T")[0]
      if (newDate !== currentDate) {
        console.log("[v0] Date changed from", currentDate, "to", newDate)
        setCurrentDate(newDate)
        window.location.reload()
      }
    }

    const interval = setInterval(checkDateChange, 60000)

    return () => clearInterval(interval)
  }, [currentDate, getSystemNow])

  useEffect(() => {
    if (localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time) {
      const checkInTime = new Date(localTodayAttendance.check_in_time)
      const now = getSystemNow()
      const hoursSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

      // normal 2‑hour timer logic; off-premises status does not change countdown – user must be within range to checkout
      if (hoursSinceCheckIn < 2) {
        const minutesLeft = Math.ceil((2 - hoursSinceCheckIn) * 60)
        setMinutesUntilCheckout(minutesLeft)

        const interval = setInterval(() => {
          const now2 = getSystemNow()
          const hours2 = (now2.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)
          if (hours2 >= 2) {
            setMinutesUntilCheckout(null)
            setCheckoutTimeReached(true)
            clearInterval(interval)
          } else {
            setMinutesUntilCheckout(Math.ceil((2 - hours2) * 60))
          }
        }, 60000)

        return () => clearInterval(interval)
      } else {
        setMinutesUntilCheckout(null)
        setCheckoutTimeReached(true)
      }
      // previously there was off-premises checkout timer logic here, but remote
      // checkouts are disabled so we no longer track it.
    } else {
      setMinutesUntilCheckout(null)
      setCheckoutTimeReached(false)
    }
  }, [localTodayAttendance?.check_in_time, localTodayAttendance?.check_out_time, getSystemNow])

  useEffect(() => {
    const checkCheckoutTime = () => {
      if (localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time) {
        const checkInTime = new Date(localTodayAttendance.check_in_time)
        const now = getSystemNow()
        const hoursSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)
        setCheckoutTimeReached(hoursSinceCheckIn >= 2)
      } else {
        setCheckoutTimeReached(false)
      }
    }

    checkCheckoutTime()
    const interval = setInterval(checkCheckoutTime, 60000)
    return () => clearInterval(interval)
  }, [localTodayAttendance, getSystemNow])

  const loadProximitySettings = async () => {
    try {
      const response = await fetch("/api/settings")
      if (response.ok) {
        const data = await response.json()
        if (data.systemSettings?.geo_settings) {
          const geoSettings = data.systemSettings.geo_settings
          setProximitySettings({
            checkInProximityRange: Number.parseInt(geoSettings.checkInProximityRange) || 50,
            defaultRadius: Number.parseInt(geoSettings.defaultRadius) || 20,
            requireHighAccuracy: geoSettings.requireHighAccuracy ?? true,
            allowManualOverride: geoSettings.allowManualOverride ?? false,
          })
          console.log("[v0] Loaded proximity settings:", {
            checkInProximityRange: Number.parseInt(geoSettings.checkInProximityRange) || 50,
            defaultRadius: Number.parseInt(geoSettings.defaultRadius) || 20,
          })
        }
      }
    } catch (error) {
      console.error("[v0] Failed to load proximity settings:", error)
    }
  }

  useEffect(() => {
    if (
      userLocation?.latitude &&
      userLocation?.longitude &&
      realTimeLocations &&
      realTimeLocations.length > 0 &&
      userProfile?.assigned_location_id
    ) {
      const assignedLocation = realTimeLocations.find((loc) => loc.id === userProfile.assigned_location_id)
      if (assignedLocation) {
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          assignedLocation.latitude,
          assignedLocation.longitude,
        )
        const isAtAssignedLocation = distance <= assignedLocation.radius_meters

        setAssignedLocationInfo({
          location: assignedLocation,
          distance: Math.round(distance),
          isAtAssignedLocation,
          name: assignedLocation.name,
          check_in_start_time: assignedLocation.check_in_start_time,
          check_out_end_time: assignedLocation.check_out_end_time,
        })

        console.log("[v0] Assigned location info:", {
          name: assignedLocation.name,
          distance: Math.round(distance),
          isAtAssignedLocation,
          radius: assignedLocation.radius_meters,
        })
      }
    }
  }, [userLocation, realTimeLocations, userProfile])

  useEffect(() => {
    if (userLocation && realTimeLocations && realTimeLocations.length > 0) {
      console.log(
        "[v0] All available locations:",
        realTimeLocations.map((l) => ({
          name: l.name,
          address: l.address,
          lat: l.latitude,
          lng: l.longitude,
          radius: l.radius_meters,
        })),
      )

      console.log("[v0] User location:", {
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        accuracy: userLocation.accuracy,
      })

      const locationDistances = realTimeLocations
        .map((location) => {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            location.latitude,
            location.longitude,
          )
          return {
            location,
            distance: Math.round(distance),
          }
        })
        .sort((a, b) => a.distance - b.distance)

      console.log("[v0] Distance to each location:", locationDistances)

      // Get device-specific radius from settings based on device type
      const deviceInfo = getDeviceInfo()
      let checkInRadius: number | undefined
      let checkOutRadius: number | undefined
      
      if (deviceRadiusSettings) {
        if (deviceInfo.device_type === "mobile") {
          checkInRadius = deviceRadiusSettings.mobile.checkIn
          checkOutRadius = deviceRadiusSettings.mobile.checkOut
        } else if (deviceInfo.device_type === "tablet") {
          checkInRadius = deviceRadiusSettings.tablet.checkIn
          checkOutRadius = deviceRadiusSettings.tablet.checkOut
        } else if (deviceInfo.device_type === "laptop") {
          checkInRadius = deviceRadiusSettings.laptop.checkIn
          checkOutRadius = deviceRadiusSettings.laptop.checkOut
        } else if (deviceInfo.device_type === "desktop") {
          checkInRadius = deviceRadiusSettings.desktop.checkIn
          checkOutRadius = deviceRadiusSettings.desktop.checkOut
        }
      }

      console.log("[v0] Using device radius:", { checkInRadius, checkOutRadius, deviceType: deviceInfo.device_type })

      const validation = validateAttendanceLocation(userLocation, realTimeLocations, proximitySettings, checkInRadius)
      const checkoutValidation = validateCheckoutLocation(userLocation, realTimeLocations, checkOutRadius)

      console.log("[v0] Location validation result:", validation)
      console.log("[v0] Check-out validation result:", checkoutValidation)
      console.log(
        "[v0] Locations data:",
        realTimeLocations.map((l) => ({ name: l.name, radius: l.radius_meters })),
      )
      console.log("[v0] Validation message:", validation.message)
      console.log("[v0] Can check in:", validation.canCheckIn)
      console.log("[v0] Can check out:", checkoutValidation.canCheckOut)
      console.log("[v0] Distance:", validation.distance)
      console.log("[v0] Nearest location being checked:", validation.nearestLocation?.name)
      console.log("[v0] Using checkout proximity range:", checkOutRadius)

      const criticalAccuracyIssue =
        userLocation.accuracy > 1000 || (windowsCapabilities?.isWindows && userLocation.accuracy > 100)
      let accuracyWarning = ""
      if (criticalAccuracyIssue) {
        accuracyWarning = `Your current GPS accuracy (${userLocation.accuracy.toFixed(0)}m) is critically low. For accurate attendance, please use the QR code option or ensure you are in an open area with clear sky view.`
      } else if (userLocation.accuracy > 100) {
        accuracyWarning = `Your current GPS accuracy (${userLocation.accuracy.toFixed(0)}m) is moderate. For best results, ensure you have a clear view of the sky or move closer to your assigned location.`
      }

      setLocationValidation({
        ...validation,
        canCheckOut: checkoutValidation.canCheckOut,
        allLocations: locationDistances,
        criticalAccuracyIssue,
        accuracyWarning,
      })
    }
  }, [userLocation, realTimeLocations, proximitySettings, windowsCapabilities, deviceRadiusSettings])

  const fetchUserProfile = async () => {
    try {
      console.log("[v0] Fetching user profile...")
      const supabase = createClient()

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          console.log("[v0] No authenticated user found")
          return
        }

        const { data: profileData, error } = await supabase
          .from("user_profiles")
          .select(`
            id,
            first_name,
            last_name,
            employee_id,
            position,
            role,
            assigned_location_id,
            password_changed_at,
            departments (
              name,
              code
            )
          `)
          .eq("id", user.id)
          .single()

        if (error) {
          console.error("[v0] Failed to fetch user profile:", error)
          return
        }

        setUserProfile(profileData)
        console.log("[v0] User profile loaded:", {
          name: `${profileData.first_name} ${profileData.last_name}`,
          employee_id: profileData.employee_id,
          position: profileData.position,
          role: profileData.role,
          assigned_location_id: profileData.assigned_location_id,
          department: profileData.departments?.name,
          password_changed_at: profileData.password_changed_at,
        })

        const mustChangePassword =
          runtimeFlags.passwordEnforcementEnabled &&
          (Boolean(user.user_metadata?.force_password_change) || isPasswordChangeRequired(profileData.password_changed_at))

        if (mustChangePassword) {
          console.log("[v0] Monthly password change required, redirecting to profile")
          toast({
            title: "Password Change Required",
            description: getPasswordEnforcementMessage(),
            variant: "destructive",
          })
          router.push("/dashboard/profile?forceChange=true&reason=monthly")
          return
        }
      } catch (authError) {
        console.error("[v0] Supabase auth error:", authError)
        if (!window.location.hostname.includes("vusercontent.net")) {
          setError("Authentication error. Please refresh the page.")
        }
      }
      // After loading profile, check for any pending off-premises requests for today
      try {
        const supabase2 = createClient()
        const {
          data: { user: currentUser },
        } = await supabase2.auth.getUser()
        if (currentUser?.id) {
          const today = getSystemNow().toISOString().split("T")[0]
          const { data: pendingReq, error: pendingErr } = await supabase2
            .from("pending_offpremises_checkins")
            .select("*")
            .eq("user_id", currentUser.id)
            .gte("created_at", `${today}T00:00:00`)
            .lte("created_at", `${today}T23:59:59`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          if (pendingErr) {
            console.warn("[v0] Could not check pending off-premises request:", pendingErr)
          } else if (pendingReq) {
            // Determine if the request is still awaiting approval. Be defensive about schema.
            const isPending = (pendingReq.status && String(pendingReq.status).toLowerCase() === "pending") || (!pendingReq.approved_at && !pendingReq.rejected_at)
            setHasPendingOffPremisesRequest(Boolean(isPending))
            console.log("[v0] Pending off-premises request for today:", Boolean(isPending))
          } else {
            setHasPendingOffPremisesRequest(false)
          }
        }
      } catch (err) {
        console.warn("[v0] Error checking pending off-premises request:", err)
      }
    } catch (error) {
      console.error("[v0] Error fetching user profile:", error)
      if (!window.location.hostname.includes("vusercontent.net")) {
        setError("Failed to load user profile. Please refresh the page.")
      }
    }
  }

  const getCurrentLocationData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const capabilities = detectWindowsLocationCapabilities()
      console.log("[v0] Browser:", capabilities.browserName)

      const useSampling = capabilities.browserName === "Opera" || capabilities.hasKnownIssues

      console.log(`[v0] Using ${useSampling ? "multi-sample" : "single"} GPS reading...`)
      const location = useSampling ? await getAveragedLocation(3) : await getCurrentLocation()

      setUserLocation(location)

      setLocationPermissionStatus({ granted: true, message: "Location access granted" })
      setLocationPermissionStatusSimplified({ granted: true, message: "Location access granted" })
      return location
    } catch (error) {
      console.warn("[v0] Failed to get location:", error)
      const errorMessage =
        error instanceof Error ? error.message : "Unable to access location. Please enable GPS or use QR code option."
      setError(errorMessage)
      setLocationPermissionStatus({
        granted: false,
        message: errorMessage,
      })
      setLocationPermissionStatusSimplified({
        granted: false,
        message: errorMessage,
      })

      // Show contextual help UI
      setShowLocationHelp(true)

      // If this is a timeout / Windows Location Services failure, nudge the user to use QR code
      try {
        const lowered = (errorMessage || "").toString().toLowerCase()
        if (lowered.includes("timed out") || lowered.includes("windows location services")) {
          toast({
            title: "GPS timed out",
            description: "Use the QR code option for instant check-in/check-out or try GPS again.",
            variant: "default",
            action: (
              <ToastAction onClick={() => setShowQRScanner(true)}>Open QR scanner</ToastAction>
            ),
            duration: 12000,
          })
        }
      } catch (toastErr) {
        console.error('[v0] Failed to show QR suggestion toast:', toastErr)
      }

      return null
    } finally {
      setIsLoading(false)
    }
  }

  const handleCheckIn = async () => {
    console.log("[v0] Check-in initiated")

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({
        title: "Internet connection required",
        description: "You must be online and within range for the app to authenticate and record your check-in.",
        variant: "destructive",
      })
      return
    }

    if (isCheckInProcessing) {
      console.log("[v0] Check-in already in progress - ignoring duplicate request")
      return
    }

    const now = Date.now()
    if (now - lastCheckInAttempt < 3000) {
      console.log("[v0] Check-in attempted too soon after last attempt - ignoring")
      toast({
        title: "Please Wait",
        description: "Processing your previous check-in request...",
        variant: "default",
      })
      return
    }

    if (localTodayAttendance?.check_in_time) {
      const checkInTime = new Date(localTodayAttendance.check_in_time).toLocaleTimeString()
      toast({
        title: "Already Checked In",
        description: `You checked in today at ${checkInTime}. You cannot check in twice.`,
        variant: "destructive",
        duration: 5000,
      })
      return
    }

    setIsCheckInProcessing(true)
    setLastCheckInAttempt(now)
    setRecentCheckIn(true) // Disable button immediately

    try {
      console.log("[v0] Starting check-in process...")
      setIsCheckingIn(true)
      setCheckingMessage("Processing check-in...")
      setError(null)
      setFlashMessage(null)

      const deviceInfo = getDeviceInfo()
      console.log("[v0] Device info:", deviceInfo)

      let resolvedNearestLocation = null // Declare nearestLocation here

      const checkInData: any = {
        device_info: deviceInfo,
      }

      if (userLocation) {
        checkInData.latitude = userLocation.latitude
        checkInData.longitude = userLocation.longitude
      } else {
        // Attempt to get location if not available
        const currentLocation = await getCurrentLocationData()
        if (!currentLocation) {
          throw new Error("Could not retrieve current location.")
        }
        checkInData.latitude = currentLocation.latitude
        checkInData.longitude = currentLocation.longitude
      }

      // Find nearest location based on the possibly newly acquired userLocation
      if (realTimeLocations && realTimeLocations.length > 0 && userLocation) {
        const distances = realTimeLocations
          .map((loc) => ({
            location: loc,
            distance: calculateDistance(userLocation.latitude, userLocation.longitude, loc.latitude, loc.longitude),
          }))
          .sort((a, b) => a.distance - b.distance)

        // Use device-specific proximity radius: 400m for mobile/tablet, 700m for laptop, 2000m for desktop PC
        let deviceProximityRadius = 400
        if (deviceInfo.isMobile || deviceInfo.isTablet) {
          deviceProximityRadius = 400
        } else if (deviceInfo.isLaptop) {
          deviceProximityRadius = 700
        } else {
          deviceProximityRadius = 2000 // Desktop PC
        }
        const displayRadius = 50 // Trade secret - what we show to users
        
        console.log("[v0] Check-in proximity validation:", {
          nearestLocation: distances[0]?.location.name,
          distance: distances[0]?.distance,
          deviceProximityRadius,
          deviceType: deviceInfo.device_type,
          isLaptop: deviceInfo.isLaptop,
          isWithinRange: distances.length > 0 && distances[0].distance <= deviceProximityRadius
        })

        if (distances.length > 0 && distances[0].distance <= deviceProximityRadius) {
          resolvedNearestLocation = distances[0].location
          checkInData.location_id = resolvedNearestLocation.id // Update checkInData with resolved nearest location
        } else {
          throw new Error(
            `You must be within ${displayRadius}m of a valid location to check in.`,
          )
        }
      } else {
        throw new Error("No valid locations found or location data is unavailable.")
      }

      // Check if check-in is after 9:00 AM (late arrival)
      const checkInTime = getSystemNow()
      const checkInHour = checkInTime.getHours()
      const checkInMinutes = checkInTime.getMinutes()
      const isLateArrival = checkInHour > 9 || (checkInHour === 9 && checkInMinutes > 0)
      const latenessRequired = requiresLatenessReason(checkInTime, userProfile?.departments, userProfile?.role)

      // Require lateness reason only on weekdays and for non‑security staff
      if (isLateArrival && latenessRequired) {
        console.log("[v0] Late arrival detected (weekday & not exempt) - showing reason dialog")
        setPendingCheckInData({
          location: {
            latitude: checkInData.latitude,
            longitude: checkInData.longitude,
            accuracy: 10,
          },
          nearestLocation: resolvedNearestLocation,
          qrCodeUsed: false,
          qrTimestamp: null,
        })
        setShowLatenessDialog(true)
        setIsCheckingIn(false)
        setIsCheckInProcessing(false)
        setRecentCheckIn(false)
        return
      }

      // If late but user is exempt (Security or weekend), proceed
      if (isLateArrival && !latenessRequired) {
        console.log("[v0] Late arrival detected but user is exempt (Security or weekend) — proceeding without reason prompt")
      }

      // Use extracted check-in API function
      await performCheckInAPI(
        { latitude: checkInData.latitude, longitude: checkInData.longitude, accuracy: 10 },
        resolvedNearestLocation,
        ""
      )

    } catch (error: any) {
      console.error("[v0] Check-in error:", error)
      setFlashMessage({
        message: error.message || "Failed to check in. Please try again.",
        type: "error",
      })

      setTimeout(() => {
        setRecentCheckIn(false)
      }, 3000)
    } finally {
      setIsCheckingIn(false)
      setCheckingMessage("")
      setTimeout(() => {
        setIsCheckInProcessing(false)
      }, 2000)
    }
  }

  const handleCheckInOutsidePremises = async () => {
    if (isCheckingIn || isProcessing) {
      toast({
        title: "Processing",
        description: "Please wait while your request is being processed...",
        variant: "default",
      })
      return
    }

    setIsCheckingIn(true)
    setCheckingMessage("Getting your current location...")

    try {
      const currentLocation = await getCurrentLocationData()
      if (!currentLocation) {
        throw new Error("Could not retrieve current location. Please ensure GPS is enabled.")
      }

      // Store the location and show reason dialog
      setPendingOffPremisesLocation(currentLocation)
      setOffPremisesReason("")
      setShowOffPremisesReasonDialog(true)
      setIsCheckingIn(false)
      setCheckingMessage("")
    } catch (error: any) {
      console.error("[v0] Error preparing off-premises request:", error)
      setFlashMessage({
        message: error.message || "Failed to prepare off-premises request. Please try again.",
        type: "error",
      })
      setIsCheckingIn(false)
      setCheckingMessage("")
    }
  }

  const handleSendOffPremisesRequest = async () => {
    if (!pendingOffPremisesLocation) return
    if (!offPremisesReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for your off-premises request.",
        variant: "destructive",
      })
      return
    }

    setIsCheckingIn(true)
    setCheckingMessage("Sending request to managers...")
    setShowOffPremisesReasonDialog(false)

    try {
      const currentLocation = pendingOffPremisesLocation
      let locationName = "Unknown Location"
      let locationDisplayName = ""
      const geoResult = await reverseGeocode(currentLocation.latitude, currentLocation.longitude)
      if (geoResult) {
        locationName = geoResult.address || geoResult.display_name || "Unknown Location"
        locationDisplayName = geoResult.display_name || locationName
      } else {
        locationName = `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`
        locationDisplayName = locationName
      }

      // Get current user
      const supabase = createClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      console.log("[v0] User authenticated:", { user_id: currentUser?.id })

      if (!currentUser?.id) {
        throw new Error("User not authenticated")
      }

      const payload = {
        current_location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          name: locationName,
          display_name: locationDisplayName,
        },
        device_info: getDeviceInfo(),
        user_id: currentUser.id,
        reason: offPremisesReason.trim(),
        request_type: 'checkin', // only check-in requests allowed
      }
      
      console.log("[v0] Sending off-premises check-in request:", payload)

      const response = await fetch("/api/attendance/check-in-outside-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      console.log("[v0] API response status:", response.status, response.statusText)

      let result: any = {}
      let rawBody: string | null = null
      try {
        rawBody = await response.text()
        try {
          result = rawBody ? JSON.parse(rawBody) : {}
        } catch (jsonErr) {
          console.warn("[v0] Response body not JSON, keeping raw text", jsonErr)
        }
      } catch (err) {
        console.warn("[v0] Failed to read API response body", err)
      }

      console.log("[v0] API response body:", result, "raw:", rawBody)

      if (!response.ok) {
        // prefer an explicit error string if available, fall back to raw text or status
        const errMsg = result?.error || result?.message || rawBody || `HTTP ${response.status}`
        console.error("[v0] Off-premises request failed:", {
          status: response.status,
          statusText: response.statusText,
          body: result,
          rawBody,
        })
        throw new Error(errMsg)
      }

      // safety check: API may return 200 but indicate failure or omit key fields
      if (result && (result.success === false || !result.request_id)) {
        console.error("[v0] Off-premises request not successful or missing id:", result)
        const msg = result.error || result.message || "Request was not successful"
        throw new Error(msg)
      }

      console.log("[v0] Off-premises request submitted successfully", { request_id: result.request_id })

      setFlashMessage({
        message: `Off-premises check-in request sent to your supervisor for approval. We'll notify you when the supervisor approves and your attendance will be recorded using the ORIGINAL request time and the submitted location.`,
        type: "success",
      })

        toast({
          title: "Off‑Premises Request Sent",
          description: `Your request (ID: ${result.request_id || 'N/A'}) has been sent to your approvers and is awaiting approval. You'll be notified when a decision is made.`,
          action: (
            <ToastAction asChild>
              <a href="/dashboard/notifications">View Notifications</a>
            </ToastAction>
          ),
          className: "border-emerald-400 bg-emerald-50 text-emerald-900",
        })
      // Prevent duplicate requests by disabling check-in buttons until request is resolved
      setHasPendingOffPremisesRequest(true)

      setPendingOffPremisesLocation(null)
      setOffPremisesReason("")

      // Refresh attendance status after submitting off-premises request
      // `handleRefreshStatus` was removed/renamed — call the established refetch instead.
      setTimeout(() => {
        fetchTodayAttendance()
      }, 2000)

    } catch (error: any) {
      setFlashMessage({
        message: error.message || "Failed to send confirmation request. Please try again.",
        type: "error",
      })
      toast({
        title: "Error",
        description: error.message || "Failed to send confirmation request",
        variant: "destructive",
      })
    } finally {
      setIsCheckingIn(false)
      setCheckingMessage("")
    }
  }

  const handleCheckOut = async () => {
    if (!localTodayAttendance?.check_in_time || localTodayAttendance?.check_out_time) {
      setFlashMessage({
        message:
          "You need to check in first before you can check out. Please complete your check-in to start your shift.",
        type: "info",
      })
      return
    }

    // ensure we know who is checking out
    if (!userProfile?.id) {
      console.warn("[v0] Attempting checkout without user profile")
      setFlashMessage({
        message: "Unable to identify current user. Please refresh and try again.",
        type: "error",
      })
      return
    }

    const userId = userProfile.id

    // Determine if the user started in an approved remote/off‑premises 
    setIsLoading(true)
    try {
      // OPTIMIZATION: Fetch location data ONCE and reuse everywhere
      let locationData = await getCurrentLocationData()
      if (!locationData) {
        setIsLoading(false)
        return
      }

      // If the fresh GPS reading has significantly worse accuracy than our cached
      // userLocation state (which already powered the "Within Range" badge), prefer
      // the cached reading.  This avoids the inconsistency where the badge shows
      // "Within Range" but the checkout button then fails because a new GPS poll
      // happened to return a coarse/IP-based position.
      if (
        locationData.accuracy > 1500 &&
        userLocation &&
        userLocation.accuracy < locationData.accuracy
      ) {
        console.log('[v0] handleCheckOut: fresh GPS is less accurate than cached state — using cached userLocation', {
          freshAccuracy: locationData.accuracy,
          cachedAccuracy: userLocation.accuracy,
        })
        locationData = userLocation
      }

      // Get device-specific checkout radius
      let checkOutRadius: number | undefined
      if (deviceRadiusSettings) {
        if (deviceInfo.device_type === "mobile") {
          checkOutRadius = deviceRadiusSettings.mobile.checkOut
        } else if (deviceInfo.device_type === "tablet") {
          checkOutRadius = deviceRadiusSettings.tablet.checkOut
        } else if (deviceInfo.device_type === "laptop") {
          checkOutRadius = deviceRadiusSettings.laptop.checkOut
        } else if (deviceInfo.device_type === "desktop") {
          checkOutRadius = deviceRadiusSettings.desktop.checkOut
        }
      }
      
      // OPTIMIZATION: Validate location ONCE
      let checkoutValidation = validateCheckoutLocation(locationData, realTimeLocations || [], checkOutRadius)

      // Fallback: if validation fails but the client-side nearest-location check (used by the UI badge)
      // indicates the user is within range, allow checkout. This keeps the badge and button behavior
      // consistent when device radius settings or rounding differ between helpers.
      if (!checkoutValidation.canCheckOut && realTimeLocations && realTimeLocations.length > 0) {
        try {
          const deviceInfoLocal = deviceInfo || getDeviceInfo()
          // derive proximity radius similarly to `location-preview-card` and `useDeviceRadiusSettings`
          let proximityRadius = 100
          if (deviceRadiusSettings) {
            if (deviceInfoLocal.device_type === "mobile") {
              proximityRadius = deviceRadiusSettings.mobile.checkOut
            } else if (deviceInfoLocal.device_type === "tablet") {
              proximityRadius = deviceRadiusSettings.tablet.checkOut
            } else if (deviceInfoLocal.device_type === "laptop") {
              proximityRadius = deviceRadiusSettings.laptop.checkOut
            } else if (deviceInfoLocal.device_type === "desktop") {
              proximityRadius = deviceRadiusSettings.desktop.checkOut
            }
          } else if (deviceInfoLocal.isMobile || deviceInfoLocal.isTablet) {
            proximityRadius = 400
          } else if (deviceInfoLocal.isLaptop) {
            proximityRadius = 700
          } else {
            proximityRadius = 1000
          }

          const distances = (realTimeLocations || [])
            .map((loc) => ({
              location: loc,
              distance: calculateDistance(locationData.latitude, locationData.longitude, loc.latitude, loc.longitude),
            }))
            .sort((a, b) => a.distance - b.distance)

          const nearest = distances[0]
          if (nearest && nearest.distance <= proximityRadius) {
            console.log('[v0] Fallback proximity check passed - allowing checkout based on nearest location', { nearest: nearest.location.name, distance: nearest.distance, proximityRadius })
            checkoutValidation = {
              canCheckOut: true,
              nearestLocation: nearest.location,
              distance: nearest.distance,
              message: `Allowed by fallback proximity (${proximityRadius}m)`,
            } as any
          }
        } catch (fallbackErr) {
          console.warn('[v0] Fallback proximity check failed or errored:', fallbackErr)
        }
      }

      // Check if early checkout is needed
      const now = getSystemNow()
      const checkoutHour = now.getHours()
      const checkoutMinutes = now.getMinutes()

      const assignedLocation = realTimeLocations?.find(loc => loc.id === userProfile?.assigned_location_id)
      const checkOutEndTime = assignedLocation?.check_out_end_time || "17:00"
      const requireEarlyCheckoutReason = assignedLocation?.require_early_checkout_reason ?? true
      const effectiveRequireEarlyCheckoutReason = requiresEarlyCheckoutReason(now, requireEarlyCheckoutReason, userProfile?.role, userProfile?.departments)
      // Persist effective requirement into state so the modal can relax validation on weekends
      setEarlyCheckoutReasonRequired(Boolean(effectiveRequireEarlyCheckoutReason))

      const [endHour, endMinute] = checkOutEndTime.split(":").map(Number)
      const checkoutEndTimeMinutes = endHour * 60 + (endMinute || 0)
      const currentTimeMinutes = checkoutHour * 60 + checkoutMinutes
      const isBeforeCheckoutTime = currentTimeMinutes < checkoutEndTimeMinutes

      // If the user is not inside any location, block checkout
      if (!checkoutValidation.canCheckOut) {
        setFlashMessage({
          message: "Check-out is only allowed while within range of an active registered location. Please move to a valid site and try again.",
          type: "error",
        })
        setIsLoading(false)
        return
      }

      console.log("[v0] Location validation passed - user within range")

      // Find nearest location first (reuse for both paths)
      const effectiveCheckOutRadius = checkOutRadius ?? proximitySettings.checkInProximityRange
      let nearestLocation = null
      if (realTimeLocations && realTimeLocations.length > 0) {
        if (userProfile?.assigned_location_id && assignedLocationInfo?.isAtAssignedLocation) {
          nearestLocation = realTimeLocations.find((loc) => loc.id === userProfile.assigned_location_id)
        } else {
          const locationDistances = realTimeLocations
            .map((loc) => {
              const distance = calculateDistance(
                locationData.latitude,
                locationData.longitude,
                loc.latitude,
                loc.longitude,
              )
              return { location: loc, distance: Math.round(distance) }
            })
            .sort((a, b) => a.distance - b.distance)
            .filter(({ distance }) => distance <= effectiveCheckOutRadius)

          nearestLocation = locationDistances[0]?.location
        }
      }

      // SMART LOGIC: If checkout time PASSED, no location rule, early-reason not required, user is Security, or user has worked >= 9 hours — skip modal and checkout immediately
      // This is the "one-tap" optimization - no unnecessary modal delays
      const checkInTimeForHours = localTodayAttendance && localTodayAttendance.check_in_time ? new Date(localTodayAttendance.check_in_time) : null
      const hoursSinceCheckIn = checkInTimeForHours ? (now.getTime() - checkInTimeForHours.getTime()) / (1000 * 60 * 60) : 0

      if (!isBeforeCheckoutTime || !effectiveRequireEarlyCheckoutReason || isSecurityStaff || hoursSinceCheckIn >= 9) {
        console.log("[v0] SMART CHECKOUT: Checkout time passed or no reason needed or Security staff or worked >=9 hours - immediate checkout", { hoursSinceCheckIn })
        await performCheckoutAPI(locationData, nearestLocation, "")
        return
      }

      // If checkout time is NOT reached and reason required, show modal
      // Store pending checkout data and show dialog - THEN release loading
      setPendingCheckoutData({ location: locationData, nearestLocation })
      // if we reach here the modal will be shown; clear any previous reason
      setEarlyCheckoutReason("")
      setShowEarlyCheckoutDialog(true)
      setIsLoading(false)
    } catch (error) {
      setIsLoading(false)
      setFlashMessage({
        message: error instanceof Error ? error.message : "Checkout failed. Please try again.",
        type: "error",
      })
    }
  }

  // OPTIMIZATION: Extracted checkout API call into separate function for cleaner flow
  const performCheckoutAPI = async (
    locationData: any,
    nearestLocation: any,
    reason: string,
    provedBy: string | null = null,
    autoCheckout = false,
  ) => {
    try {
      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-type": deviceInfo.device_type || "desktop",
        },
        body: JSON.stringify({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          location_source: locationData.source,
          location_name: nearestLocation?.name || "Unknown Location",
          early_checkout_reason: autoCheckout ? null : (reason || null),
          early_checkout_proved_by: autoCheckout ? null : (provedBy || null),
          auto_checkout: autoCheckout,
          auto_checkout_reason: autoCheckout ? reason : null,
        }),
      })

      const result = await response.json()

      if (result.success && result.data) {
        console.log("[v0] Checkout successful:", result.data)

        setLocalTodayAttendance(result.data)
        clearAttendanceCache()

        setRecentCheckOut(true)
        setTimeout(() => setRecentCheckOut(false), 3000)

        // Show a toast to confirm the checkout was persisted
        try {
          const checkInTime = new Date(result.data.check_in_time)
          const checkOutTime = new Date(result.data.check_out_time)
          const workHours = ((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)).toFixed(2)
          toast({
            title: autoCheckout ? "Automatic check-out recorded" : "Check-out recorded",
            description: autoCheckout
              ? `You were automatically checked out at ${result.data.check_out_location_name || nearestLocation?.name || 'your current location'} after 4:00 PM.`
              : `Checked out from ${result.data.check_out_location_name || nearestLocation?.name || 'location'}. Worked ${workHours} hours.`,
          })
        } catch (e) {
          // swallow toast errors
          console.warn('[v0] Toast error', e)
        }

        const checkInTime = new Date(result.data.check_in_time)
        const checkOutTime = new Date(result.data.check_out_time)
        const workHours = ((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)).toFixed(2)

        setFlashMessage({
          message: autoCheckout
            ? `You were automatically checked out after 4:00 PM because you were outside the approved location range. Total work hours: ${workHours} hours.`
            : `Successfully checked out from ${result.data.check_out_location_name}! Great work today. Total work hours: ${workHours} hours. See you tomorrow!`,
          type: autoCheckout ? "info" : "success",
        })

        setEarlyCheckoutReason("")
        setPendingCheckoutData(null)

        // Refetch to verify checkout was recorded
        setTimeout(() => {
          fetchTodayAttendance()
        }, 500)
      } else if (result.error) {
        throw new Error(result.error)
      } else {
        throw new Error("Invalid checkout response from server")
      }
    } catch (err) {
      console.error("[v0] Checkout error:", err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!runtimeFlags.autoCheckoutEnabled) {
      autoCheckoutAttemptedRef.current = false
      return
    }

    if (!localTodayAttendance?.check_in_time || localTodayAttendance?.check_out_time) {
      autoCheckoutAttemptedRef.current = false
      return
    }

    const attemptAutomaticCheckout = async () => {
      if (autoCheckoutAttemptedRef.current || isLoading || recentCheckOut) return

      const hoursWorked = localTodayAttendance?.check_in_time
        ? (Date.now() - new Date(localTodayAttendance.check_in_time).getTime()) / (1000 * 60 * 60)
        : 0

      const eligibleForAutoCheckout = canAutoCheckoutOutOfRange({
        now: getSystemNow(),
        hasCheckedIn: !!localTodayAttendance?.check_in_time,
        hasCheckedOut: !!localTodayAttendance?.check_out_time,
        isOutOfRange: locationValidation?.canCheckOut === false,
        isOnLeave,
        hasMetMinimumTime: hoursWorked >= 7,
        hoursWorked,
      })

      if (!eligibleForAutoCheckout) return

      autoCheckoutAttemptedRef.current = true
      setIsLoading(true)

      try {
        let locationData = await getCurrentLocationData()
        if (!locationData && userLocation) {
          locationData = userLocation
        }

        if (!locationData) {
          throw new Error("Current location unavailable for automatic checkout")
        }

        let checkOutRadius: number | undefined
        if (deviceRadiusSettings) {
          if (deviceInfo.device_type === "mobile") {
            checkOutRadius = deviceRadiusSettings.mobile.checkOut
          } else if (deviceInfo.device_type === "tablet") {
            checkOutRadius = deviceRadiusSettings.tablet.checkOut
          } else if (deviceInfo.device_type === "laptop") {
            checkOutRadius = deviceRadiusSettings.laptop.checkOut
          } else if (deviceInfo.device_type === "desktop") {
            checkOutRadius = deviceRadiusSettings.desktop.checkOut
          }
        }

        const autoValidation = validateCheckoutLocation(locationData, realTimeLocations || [], checkOutRadius)

        if (autoValidation.canCheckOut) {
          autoCheckoutAttemptedRef.current = false
          setIsLoading(false)
          return
        }

        await performCheckoutAPI(
          locationData,
          autoValidation.nearestLocation || null,
          "Automatic check-out after 4:00 PM while outside the approved location range.",
          null,
          true,
        )
      } catch (error) {
        console.warn("[v0] Automatic out-of-range checkout skipped:", error)
        autoCheckoutAttemptedRef.current = false
        setIsLoading(false)
      }
    }

    attemptAutomaticCheckout()
    const interval = setInterval(attemptAutomaticCheckout, 60000)

    return () => clearInterval(interval)
  }, [
    runtimeFlags.autoCheckoutEnabled,
    localTodayAttendance?.check_in_time,
    localTodayAttendance?.check_out_time,
    locationValidation?.canCheckOut,
    isOnLeave,
    checkoutTimeReached,
    userLocation,
    realTimeLocations,
    deviceRadiusSettings,
    deviceInfo.device_type,
    isLoading,
    recentCheckOut,
  ])

  useEffect(() => {
    if (localTodayAttendance?.check_in_time || hasPendingOffPremisesRequest || isOnLeave) {
      autoCheckInAttemptedRef.current = false
      return
    }

    const attemptAutomaticCheckIn = async () => {
      if (
        autoCheckInAttemptedRef.current ||
        isLoading ||
        isCheckingIn ||
        isProcessing ||
        recentCheckIn ||
        isCheckInProcessing ||
        !userProfile ||
        !realTimeLocations ||
        realTimeLocations.length === 0
      ) {
        return
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return
      }

      const now = getSystemNow()
      if (!canCheckInAtTime(now, userProfile?.departments, userProfile?.role)) {
        return
      }

      const isLateArrival = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0)
      const latenessRequired = requiresLatenessReason(now, userProfile?.departments, userProfile?.role)
      if (isLateArrival && latenessRequired) {
        return
      }

      try {
        let locationData = userLocation

        if (!locationData) {
          const { location } = await safeGetCurrentLocation(true)
          if (!location) return
          locationData = location
          setUserLocation(location)
        }

        let checkInRadius: number | undefined
        if (deviceRadiusSettings) {
          if (deviceInfo.device_type === "mobile") {
            checkInRadius = deviceRadiusSettings.mobile.checkIn
          } else if (deviceInfo.device_type === "tablet") {
            checkInRadius = deviceRadiusSettings.tablet.checkIn
          } else if (deviceInfo.device_type === "laptop") {
            checkInRadius = deviceRadiusSettings.laptop.checkIn
          } else if (deviceInfo.device_type === "desktop") {
            checkInRadius = deviceRadiusSettings.desktop.checkIn
          }
        }

        const validation = validateAttendanceLocation(locationData, realTimeLocations || [], checkInRadius)

        if (!validation.canCheckIn || !validation.nearestLocation) {
          return
        }

        autoCheckInAttemptedRef.current = true
        setRecentCheckIn(true)
        setIsCheckingIn(true)
        setCheckingMessage("Automatic check-in...")

        await performCheckInAPI(locationData, validation.nearestLocation, "")

        toast({
          title: "Automatic check-in recorded",
          description: `You were automatically checked in because you are online and within range of ${validation.nearestLocation.name}.`,
        })
      } catch (error) {
        console.warn("[v0] Automatic in-range check-in skipped:", error)
        autoCheckInAttemptedRef.current = false
        setRecentCheckIn(false)
      } finally {
        setIsCheckingIn(false)
        setCheckingMessage("")
      }
    }

    void attemptAutomaticCheckIn()

    const onlineHandler = () => {
      autoCheckInAttemptedRef.current = false
      void attemptAutomaticCheckIn()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", onlineHandler)
    }

    const interval = setInterval(() => {
      void attemptAutomaticCheckIn()
    }, 60000)

    return () => {
      clearInterval(interval)
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onlineHandler)
      }
    }
  }, [
    localTodayAttendance?.check_in_time,
    hasPendingOffPremisesRequest,
    isOnLeave,
    isLoading,
    isCheckingIn,
    isProcessing,
    recentCheckIn,
    isCheckInProcessing,
    userProfile,
    userLocation,
    realTimeLocations,
    deviceRadiusSettings,
    deviceInfo.device_type,
  ])

  // Extracted check-in API call for lateness dialog flow
  const performCheckInAPI = async (locationData: any, nearestLocation: any, reason: string, provedBy: string | null = null) => {
    try {
      const deviceInfo = getDeviceInfo()
      const checkInData: any = {
        device_info: deviceInfo,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy,
        location_timestamp: locationData.timestamp || Date.now(),
        location_source: locationData.source || null,
        location_id: nearestLocation?.id,
        lateness_reason: reason || null,
      }

      if (provedBy) {
        checkInData.lateness_proved_by = provedBy
      }

      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
        body: JSON.stringify(checkInData),
      })

      const result = await response.json()
      console.log("[v0] Check-in API response:", result)

      if (!response.ok) {
        // Handle completed work for the day with friendly message
        if (result.alreadyCompleted && result.details) {
          console.log("[v0] User has already completed work for today")

          setFlashMessage({
            message: `Work completed! You worked ${result.details.workHours} hours today.`,
            type: "success",
          })

          await fetchTodayAttendance()

          toast({
            title: "✓ You're Done for Today!",
            description: `You checked in at ${result.details.checkInTime} and checked out at ${result.details.checkOutTime}. You worked ${result.details.workHours} hours. Great job! See you tomorrow.`,
            className: "bg-green-50 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-200",
            duration: 10000,
          })
        } else if (result.error?.includes("DUPLICATE CHECK-IN BLOCKED") || result.error?.includes("already checked in")) {
          console.log("[v0] Duplicate check-in prevented by server - still on duty")
          setFlashMessage({
            message: result.error,
            type: "error",
          })

          await fetchTodayAttendance()

          toast({
            title: "Already Checked In",
            description: result.error,
            variant: "destructive",
            duration: 8000,
          })
        } else {
          throw new Error(result.error || "Failed to check in")
        }
        return
      }

      console.log("[v0] ✓ Check-in successful")

      if (result.attendance) {
        // Add device sharing warning to the attendance data if present
        const attendanceWithWarning = {
          ...result.attendance,
          device_sharing_warning: result.deviceSharingWarning?.message || null
        }
        setLocalTodayAttendance(attendanceWithWarning)
        // Toast confirm check-in persisted
        try {
          toast({
            title: "Check-in recorded",
            description: `Checked in at ${attendanceWithWarning.check_in_location_name || nearestLocation?.name || 'location'}`,
          })
        } catch (e) {
          console.warn('[v0] Toast error', e)
        }
      }

      setFlashMessage({
        message: result.message || "Successfully checked in!",
        type: "success",
      })

      // Refresh attendance data
      await fetchTodayAttendance()

      // Clear attendance cache
      clearAttendanceCache()

      // Show device sharing warning if applicable (highest priority)
      if (result.deviceSharingWarning) {
        toast({
          title: "⚠️ Shared Device Detected",
          description: result.deviceSharingWarning.message,
          variant: "default",
          className: "bg-yellow-50 border-yellow-400 text-yellow-900 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-200",
          duration: 10000,
        })
      }

      setLatenessReason("")
      setPendingCheckInData(null)

      // Refetch to verify check-in was recorded
      setTimeout(() => {
        fetchTodayAttendance()
      }, 500)
    } catch (err) {
      console.error("[v0] Check-in error:", err)
      throw err
    } finally {
      setIsCheckingIn(false)
      setIsCheckInProcessing(false)
      setRecentCheckIn(false)
    }
  }

  const handleEarlyCheckoutConfirm = async () => {
    const trimmedReason = earlyCheckoutReason.trim()

    // If a reason is required (weekday / policy), enforce validation.
    if (earlyCheckoutReasonRequired) {
      if (!trimmedReason) {
        setFlashMessage({
          message: "Please provide a reason for early checkout before proceeding.",
          type: "error",
        })
        return
      }

      if (trimmedReason.length < 10) {
        setFlashMessage({
          message: "Early checkout reason must be at least 10 characters long. Please provide more details.",
          type: "error",
        })
        return
      }
    }

    const prover = earlyCheckoutProvedBy.trim()

    setShowEarlyCheckoutDialog(false)
    setIsLoading(true)

    try {
      const { location, nearestLocation } = pendingCheckoutData

      // Use optimized checkout function with reason and prover
      await performCheckoutAPI(location, nearestLocation, earlyCheckoutReason, prover || null)
    } catch (error) {
      console.error("[v0] Early checkout error:", error)
      setFlashMessage({
        message: error instanceof Error ? error.message : "Failed to check out. Please try again.",
        type: "error",
      })
    }
  }
  
  const handleEarlyCheckoutCancel = () => {
    // Close the early checkout dialog and reset related state
    setShowEarlyCheckoutDialog(false)
    setEarlyCheckoutReason("")
    setEarlyCheckoutProvedBy("")
    setPendingCheckoutData(null)
    setIsLoading(false)
  }
  const handleLatenessConfirm = async () => {
    const trimmedReason = latenessReason.trim()
    
    if (!trimmedReason) {
      setFlashMessage({
        message: "Please provide a reason for your late arrival before proceeding.",
        type: "error",
      })
      return
    }
    
    if (trimmedReason.length < 10) {
      setFlashMessage({
        message: "Lateness reason must be at least 10 characters long. Please provide more details.",
        type: "error",
      })
      return
    }

    const latenessProver = latenessProvedBy.trim()

    setShowLatenessDialog(false)
    setIsCheckingIn(true)

    try {
      const { location, nearestLocation } = pendingCheckInData

      // Use optimized check-in function with reason and prover
      await performCheckInAPI(location, nearestLocation, latenessReason, latenessProver || null)
    } catch (error) {
      console.error("[v0] Late check-in error:", error)
      setFlashMessage({
        message: error instanceof Error ? error.message : "Failed to check in. Please try again.",
        type: "error",
      })
    }
  }

  const handleLatenessCancel = () => {
    setShowLatenessDialog(false)
    setLatenessReason("")
    setLatenessProvedBy("")
    setPendingCheckInData(null)
    setIsCheckingIn(false)
    setIsCheckInProcessing(false)
    setRecentCheckIn(false)
  }

  const getFormattedCheckoutTime = () => {
    const assignedLoc = realTimeLocations?.find(loc => loc.id === userProfile?.assigned_location_id)
    const checkOutTime = assignedLoc?.check_out_end_time || "17:00"
    const [hours, minutes] = checkOutTime.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    const formattedTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
    const locationName = assignedLoc?.name || "your location"
    return `You are checking out before the standard ${formattedTime} end time for ${locationName}`
  }

  const handleRefreshLocations = async () => {
    setIsLoading(true)
    setError(null)
    try {
      console.log("[v0] Manually refreshing location...")
      const { location, error: locationError } = await safeGetCurrentLocation()

      if (!location) {
        const errorMessage = locationError?.message || "Unable to access location. Please enable GPS or use QR code option."
        console.warn("[v0] Failed to refresh location:", errorMessage)
        setError(errorMessage)
        setLocationPermissionStatus({ granted: false, message: errorMessage })
        setLocationPermissionStatusSimplified({ granted: false, message: errorMessage })
        setShowLocationHelp(true)
        return
      }

      setUserLocation(location)

      if (location.accuracy > 1000) {
        setError(
          `GPS accuracy is critically poor (${(location.accuracy / 1000).toFixed(1)}km) - Use QR code for reliable attendance.`,
        )
      } else if (location.accuracy > 500) {
        setError(`GPS accuracy is poor (${Math.round(location.accuracy)}m). Consider using QR code for best results.`)
      } else {
        setSuccess(`Location refreshed successfully. Accuracy: ${Math.round(location.accuracy)}m`)
        setTimeout(() => setSuccess(null), 3000)
      }

      setLocationPermissionStatus({ granted: true, message: "Location access granted" })
      setLocationPermissionStatusSimplified({ granted: true, message: "Location access granted" })
      console.log("[v0] Location refreshed successfully")
    } catch (error) {
      console.error("[v0] Failed to refresh location:", error)
      const errorMessage =
        error instanceof Error ? error.message : "Unable to access location. Please enable GPS or use QR code option."
      setError(errorMessage)
      setLocationPermissionStatus({ granted: false, message: errorMessage })
      setLocationPermissionStatusSimplified({ granted: false, message: errorMessage })
      setShowLocationHelp(true)
    } finally {
      setIsLoading(false)
    }
  }

  const checkInDate = localTodayAttendance?.check_in_time
    ? new Date(localTodayAttendance.check_in_time).toISOString().split("T")[0]
    : null

  const isFromPreviousDay = checkInDate && checkInDate !== currentDate

  const isCheckedIn = localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time && !isFromPreviousDay
  const isCheckedOut = localTodayAttendance?.check_out_time
  const isCompletedForDay =
    localTodayAttendance?.check_in_time && localTodayAttendance?.check_out_time && !isFromPreviousDay

  const defaultMode = canCheckInButton ? "checkin" : canCheckOutButton ? "checkout" : null

  const handleLocationSelect = (location: GeofenceLocation) => {
    console.log("Location selected:", location.name)
    // Logic to handle location selection, e.g., pre-filling a form or triggering an action
  }

  return (
    <div className={cn("space-y-6", className)}>
      {flashMessage && (
        <Card className={cn("mb-4", flashMessage?.type === 'success' ? 'border-l-4 border-l-green-500 bg-green-50 dark:bg-green-900/60 dark:border-green-500/50' : flashMessage?.type === 'error' ? 'border-l-4 border-l-rose-500 bg-rose-50 dark:bg-rose-900/60 dark:border-rose-500/50' : flashMessage?.type === 'warning' ? 'border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/60 dark:border-amber-500/50' : 'border-l-4 border-l-slate-400 bg-slate-50') }>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("flex-shrink-0 rounded-full p-2", flashMessage?.type === 'success' ? 'bg-green-100 dark:bg-green-800/60' : flashMessage?.type === 'error' ? 'bg-rose-100 dark:bg-rose-800/60' : flashMessage?.type === 'warning' ? 'bg-amber-100 dark:bg-amber-800/60' : 'bg-slate-100') }>
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-300" />
                </div>
                <div className="flex-1">
                  <div className="space-y-1">
                    <p className={cn("text-sm font-medium", flashMessage?.type === 'success' ? 'text-green-900 dark:text-green-100' : flashMessage?.type === 'error' ? 'text-rose-900 dark:text-rose-100' : flashMessage?.type === 'warning' ? 'text-amber-800 dark:text-amber-100' : 'text-slate-800') }>
                      {flashMessage?.type === 'success' ? 'Success' : flashMessage?.type === 'error' ? 'Error' : flashMessage?.type === 'warning' ? 'Notice' : 'Info'}
                    </p>
                    <p className={cn("text-xs", flashMessage?.type === 'success' ? 'text-green-800 dark:text-green-100' : flashMessage?.type === 'error' ? 'text-rose-800 dark:text-rose-100' : flashMessage?.type === 'warning' ? 'text-amber-700 dark:text-amber-200' : 'text-slate-700') }>{flashMessage?.message}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
      )}

      {hasPendingOffPremisesRequest && !localTodayAttendance?.check_in_time && (
        <Alert className="mb-4 bg-amber-50 border-amber-200">
          <AlertTitle className="text-amber-800">Off‑Premises Request Pending</AlertTitle>
          <AlertDescription className="text-amber-700">
            Your request has been submitted successfully. You have sent an off‑premises check‑in request for today. Please wait for your supervisor to review and approve it. You will not be able to submit another request until a decision has been made.
          </AlertDescription>
        </Alert>
      )}

      {isCompletedForDay && (
        <div className="rounded-lg border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-950/30 dark:via-green-950/30 dark:to-teal-950/30 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">✅ Attendance Complete!</h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                Your work session has been successfully recorded
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/60 dark:bg-black/30 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
            <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Check-In Time</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {new Date(localTodayAttendance.check_in_time).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                📍 {localTodayAttendance.check_in_location_name}
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Check-Out Time</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {new Date(localTodayAttendance.check_out_time).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                📍 {localTodayAttendance.check_out_location_name}
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Work Hours</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {localTodayAttendance.work_hours?.toFixed(2) || "0.00"} hours
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Completed for Today</p>
            </div>
          </div>

          {refreshTimer !== null && refreshTimer > 0 && (
            <div className="mt-4 text-center text-sm text-emerald-700 dark:text-emerald-300">
              Status will refresh in {Math.floor(refreshTimer / 60)}:{(refreshTimer % 60).toString().padStart(2, "0")}
            </div>
          )}

          <div className="mt-4 text-center">
            <p className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
              🎉 Great work today! Your attendance has been successfully recorded.
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              You can view your full attendance history in the reports section.
            </p>
          </div>
        </div>
      )}

      {(localTodayAttendance as any)?.device_sharing_warning && (
        <Alert className="bg-yellow-50 border-yellow-400 dark:bg-yellow-900/60 dark:border-yellow-500/50 mb-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-100 font-semibold">
            ⚠️ Shared Device Detected
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-200">
            {(localTodayAttendance as any).device_sharing_warning}
          </AlertDescription>
        </Alert>
      )}


      {/* Time Restriction Warning */}
      {timeRestrictionWarning && (
        <Alert className="bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-500/30">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-red-800 dark:text-red-200 font-semibold">
            {timeRestrictionWarning.type === 'checkin' ? 'Check-In Window Closed' : 'Check-Out Window Closed'}
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300">
            {timeRestrictionWarning.type === 'checkin' 
              ? `Regular check-in is only allowed before ${getCheckInDeadline()}. If you are on official duty outside your registered location, click "Check In Outside Premises" to request manager confirmation.`
              : `Check-out is only allowed before ${getCheckOutDeadline()}. If you need to check out after this time, contact your manager.`
            }
            <br />
            <small className="text-red-600 dark:text-red-400 mt-2 block">
              Please use the "Check In Outside Premises" button to request manager confirmation if you are working outside your registered location.
            </small>
          </AlertDescription>
        </Alert>
      )}

      {/* Actions Section */}
      {!isCompletedForDay && (
        <Card className={cn("w-full", className)}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time
                    ? "Today's Attendance"
                    : localTodayAttendance?.check_out_time
                      ? "Attendance Complete"
                      : "Today's Attendance"}
                </CardTitle>
                <CardDescription>Record your check-in and check-out for today</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Active Session Timer - Show when checked in but not checked out */}
            {localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time && (
              (() => {
                const checkInLocationData = realTimeLocations?.find(
                  (loc) => loc.id === localTodayAttendance.check_in_location_id
                )
                // Consider them off-premises only while still out of range; once locationValidation allows checkout we revert to normal
                return (
                  <ActiveSessionTimer
                    checkInTime={localTodayAttendance.check_in_time}
                    checkInLocation={checkInLocationData?.name || "Unknown Location"}
                    checkOutLocation={assignedLocationInfo?.name}
                    minimumWorkMinutes={120}
                    locationCheckInTime={checkInLocationData?.check_in_start_time}
                    locationCheckOutTime={checkInLocationData?.check_out_end_time}
                    onCheckOut={handleCheckOut}
                    canCheckOut={locationValidation?.canCheckOut}
                    isCheckingOut={isLoading}
                    userDepartment={userProfile?.departments}
                    userRole={userProfile?.role}
                  />
                )
              })()
            )}

            {/* Check-in/Check-out Buttons */}
            <div className="space-y-4">
              {!localTodayAttendance?.check_in_time && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Regular Check In Button - Shows when inside geofence OR during check-in window */}
                    <Button
                      onClick={handleCheckIn}
                      disabled={
                        !locationValidation?.canCheckIn || isCheckingIn || isProcessing || recentCheckIn || isLoading || !canCheckInAtTime(getSystemNow(), userProfile?.departments, userProfile?.role) || hasPendingOffPremisesRequest
                      }
                      className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                      size="lg"
                      title={!canCheckInAtTime(getSystemNow(), userProfile?.departments, userProfile?.role) ? `Check-in only allowed before ${getCheckInDeadline()}` : "Check in to your assigned location"}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative z-10 flex items-center justify-center w-full">
                        {isCheckingIn ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            {checkingMessage || "Checking In..."}
                          </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-5 w-5" />
                        Check In
                      </>
                    )}
                      </div>
                    </Button>
                    
                    {/* Check In Outside Premises Button - Show when:
                        1. User is NOT within registered location geofence AND
                        2. User hasn't checked in yet */}
                    {(() => {
                      const shouldShow = !locationValidation?.canCheckIn && !localTodayAttendance?.check_in_time
                      console.log("[v0] Check outside premises button visibility:", {
                        locationValidation_canCheckIn: locationValidation?.canCheckIn,
                        has_check_in_time: !!localTodayAttendance?.check_in_time,
                        shouldShow
                      })
                      return shouldShow
                    })() && (
                      <Button
                        onClick={handleCheckInOutsidePremises}
                        disabled={isCheckingIn || isProcessing || hasPendingOffPremisesRequest}
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950"
                        size="lg"
                      >
                        {isCheckingIn ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Requesting...
                          </>
                        ) : (
                          <>
                            <MapPin className="mr-2 h-5 w-5" />
                            Check In Outside Premises
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showOffPremisesReasonDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600">
                <MapPin className="h-5 w-5" />
                Off-Premises Request
              </CardTitle>
              <CardDescription>
                Please provide a reason for your off-premises check-in request.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800">Required Information</AlertTitle>
                <AlertDescription className="text-blue-700">
                  Your reason will be reviewed by your department head, regional manager, and admin staff for approval.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="offpremises-reason">Reason for Off-Premises Request *</Label>
                <textarea
                  id="offpremises-reason"
                  value={offPremisesReason}
                  onChange={(e) => setOffPremisesReason(e.target.value)}
                  placeholder="e.g., Client meeting, field assignment, official business, training session..."
                  className="w-full min-h-[100px] p-3 border rounded-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={500}
                />
                <p className={`text-xs ${offPremisesReason.length < 10 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {offPremisesReason.length}/500 characters (minimum 10 required)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowOffPremisesReasonDialog(false)
                    setPendingOffPremisesLocation(null)
                    setOffPremisesReason("")
                  }}
                  variant="outline"
                  className="flex-1 bg-transparent"
                  disabled={isCheckingIn}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendOffPremisesRequest}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={isCheckingIn || offPremisesReason.trim().length < 10}
                >
                  {isCheckingIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Request"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

{/* Checkout actions/warnings for active session (ActiveSessionTimer handles the CTA) */}
            {localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time && (
              <>
                {/* Transfer warning messages here so we don't duplicate the CTA button (ActiveSessionTimer shows the 'Check Out Now' button). */}
                {!checkoutTimeReached && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center">
                    Minimum 2 hours required between check-in and check-out. {minutesUntilCheckout} minutes remaining.
                  </p>
                )}

                {checkoutTimeReached && !locationValidation?.canCheckOut && (
                    <p className="text-xs text-green-700 mt-2 text-center">
                      You are outside the approved location range. If you remain out of range after 4:00 PM and have worked at least 7 hours, the system will check you out automatically.
                    </p>
                )}
              </>
            )}

      {/* Refresh Status Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Button
              onClick={handleRefreshLocations}
              variant="secondary"
              size="lg"
              className="w-full h-12 md:h-14"
              disabled={isLoading || isCheckingIn}
            >
              <RefreshCw className={`h-5 w-5 md:h-6 md:w-6 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh Attendance Status
            </Button>
            <p className="text-xs md:text-sm text-muted-foreground text-center">
              Click to manually update your attendance status if the buttons don't change after check-in/check-out
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Device & Activity Summary</CardTitle>
          <p className="text-sm text-muted-foreground">Current device and recent attendance history</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Device Information */}
          <div className="rounded-lg border bg-muted/30 p-4 md:p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Laptop className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Current Device</h3>
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                    Active
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Device Type</p>
                    <p className="text-sm font-medium">{deviceInfo.device_type || 'Desktop'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Device Name</p>
                    <p className="text-sm font-medium">{deviceInfo.device_name || 'Windows PC'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">MAC Address</p>
                    <p className="text-sm font-mono text-xs">{deviceInfo.device_id || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Browser</p>
                    <p className="text-sm font-medium truncate">{deviceInfo.browser_info?.split(' ')[0] || 'Unknown'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity History (Last 2 Days) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Recent Activity</h3>
              <Badge variant="secondary" className="text-xs">Last 2 Days</Badge>
            </div>
            
            <DeviceActivityHistory userId={userProfile?.id} />
          </div>
        </CardContent>
      </Card>

      {showCodeEntry && (
        <LocationCodeDialog
          open={showCodeEntry}
          onClose={() => setShowCodeEntry(false)}
          locations={realTimeLocations || []}
          userLocation={userLocation}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          canCheckIn={canCheckInButton}
          canCheckOut={canCheckOutButton}
          isCheckedIn={isCheckedIn}
        />
      )}

      {showLocationCodeDialog && (
        <LocationCodeDialog
          open={showLocationCodeDialog}
          onClose={() => setShowLocationCodeDialog(false)}
          locations={realTimeLocations || []}
          userLocation={userLocation}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          canCheckIn={canCheckInButton}
          canCheckOut={canCheckOutButton}
          isCheckedIn={isCheckedIn}
        />
      )}

      {showScanner && (
        <QRScannerDialog
          open={showScanner}
          onClose={() => setShowScanner(false)}
          mode={defaultMode}
          userLocation={userLocation}
        />
      )}

      {showEarlyCheckoutDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
                Early Check-Out Notice
              </CardTitle>
            <CardDescription>
              {getFormattedCheckoutTime()}{earlyCheckoutReasonRequired ? " Please provide a reason." : ""}
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {earlyCheckoutReasonRequired && (
                <Alert className="border-orange-200 bg-orange-50">
                  <Info className="h-4 w-4 text-orange-600" />
                  <AlertTitle className="text-orange-800">Important</AlertTitle>
                  <AlertDescription className="text-orange-700">
                    Your reason will be visible to your department head, supervisor, and HR portal for review.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="early-checkout-reason">Reason for Early Checkout {earlyCheckoutReasonRequired ? '*' : '(optional)'} </Label>
                <textarea
                  id="early-checkout-reason"
                  value={earlyCheckoutReason}
                  onChange={(e) => setEarlyCheckoutReason(e.target.value)}
                  placeholder="e.g., Medical appointment, family emergency, approved leave..."
                  className="w-full min-h-[100px] p-3 border rounded-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={500}
                />
                <p className={`text-xs ${earlyCheckoutReasonRequired && earlyCheckoutReason.length < 10 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {earlyCheckoutReason.length}/500 characters {earlyCheckoutReasonRequired ? '(minimum 10 required)' : '(optional)'}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleEarlyCheckoutCancel}
                  variant="outline"
                  className="flex-1 bg-transparent"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEarlyCheckoutConfirm}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={isLoading || (earlyCheckoutReasonRequired && earlyCheckoutReason.trim().length < 10)}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Confirm Check-Out"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showLatenessDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <Clock className="h-5 w-5" />
                Late Arrival Notice
              </CardTitle>
            <CardDescription>
              You are checking in after 9:00 AM. Please provide a reason for your late arrival.
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50">
                <Info className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-800">Important</AlertTitle>
                <AlertDescription className="text-orange-700">
                  Your reason will be visible to your department head, supervisor, and HR portal for review.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="lateness-reason">Reason for Late Arrival *</Label>
                <textarea
                  id="lateness-reason"
                  value={latenessReason}
                  onChange={(e) => setLatenessReason(e.target.value)}
                  placeholder="e.g., Traffic congestion, medical appointment, family emergency..."
                  className="w-full min-h-[100px] p-3 border rounded-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={500}
                />
                <p className={`text-xs ${latenessReason.length < 10 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {latenessReason.length}/500 characters (minimum 10 required)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleLatenessCancel}
                  variant="outline"
                  className="flex-1 bg-transparent"
                  disabled={isCheckingIn}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleLatenessConfirm}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={isCheckingIn || latenessReason.trim().length < 10}
                >
                  {isCheckingIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Confirm Check-In"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* GPS Location Required badge moved to bottom */}
      {!locationPermissionStatusSimplified.granted && !isCompletedForDay && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-500/50 mt-8">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-100">
              <AlertTriangle className="h-5 w-5" />
              GPS Location Required
            </CardTitle>
            <CardDescription className="text-yellow-700 dark:text-yellow-200">
              {locationPermissionStatusSimplified.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={getCurrentLocationData}
              disabled={isLoading || isCheckingIn}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
              size="lg"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Getting Location...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-5 w-5" />
                  Get Current Location
                </>
              )}
            </Button>
            <p className="text-xs text-yellow-600 dark:text-yellow-300 mt-2 text-center">
              Allow location access when prompted by your browser
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
