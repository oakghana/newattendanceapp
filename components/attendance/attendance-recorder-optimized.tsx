"use client"

import { memo, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { getDeviceInfo } from "@/lib/device-info"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { MapPin, LogIn, LogOut, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"

// Memoized sub-components to prevent unnecessary re-renders
const AttendanceStatus = memo(function AttendanceStatus({ attendance }: { attendance: any }) {
  if (!attendance) return null
  return (
    <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-900">Checked In</p>
            <p className="text-lg font-semibold text-green-700">
              {new Date(attendance.check_in_time).toLocaleTimeString()}
            </p>
          </div>
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
      </CardContent>
    </Card>
  )
})

const LocationInfo = memo(function LocationInfo({ location, distance }: { location: any; distance?: number }) {
  if (!location) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {location.name}
        </CardTitle>
        <CardDescription>{location.address}</CardDescription>
      </CardHeader>
      <CardContent>
        {distance !== undefined && (
          <p className="text-sm">Distance: {distance.toFixed(0)}m away</p>
        )}
      </CardContent>
    </Card>
  )
})

interface AttendanceRecorderOptimizedProps {
  todayAttendance?: any
  geoSettings?: any
  locations?: any[]
  userLeaveStatus?: string
}

export const AttendanceRecorderOptimized = memo(function AttendanceRecorderOptimized({
  todayAttendance: initialAttendance,
  userLeaveStatus,
}: AttendanceRecorderOptimizedProps) {
  // Consolidated state - minimal necessary state only
  const [isLoading, setIsLoading] = useState(false)
  const [attendance, setAttendance] = useState(initialAttendance)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Ref for preventing duplicate requests
  const requestInProgressRef = useRef(false)
  const lastRequestTimeRef = useRef(0)
  const DEBOUNCE_TIME = 500 // Prevent accidental double taps without delaying normal attendance actions

  // Memoized computed values
  const isOnLeave = useMemo(() => {
    return userLeaveStatus === "on_leave" || userLeaveStatus === "sick_leave"
  }, [userLeaveStatus])

  const isCheckedIn = useMemo(() => {
    return !!attendance?.check_in_time && !attendance?.check_out_time
  }, [attendance])

  const canCheckIn = useMemo(() => {
    return !isOnLeave && !attendance?.check_in_time
  }, [isOnLeave, attendance])

  const canCheckOut = useMemo(() => {
    return isCheckedIn && !isOnLeave
  }, [isCheckedIn, isOnLeave])

  // Debounced request function
  const makeRequest = useCallback(async (endpoint: string, method: string = "POST", body: any = {}) => {
    // Prevent duplicate requests
    const now = Date.now()
    if (requestInProgressRef.current || (now - lastRequestTimeRef.current < DEBOUNCE_TIME)) {
      console.log("[v0] Request throttled")
      return null
    }

    requestInProgressRef.current = true
    lastRequestTimeRef.current = now

    try {
      setError(null)
      setSuccess(null)
      setIsLoading(true)
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || "Request failed")
      }

      return data
    } catch (err: any) {
      const errorMsg = err.message || "An error occurred"
      setError(errorMsg)
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      })
      return null
    } finally {
      setIsLoading(false)
      requestInProgressRef.current = false
    }
  }, [])

  // Handle check-in
  const handleCheckIn = useCallback(async () => {
    console.log("[v0] Check-in initiated")
    const result = await makeRequest("/api/attendance/check-in", "POST", {
      device_info: getDeviceInfo(),
    })

    if (result?.success) {
      setSuccess("Successfully checked in!")
      setAttendance(result.data ?? result.attendance ?? null)
      setTimeout(() => setSuccess(null), 5000)
    }
  }, [makeRequest])

  // Handle check-out
  const handleCheckOut = useCallback(async () => {
    console.log("[v0] Check-out initiated")
    const result = await makeRequest("/api/attendance/check-out", "POST", {
      device_info: getDeviceInfo(),
    })

    if (result?.success) {
      setSuccess("Successfully checked out!")
      setAttendance(result.data ?? result.attendance ?? null)
      setTimeout(() => setSuccess(null), 5000)
    }
  }, [makeRequest])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      requestInProgressRef.current = false
    }
  }, [])

  if (isOnLeave) {
    return (
      <Alert className="border-orange-200 bg-orange-50">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
        <AlertTitle>On Leave</AlertTitle>
        <AlertDescription>
          You are currently on approved leave and cannot check in or out.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {attendance && <AttendanceStatus attendance={attendance} />}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900">Success</AlertTitle>
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-4">
        <Button
          onClick={handleCheckIn}
          disabled={!canCheckIn || isLoading}
          className="flex-1"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4 mr-2" />
              Check In
            </>
          )}
        </Button>

        <Button
          onClick={handleCheckOut}
          disabled={!canCheckOut || isLoading}
          variant="destructive"
          size="lg"
          className="flex-1"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4 mr-2" />
              Check Out
            </>
          )}
        </Button>
      </div>
    </div>
  )
})
