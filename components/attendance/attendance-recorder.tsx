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
  clearGeolocationCache,
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
import { requiresLatenessReason, requiresEarlyCheckoutReason, canCheckInAtTime, canCheckOutAtTime, canAutoCheckoutOutOfRange, getCheckInDeadline, getCheckOutDeadline, isSecurityDept, isOperationalDept, isTransportDept, isExemptFromAttendanceReasons } from "@/lib/attendance-utils"
import { DeviceActivityHistory } from "@/components/attendance/device-activity-history"
import { ActiveSessionTimer } from "@/components/attendance/active-session-timer"
import {
  getPasswordEnforcementMessage,
  isPasswordChangeRequired,
} from "@/lib/security"
import { DEFAULT_RUNTIME_FLAGS, type RuntimeFlags } from "@/lib/runtime-flags"
import { clearLocationCache as clearFastLocationCache } from "@/lib/geolocation-fast"

const DEVICE_SHARING_WARNING_STORAGE_KEY = "qcc_pending_device_sharing_warning"

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
  previewRangeResolved?: boolean
  previewInRange?: boolean | null
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
  previewRangeResolved = false,
  previewInRange = null,
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

  // Off-premises CHECKOUT state (separate from check-in off-premises flow)
  const [showOffPremisesCheckoutDialog, setShowOffPremisesCheckoutDialog] = useState(false)
  const [offPremisesCheckoutReason, setOffPremisesCheckoutReason] = useState("")
  const [pendingOffPremisesCheckoutData, setPendingOffPremisesCheckoutData] = useState<{ location: any; nearestLocation: any } | null>(null)
  // Track when user went off-grid (out of all registered locations after check-in)
  const [offGridSince, setOffGridSince] = useState<Date | null>(null)

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
  // Keep a ref always in sync so async closures see the latest value
  useEffect(() => { localTodayAttendanceRef.current = localTodayAttendance }, [localTodayAttendance])
  const [pendingDeviceSharingWarning, setPendingDeviceSharingWarning] = useState<string | null>(null)
  const serverClockRef = useRef<{ baseServerMs: number; basePerfMs: number } | null>(null)
  const [, setSystemClockTick] = useState(0)
  const autoCheckoutAttemptedRef = useRef(false)
  const autoCheckInAttemptedRef = useRef(false)
  const localTodayAttendanceRef = useRef(initialTodayAttendance)
  const [autoCheckInFailureCount, setAutoCheckInFailureCount] = useState(0)

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

  const clearPendingDeviceSharingWarning = useCallback(() => {
    setPendingDeviceSharingWarning(null)

    try {
      window.sessionStorage.removeItem(DEVICE_SHARING_WARNING_STORAGE_KEY)
    } catch {
      // Ignore storage failures and continue attendance flow.
    }
  }, [])

  useEffect(() => {
    void loadRuntimeFlags()
    const id = setInterval(() => {
      void loadRuntimeFlags()
    }, 60_000)

    return () => clearInterval(id)
  }, [loadRuntimeFlags])

  useEffect(() => {
    if (localTodayAttendance?.check_in_time) {
      clearPendingDeviceSharingWarning()
      return
    }

    try {
      const storedWarning = window.sessionStorage.getItem(DEVICE_SHARING_WARNING_STORAGE_KEY)
      setPendingDeviceSharingWarning(storedWarning || null)
    } catch {
      setPendingDeviceSharingWarning(null)
    }
  }, [clearPendingDeviceSharingWarning, localTodayAttendance?.check_in_time])

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
    const attendanceTimeConfig = {
      latenessReasonDeadline: runtimeFlags.latenessReasonDeadline,
      checkoutCutoffTime: runtimeFlags.checkoutCutoffTime,
      exemptPrivilegedRolesFromReason: runtimeFlags.exemptPrivilegedRolesFromReason,
    }
    const canCheckOut = canCheckOutAtTime(now, userDept, userRole, attendanceTimeConfig)

    if (!canCheckIn && !localTodayAttendance?.check_in_time) {
      setTimeRestrictionWarning({
        type: 'checkin',
        message: `Check-in is only allowed before ${getCheckInDeadline()}. Your department does not have exemptions for late check-ins.`
      })
    } else if (!canCheckOut && localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time) {
      setTimeRestrictionWarning({
        type: 'checkout',
        message: `Check-out is only allowed before ${getCheckOutDeadline(attendanceTimeConfig)}. Your department does not have exemptions for late check-outs.`
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

  const handleManualCheckInSuccess = async () => {
    setAutoCheckInFailureCount(0)
    setShowLocationCodeDialog(false)
    await fetchTodayAttendance()
    setFlashMessage({
      message: "Manual check-in recorded successfully.",
      type: "success",
    })
  }



  // SMART LEAVE HANDLING: Disable check-in/check-out when user is on leave
  // Note: 'active' means working/at post, 'on_leave' or 'sick_leave' means actually on leave
  const isOnLeave = userLeaveStatus === "on_leave" || userLeaveStatus === "sick_leave"
  
  // Default canCheckIn to true if not explicitly set, allowing staff to check in any time after midnight
  // MUST also verify user is within proximity range (matches checkout validation logic)
  // Out-of-range users must use the off-premises flow regardless of role/department.
  const canCheckInButton =
    (initialCanCheckIn ?? true) &&
    !recentCheckIn &&
    !localTodayAttendance?.check_in_time &&
    !isOnLeave &&
    (locationValidation?.canCheckIn === true ||
      (locationValidation === null && previewRangeResolved && previewInRange === true))
  const effectiveCanCheckIn =
    locationValidation?.canCheckIn ??
    (previewRangeResolved && typeof previewInRange === "boolean" ? previewInRange : undefined)
  // On first load, keep both check-in choices visible until range state is resolved.
  const isResolvingCheckInRange = typeof effectiveCanCheckIn !== "boolean"
  const showRegularCheckInButton = isResolvingCheckInRange || effectiveCanCheckIn === true
  const showOffPremisesCheckInButton = isResolvingCheckInRange || effectiveCanCheckIn === false
  const manualCheckInFallbackEnabled = !localTodayAttendance?.check_in_time && autoCheckInFailureCount > 0
  
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
      const errorMessage = error?.message || "Failed to check in with QR code"
      setError(errorMessage)

      toast({
        title: "Check-in Failed",
        description: errorMessage,
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

      clearAttendanceCache()
      clearGeolocationCache()
      clearFastLocationCache()
      setUserLocation(null)
      setLocationValidation(null)
      setSuccess("✓ Checked out successfully with QR code!")
      console.log("[v0] QR check-out successful")

      // mutate() // Assuming mutate is a function from SWR or similar, not defined here, so commented out.

      // Show success popup
      setTimeout(() => {
        setSuccess(null)
      }, 5000)
    } catch (error: any) {
      console.error("[v0] QR check-out error:", error)
      const errorMessage = error?.message || "Failed to check out with QR code"
      setError(errorMessage)

      toast({
        title: "Check-out Failed",
        description: errorMessage,
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

  useEffect(() => {
    const hasActiveSession = !!localTodayAttendance?.check_in_time && !localTodayAttendance?.check_out_time
    if (!hasActiveSession) {
      setOffGridSince(null)
      return
    }

    if (!locationValidation?.canCheckOut) {
      setOffGridSince((prev) => prev ?? getSystemNow())
      return
    }

    setOffGridSince(null)
  }, [locationValidation?.canCheckOut, localTodayAttendance?.check_in_time, localTodayAttendance?.check_out_time, getSystemNow])

  useEffect(() => {
    const clearLocationState = async () => {
      clearGeolocationCache()
      clearFastLocationCache()
      setDetectedLocationName(null)
      setUserLocation(null)

      try {
        const { location } = await safeGetCurrentLocation(false)
        if (location) {
          setUserLocation(location)
          setLocationPermissionStatus({ granted: true, message: "Location refreshed automatically" })
          setLocationPermissionStatusSimplified({ granted: true, message: "Location refreshed automatically" })
        }
      } catch (error) {
        console.warn("[v0] Automatic 30-minute location refresh failed:", error)
      }
    }

    const interval = setInterval(() => {
      void clearLocationState()
    }, 30 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

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
        canCheckIn: validation.canCheckIn,
        canCheckOut: checkoutValidation.canCheckOut,
        allLocations: locationDistances,
        criticalAccuracyIssue,
        accuracyWarning,
      })
    }
  }, [userLocation, realTimeLocations, proximitySettings, windowsCapabilities, deviceRadiusSettings, userProfile])

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

  const inferFailureReason = (message: string) => {
    const lowered = (message || "").toLowerCase()
    if (lowered.includes("within") && lowered.includes("location")) return "out_of_range"
    if (lowered.includes("could not retrieve current location") || lowered.includes("gps")) return "location_unavailable"
    if (lowered.includes("unauthorized") || lowered.includes("session expired")) return "auth_error"
    if (lowered.includes("already checked in") || lowered.includes("duplicate")) return "duplicate_attempt"
    if (lowered.includes("pending")) return "pending_request_exists"
    if (lowered.includes("time") || lowered.includes("deadline")) return "time_restriction"
    return "unknown"
  }

  const logCheckinFailure = async (params: {
    attemptType: "manual_checkin" | "offpremises_checkin"
    failureMessage: string
    latitude?: number | null
    longitude?: number | null
    accuracy?: number | null
    nearestLocationName?: string | null
    nearestLocationDistanceM?: number | null
  }) => {
    try {
      await fetch("/api/attendance/checkin-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          failureReason: inferFailureReason(params.failureMessage),
          deviceType: getDeviceInfo()?.device_type || null,
          deviceInfo: getDeviceInfo(),
        }),
      })
    } catch (logErr) {
      console.warn("[v0] Failed to log check-in failure event:", logErr)
    }
  }

  const handleCheckIn = async () => {
    console.log("[v0] Check-in initiated")
    let resolvedNearestLocation: any = null
    let effectiveLocation: LocationData | null = userLocation
    const checkInData: any = {}

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

      checkInData.device_info = deviceInfo

      // Always attempt a fresh GPS reading, but keep the cached reading when the fresh one
      // is significantly less accurate to avoid false out-of-range errors.
      const currentLocation = await getCurrentLocationData()
      if (currentLocation) {
        if (
          currentLocation.accuracy > 1500 &&
          userLocation &&
          userLocation.accuracy < currentLocation.accuracy
        ) {
          console.log("[v0] handleCheckIn: fresh GPS is less accurate than cached state - using cached userLocation", {
            freshAccuracy: currentLocation.accuracy,
            cachedAccuracy: userLocation.accuracy,
          })
          effectiveLocation = userLocation
        } else {
          effectiveLocation = currentLocation
        }
      }

      if (!effectiveLocation) {
        throw new Error("Could not retrieve current location.")
      }

      checkInData.latitude = effectiveLocation.latitude
      checkInData.longitude = effectiveLocation.longitude

      // Reuse the same shared validator that powers the live badge/button so the click action
      // cannot disagree with the on-screen "Within Range" state.
      if (realTimeLocations && realTimeLocations.length > 0) {
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

        const liveValidation = validateAttendanceLocation(
          effectiveLocation,
          realTimeLocations,
          proximitySettings,
          checkInRadius,
        )

        const sharedValidationAllowsCheckIn =
          locationValidation?.canCheckIn === true && !!locationValidation?.nearestLocation

        const effectiveValidation = sharedValidationAllowsCheckIn
          ? {
              ...liveValidation,
              canCheckIn: true,
              nearestLocation: locationValidation?.nearestLocation || liveValidation.nearestLocation,
              distance: locationValidation?.distance ?? liveValidation.distance,
              message: locationValidation?.message || liveValidation.message,
            }
          : liveValidation

        console.log("[v0] Check-in proximity validation:", {
          liveNearestLocation: liveValidation.nearestLocation?.name,
          liveDistance: liveValidation.distance,
          liveCanCheckIn: liveValidation.canCheckIn,
          sharedCanCheckIn: locationValidation?.canCheckIn,
          sharedNearestLocation: locationValidation?.nearestLocation?.name,
          sharedDistance: locationValidation?.distance,
          usingSharedValidation: sharedValidationAllowsCheckIn,
        })

        if (effectiveValidation.canCheckIn && effectiveValidation.nearestLocation) {
          resolvedNearestLocation = effectiveValidation.nearestLocation
          checkInData.location_id = resolvedNearestLocation.id
        } else {
          // Capture nearest location for failure logging even when out of range
          resolvedNearestLocation = effectiveValidation.nearestLocation ?? liveValidation.nearestLocation ?? null
          throw new Error("You must be within 100m of a valid location to check in.")
        }
      } else {
        const sharedValidationAllowsCheckIn =
          locationValidation?.canCheckIn === true && !!locationValidation?.nearestLocation

        if (sharedValidationAllowsCheckIn) {
          resolvedNearestLocation = locationValidation.nearestLocation
          checkInData.location_id = resolvedNearestLocation.id
          console.warn("[v0] realTimeLocations unavailable in handleCheckIn; using shared validation fallback")
        } else {
          throw new Error("Location list is still loading or unavailable. Please tap Refresh Attendance Status and try again.")
        }
      }

      // Check if check-in is after 9:00 AM (late arrival)
      const checkInTime = getSystemNow()
      const latenessRequired = requiresLatenessReason(checkInTime, userProfile?.departments, userProfile?.role, {
        latenessReasonDeadline: runtimeFlags.latenessReasonDeadline,
        exemptPrivilegedRolesFromReason: runtimeFlags.exemptPrivilegedRolesFromReason,
      })
      const [dlHour, dlMin] = (runtimeFlags.latenessReasonDeadline ?? "09:00").split(":").map(Number)
      const isLateArrival = checkInTime.getHours() > dlHour || (checkInTime.getHours() === dlHour && checkInTime.getMinutes() >= dlMin)

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
      const errorMessage = error?.message || "Failed to check in. Please try again."
      void logCheckinFailure({
        attemptType: "manual_checkin",
        failureMessage: errorMessage,
        latitude: checkInData?.latitude ?? effectiveLocation?.latitude ?? null,
        longitude: checkInData?.longitude ?? effectiveLocation?.longitude ?? null,
        accuracy: effectiveLocation?.accuracy ?? null,
        nearestLocationName: resolvedNearestLocation?.name ?? null,
        nearestLocationDistanceM:
          resolvedNearestLocation && effectiveLocation
            ? calculateDistance(
                effectiveLocation.latitude,
                effectiveLocation.longitude,
                resolvedNearestLocation.latitude,
                resolvedNearestLocation.longitude,
              )
            : null,
      })
      setFlashMessage({
        message: errorMessage,
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
      const errorMessage = error?.message || "Failed to prepare off-premises request. Please try again."
      setFlashMessage({
        message: errorMessage,
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

      // Check auth FIRST before any slow network calls
      const supabase = createClient()
      let currentUser: any = null

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        currentUser = user
      } catch (getUserError) {
        console.warn("[v0] getUser() failed during off-premises check-in:", getUserError)
      }

      if (!currentUser?.id) {
        try {
          const {
            data: { user: refreshedUser },
            error: refreshError,
          } = await supabase.auth.refreshSession()
          if (refreshError) {
            console.warn("[v0] refreshSession() returned error during off-premises check-in:", refreshError)
          }
          currentUser = refreshedUser ?? null
        } catch (refreshError) {
          console.warn("[v0] refreshSession() threw during off-premises check-in:", refreshError)
        }
      }

      // Fallback to already loaded profile id when auth helpers are temporarily inconsistent.
      if (!currentUser?.id && userProfile?.id) {
        currentUser = { id: userProfile.id }
      }

      if (!currentUser?.id) {
        throw new Error("Session expired. Please refresh the page and log in again.")
      }

      console.log("[v0] User authenticated:", { user_id: currentUser?.id })

      let locationName = "Unknown Location"
      let locationDisplayName = ""
      try {
        const geoResult = await Promise.race([
          reverseGeocode(currentLocation.latitude, currentLocation.longitude),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("geocode timeout")), 8000)),
        ])
        if (geoResult) {
          locationName = (geoResult as any).address || (geoResult as any).display_name || "Unknown Location"
          locationDisplayName = (geoResult as any).display_name || locationName
        } else {
          locationName = `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`
          locationDisplayName = locationName
        }
      } catch {
        locationName = `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`
        locationDisplayName = locationName
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

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30_000)

      const response = await fetch("/api/attendance/check-in-outside-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId)
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
      const message =
        error?.name === "AbortError"
          ? "Request timed out after 30 seconds. Please check your internet and try again."
          : (error?.message || "Failed to send confirmation request. Please try again.")
      void logCheckinFailure({
        attemptType: "offpremises_checkin",
        failureMessage: message,
        latitude: pendingOffPremisesLocation?.latitude ?? null,
        longitude: pendingOffPremisesLocation?.longitude ?? null,
        accuracy: pendingOffPremisesLocation?.accuracy ?? null,
      })
      setFlashMessage({
        message,
        type: "error",
      })
      toast({
        title: "Error",
        description: message,
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
      console.log("[v0] Processing checkout request with location policy")

      // Handle out-of-range checkout with off-premises policy
      if (!checkoutValidation.canCheckOut) {
        if (!checkoutTimeReached) {
          setFlashMessage({
            message: `Minimum 2 hours required before check-out. ${minutesUntilCheckout ? `${minutesUntilCheckout} minutes remaining.` : ''}`,
            type: "error",
          })
          setIsLoading(false)
          return
        }

        const isPrivilegedRole = isExemptFromAttendanceReasons(userProfile?.role)
        if (isPrivilegedRole) {
          // Privileged roles (admin/dept head/regional manager) check out without requiring reason
          console.log("[v0] Privileged role out-of-range checkout - proceeding without reason")
        } else {
          const offPremisesEnabled = runtimeFlags.offPremisesCheckoutEnabled
          const [opStartH, opStartM] = (runtimeFlags.offPremisesCheckoutStartTime ?? "15:00").split(":").map(Number)
          const [opEndH, opEndM] = (runtimeFlags.offPremisesCheckoutEndTime ?? "23:59").split(":").map(Number)
          const opStartMins = opStartH * 60 + opStartM
          const opEndMins = opEndH * 60 + opEndM
          const isWithinOffPremisesWindow = currentTimeMinutes >= opStartMins && currentTimeMinutes <= opEndMins

          if (!offPremisesEnabled) {
            setFlashMessage({
              message: "Off-premises check-out is currently disabled by the administrator. Please return to a registered QCC location to check out.",
              type: "error",
            })
            setIsLoading(false)
            return
          } else if (!isWithinOffPremisesWindow) {
            const windowStart = runtimeFlags.offPremisesCheckoutStartTime ?? "15:00"
            const windowEnd = runtimeFlags.offPremisesCheckoutEndTime ?? "23:59"
            setFlashMessage({
              message: `Off-premises check-out is only allowed between ${windowStart} and ${windowEnd}. Please return to a registered QCC location or wait until ${windowStart}.`,
              type: "error",
            })
            setIsLoading(false)
            return
          } else {
            // Show off-premises checkout dialog to collect reason
            // Find nearest location for context
            const effectiveCheckOutRadius2 = checkOutRadius ?? proximitySettings.checkInProximityRange
            let nearestLocForDialog = null
            if (realTimeLocations && realTimeLocations.length > 0) {
              const locationDistances2 = realTimeLocations
                .map((loc) => ({
                  location: loc,
                  distance: calculateDistance(locationData.latitude, locationData.longitude, loc.latitude, loc.longitude),
                }))
                .sort((a, b) => a.distance - b.distance)
              nearestLocForDialog = locationDistances2[0]?.location ?? null
            }
            setPendingOffPremisesCheckoutData({ location: locationData, nearestLocation: nearestLocForDialog })
            setOffPremisesCheckoutReason("")
            setShowOffPremisesCheckoutDialog(true)
            setIsLoading(false)
            return
          }
        }
      }

      console.log("[v0] Location validation passed - proceeding with checkout")

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
    const doCheckoutFetch = () => fetch("/api/attendance/check-out", {
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

    try {
      let response = await doCheckoutFetch()

      // If 401, try a silent token refresh and retry once
      if (response.status === 401) {
        const supabase = createClient()
        await supabase.auth.refreshSession()
        response = await doCheckoutFetch()
      }

      const result = await response.json()

      if (result.success && result.data) {
        console.log("[v0] Checkout successful:", result.data)

        setLocalTodayAttendance(result.data)
        clearAttendanceCache()
        clearGeolocationCache()
        clearFastLocationCache()
        setUserLocation(null)
        setLocationValidation(null)

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
    // Auto check-in is disabled by default; admin must enable it via runtime controls
    if (!runtimeFlags.autoCheckInEnabled) return

    if (localTodayAttendance?.check_in_time || hasPendingOffPremisesRequest || isOnLeave) {
      autoCheckInAttemptedRef.current = false
      setAutoCheckInFailureCount((prev) => (prev === 0 ? prev : 0))
      return
    }

    const attemptAutomaticCheckIn = async () => {
      // Guard against stale closure: re-check using the always-current ref
      if (localTodayAttendanceRef.current?.check_in_time) return

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

      const latenessRequiredAuto = requiresLatenessReason(now, userProfile?.departments, userProfile?.role, {
        latenessReasonDeadline: runtimeFlags.latenessReasonDeadline,
        exemptPrivilegedRolesFromReason: runtimeFlags.exemptPrivilegedRolesFromReason,
      })
      const [dlHour2, dlMin2] = (runtimeFlags.latenessReasonDeadline ?? "09:00").split(":").map(Number)
      const isLateArrival = now.getHours() > dlHour2 || (now.getHours() === dlHour2 && now.getMinutes() >= dlMin2)
      if (isLateArrival && latenessRequiredAuto) {
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

        const isExemptDeptUser = isSecurityDept(userProfile?.departments) || isTransportDept(userProfile?.departments) || isOperationalDept(userProfile?.departments) || isExemptFromAttendanceReasons(userProfile?.role)
        if (!isExemptDeptUser && (!validation.canCheckIn || !validation.nearestLocation)) {
          return
        }
        // For exempt departments, use nearest location even if out of range
        const nearestForCheckIn = validation.nearestLocation || (realTimeLocations && realTimeLocations.length > 0 ? realTimeLocations[0] : null)
        if (!nearestForCheckIn) return

        autoCheckInAttemptedRef.current = true
        setRecentCheckIn(true)
        setIsCheckingIn(true)
        setCheckingMessage("Automatic check-in...")

        await performCheckInAPI(locationData, nearestForCheckIn, "")
        setAutoCheckInFailureCount(0)

        toast({
          title: "Automatic check-in recorded",
          description: `You were automatically checked in because you are online and within range of ${validation.nearestLocation.name}.`,
        })
      } catch (error) {
        console.warn("[v0] Automatic in-range check-in skipped:", error)
        autoCheckInAttemptedRef.current = false
        setAutoCheckInFailureCount((prev) => prev + 1)
        setRecentCheckIn(false)
        // Notify user immediately so they know to use manual check-in
        toast({
          title: "Automatic Check-In Failed",
          description: "We couldn't check you in automatically. Switching to manual check-in — please use the button below.",
          variant: "destructive",
          duration: 8000,
        })
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
    runtimeFlags.autoCheckInEnabled,
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
      clearPendingDeviceSharingWarning()
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

      const doCheckInFetch = () => fetch("/api/attendance/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
        body: JSON.stringify(checkInData),
      })

      let response = await doCheckInFetch()

      // If 401, silently refresh token and retry once
      if (response.status === 401) {
        const supabase = createClient()
        await supabase.auth.refreshSession()
        response = await doCheckInFetch()
      }

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

  const handleOffPremisesCheckoutConfirm = async () => {
    if (!pendingOffPremisesCheckoutData) return
    const trimmedReason = offPremisesCheckoutReason.trim()
    if (trimmedReason.length < 10) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason of at least 10 characters for checking out off-premises.",
        variant: "destructive",
      })
      return
    }
    setShowOffPremisesCheckoutDialog(false)
    setIsLoading(true)
    const { location } = pendingOffPremisesCheckoutData
    setPendingOffPremisesCheckoutData(null)

    try {
      // Check auth FIRST before any slow network calls
      const supabase = createClient()
      let currentUser: any = null

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        currentUser = user
      } catch (getUserError) {
        console.warn("[v0] getUser() failed during off-premises check-out:", getUserError)
      }

      if (!currentUser?.id) {
        try {
          const {
            data: { user: refreshedUser },
            error: refreshError,
          } = await supabase.auth.refreshSession()
          if (refreshError) {
            console.warn("[v0] refreshSession() returned error during off-premises check-out:", refreshError)
          }
          currentUser = refreshedUser ?? null
        } catch (refreshError) {
          console.warn("[v0] refreshSession() threw during off-premises check-out:", refreshError)
        }
      }

      // Fallback to already loaded profile id when auth helpers are temporarily inconsistent.
      if (!currentUser?.id && userProfile?.id) {
        currentUser = { id: userProfile.id }
      }

      if (!currentUser?.id) {
        throw new Error("Session expired. Please refresh the page and log in again.")
      }

      let locationName = "Unknown Location"
      let locationDisplayName = ""
      try {
        const geoResult = await Promise.race([
          reverseGeocode(location.latitude, location.longitude),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("geocode timeout")), 8000)),
        ])
        if (geoResult) {
          locationName = (geoResult as any).address || (geoResult as any).display_name || "Unknown Location"
          locationDisplayName = (geoResult as any).display_name || locationName
        } else {
          locationName = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
          locationDisplayName = locationName
        }
      } catch {
        locationName = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
        locationDisplayName = locationName
      }

      const offGridHoursBeforeRequest = offGridSince
        ? Number(((getSystemNow().getTime() - offGridSince.getTime()) / (1000 * 60 * 60)).toFixed(2))
        : null

      const payload = {
        current_location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          name: locationName,
          display_name: locationDisplayName,
        },
        device_info: getDeviceInfo(),
        user_id: currentUser.id,
        reason: trimmedReason,
        request_type: "checkout",
        off_grid_hours_before_request: offGridHoursBeforeRequest,
        off_grid_started_at: offGridSince ? offGridSince.toISOString() : null,
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30_000)

      const response = await fetch("/api/attendance/check-in-outside-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId)
      })

      let result: any = {}
      let rawBody: string | null = null
      try {
        rawBody = await response.text()
        try {
          result = rawBody ? JSON.parse(rawBody) : {}
        } catch {
          // Non-JSON response can happen on proxy/dev errors; keep raw text for diagnostics.
        }
      } catch {
        // If body read fails, we still surface HTTP status below.
      }

      if (!response.ok) {
        const errMsg = result?.error || result?.message || rawBody || `HTTP ${response.status}`
        throw new Error(errMsg)
      }

      if (result && (result.success === false || !result.request_id)) {
        throw new Error(result.error || result.message || "Request was not successful")
      }

      setFlashMessage({
        message: "Off-premises check-out request sent. Your department head/supervisor has been notified.",
        type: "success",
      })

      toast({
        title: "Request Sent",
        description: "Your off-premises check-out request is pending approval by your supervisors.",
        className: "border-emerald-400 bg-emerald-50 text-emerald-900",
      })

      setHasPendingOffPremisesRequest(true)
      setTimeout(() => {
        fetchTodayAttendance()
      }, 1500)
    } catch (error) {
      console.error("[v0] Off-premises checkout error:", error)
      const message =
        (error as any)?.name === "AbortError"
          ? "Request timed out after 30 seconds. Please check your internet and try again."
          : error instanceof Error
            ? error.message
            : "Failed to check out. Please try again."
      setFlashMessage({
        message,
        type: "error",
      })
    } finally {
      setOffPremisesCheckoutReason("")
      setIsLoading(false)
    }
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

      {pendingDeviceSharingWarning && !(localTodayAttendance as any)?.device_sharing_warning && (
        <Alert className="bg-yellow-50 border-yellow-400 dark:bg-yellow-900/60 dark:border-yellow-500/50 mb-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-100 font-semibold">
            ⚠️ Shared Device Detected
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-200">
            {pendingDeviceSharingWarning}
          </AlertDescription>
        </Alert>
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
                    runtimeConfig={{
                      latenessReasonDeadline: runtimeFlags.latenessReasonDeadline,
                      checkoutCutoffTime: runtimeFlags.checkoutCutoffTime,
                      exemptPrivilegedRolesFromReason: runtimeFlags.exemptPrivilegedRolesFromReason,
                    }}
                    getNow={getSystemNow}
                  />
                )
              })()
            )}

            {/* Check-in/Check-out Buttons */}
            <div className="space-y-4">
              {!localTodayAttendance?.check_in_time && (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    {/* While location is resolving, show both options; once resolved, keep only the valid one. */}
                    {showRegularCheckInButton && (
                    <Button
                      onClick={handleCheckIn}
                      disabled={
                        !canCheckInButton || isCheckingIn || isProcessing || isLoading || !canCheckInAtTime(getSystemNow(), userProfile?.departments, userProfile?.role) || hasPendingOffPremisesRequest
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
                    )}
                    
                    {showOffPremisesCheckInButton && (
                      <Button
                        onClick={handleCheckInOutsidePremises}
                        disabled={isCheckingIn || isProcessing || hasPendingOffPremisesRequest || isResolvingCheckInRange}
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
                            {isResolvingCheckInRange ? "Checking location..." : "Check In Outside Premises"}
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {manualCheckInFallbackEnabled && (
                    <Alert className="border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <AlertTitle className="text-red-800 dark:text-red-200 font-semibold text-base">
                        Automatic check-in failed — Manual check-in required
                      </AlertTitle>
                      <AlertDescription className="text-red-700 dark:text-red-300 space-y-3 mt-2">
                        <p className="text-sm">
                          We were unable to check you in automatically. Please use the manual option below to record your attendance now.
                        </p>
                        <Button
                          onClick={() => {
                            setShowLocationCodeDialog(true)
                          }}
                          className="w-full bg-red-600 hover:bg-red-700 text-white shadow-md"
                          size="lg"
                          disabled={isCheckingIn || isProcessing || isLoading}
                        >
                          <LogIn className="mr-2 h-5 w-5" />
                          Check In Now (Manual)
                        </Button>
                        <p className="text-xs text-red-500 dark:text-red-400">
                          Select your location from the list or enter the location code shown at your work site.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
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

      {showOffPremisesCheckoutDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <LogOut className="h-5 w-5" />
                Off-Premises Check-Out Request
              </CardTitle>
              <CardDescription>
                You are outside registered QCC locations. Please provide a reason to request off-premises check-out.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50">
                <Info className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-800">Review Workflow</AlertTitle>
                <AlertDescription className="text-orange-700">
                  Your department head/supervisor will be notified with your reason and location details for review.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="offpremises-checkout-reason">Reason for Off-Premises Check-Out *</Label>
                <textarea
                  id="offpremises-checkout-reason"
                  value={offPremisesCheckoutReason}
                  onChange={(e) => setOffPremisesCheckoutReason(e.target.value)}
                  placeholder="e.g., Left site for official assignment, emergency travel, client delivery..."
                  className="w-full min-h-[100px] p-3 border rounded-md resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={500}
                />
                <p className={`text-xs ${offPremisesCheckoutReason.length < 10 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {offPremisesCheckoutReason.length}/500 characters (minimum 10 required)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowOffPremisesCheckoutDialog(false)
                    setPendingOffPremisesCheckoutData(null)
                    setOffPremisesCheckoutReason("")
                  }}
                  variant="outline"
                  className="flex-1 bg-transparent"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleOffPremisesCheckoutConfirm}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={isLoading || offPremisesCheckoutReason.trim().length < 10}
                >
                  {isLoading ? (
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

                {checkoutTimeReached && !locationValidation?.canCheckOut && offGridSince && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-2 text-center justify-center">
                    <Clock className="h-3 w-3" />
                    <span>
                      Off-grid for{" "}
                      <strong>
                        {(() => {
                          const mins = Math.floor((getSystemNow().getTime() - offGridSince.getTime()) / 60000)
                          const h = Math.floor(mins / 60)
                          const m = mins % 60
                          return h > 0 ? `${h}h ${m}m` : `${m} min`
                        })()}
                      </strong>
                      {". You can submit an off-premises check-out request from here."}
                    </span>
                  </div>
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
                    <p className="text-xs font-medium text-muted-foreground">Device ID</p>
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
          onCheckIn={handleManualCheckInSuccess}
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
          onCheckIn={handleManualCheckInSuccess}
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
