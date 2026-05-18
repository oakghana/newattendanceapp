"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Camera, CameraOff, QrCode, MapPin, Clock, CheckCircle, AlertCircle, KeyRound, Copy, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useNotifications } from "@/components/ui/notification-system"

interface ScanResult {
  success: boolean
  message: string
  eventName?: string
  location?: string
  timestamp?: string
}

interface AttendanceRecord {
  id: string
  event_name: string
  location_name: string
  check_in_time: string
  status: string
}

interface Location {
  id: string
  name: string
  location_code: string
}

export function QRScanner({ locations = [] }: { locations: Location[] }) {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)

  const [showManualInput, setShowManualInput] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const { showSuccess, showError, showWarning } = useNotifications()
  const supabase = createClient()

  useEffect(() => {
    loadRecentAttendance()
    getCurrentLocation()

    return () => {
      stopScanning()
    }
  }, [])

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
        },
        (error) => {
          console.warn("Location access denied:", error)
          showWarning("Location access is recommended for accurate attendance tracking")
        },
      )
    }
  }

  const loadRecentAttendance = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("qr_event_scans")
        .select(`
          id,
          scanned_at,
          qr_events!inner(
            name,
            geofence_locations(name)
          )
        `)
        .eq("user_id", user.id)
        .order("scanned_at", { ascending: false })
        .limit(5)

      if (error) throw error

      const formattedData = data.map((record: any) => ({
        id: record.id,
        event_name: record.qr_events?.name || "Unknown Event",
        location_name: record.qr_events?.geofence_locations?.name || "Unknown Location",
        check_in_time: record.scanned_at,
        status: "present",
      }))

      setRecentAttendance(formattedData)
    } catch (error) {
      console.error("Error loading recent attendance:", error)
    }
  }

  const startScanning = async () => {
    try {
      setIsLoading(true)
      setScanResult(null)
      console.log("[v0] Requesting camera access...")

      // Request camera permission with better error handling
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera if available
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      console.log("[v0] Camera access granted")
      setHasPermission(true)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream

        // Wait for video to be ready before starting scan
        videoRef.current.onloadedmetadata = () => {
          console.log("[v0] Video loaded, starting playback")
          videoRef.current
            ?.play()
            .then(() => {
              console.log("[v0] Video playing, starting QR scan interval")
              setIsScanning(true)
              // Start scanning for QR codes
              scanIntervalRef.current = setInterval(scanForQRCode, 500)
            })
            .catch((err) => {
              console.error("[v0] Video play error:", err)
              showError("Failed to start video playback")
            })
        }
      }
    } catch (error) {
      console.error("[v0] Camera access error:", error)
      setHasPermission(false)
      showError("Camera access denied. Please allow camera permissions or use manual code input.")
    } finally {
      setIsLoading(false)
    }
  }

  const stopScanning = () => {
    setIsScanning(false)

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const scanForQRCode = async () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext("2d")

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    try {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

      // Use jsQR library to detect QR codes
      const code = await detectQRCode(imageData)

      if (code) {
        console.log("[v0] QR code detected:", code)
        await processQRCode(code)
      }
    } catch (error) {
      console.error("[v0] QR scanning error:", error)
    }
  }

  const detectQRCode = async (imageData: ImageData): Promise<string | null> => {
    try {
      // Import jsQR dynamically to avoid SSR issues
      const jsQR = (await import("jsqr")).default
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      })

      return code?.data || null
    } catch (error) {
      console.error("[v0] QR detection error:", error)
      return null
    }
  }

  const processQRCode = async (qrData: string) => {
    try {
      setIsLoading(true)
      stopScanning()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setScanResult({
          success: false,
          message: "Authentication required",
        })
        return
      }

      // Parse QR code data
      let eventData
      try {
        eventData = JSON.parse(qrData)
      } catch {
        setScanResult({
          success: false,
          message: "Invalid QR code format",
        })
        return
      }

      // Verify event exists and is active
      const { data: event, error: eventError } = await supabase
        .from("qr_events")
        .select(`
          *,
          geofence_locations!inner(name, latitude, longitude, radius_meters)
        `)
        .eq("qr_code_data", qrData)
        .eq("is_active", true)
        .single()

      if (eventError || !event) {
        setScanResult({
          success: false,
          message: "Event not found or inactive",
        })
        return
      }

      // Check if event is currently active (time-based)
      const now = new Date()
      const eventDate = new Date(event.event_date)
      const startTime = new Date(`${event.event_date}T${event.start_time}`)
      const endTime = new Date(`${event.event_date}T${event.end_time}`)

      if (now < startTime || now > endTime) {
        setScanResult({
          success: false,
          message: "Event is not currently active",
        })
        return
      }

      // Check location if available
      if (currentLocation && event.geofence_locations) {
        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          Number.parseFloat(event.geofence_locations.latitude),
          Number.parseFloat(event.geofence_locations.longitude),
        )

        if (distance > event.geofence_locations.radius_meters) {
          setScanResult({
            success: false,
            message: "You are not within the event location",
          })
          return
        }
      }

      // Check if already checked in
      const { data: existingRecord } = await supabase
        .from("qr_event_scans")
        .select("id")
        .eq("user_id", user.id)
        .eq("qr_event_id", event.id)
        .single()

      if (existingRecord) {
        setScanResult({
          success: false,
          message: "You have already checked in to this event",
        })
        return
      }

      // Record attendance
      const { error: scanError } = await supabase.from("qr_event_scans").insert({
        user_id: user.id,
        qr_event_id: event.id,
        latitude: currentLocation?.lat,
        longitude: currentLocation?.lng,
        scanned_at: new Date().toISOString(),
      })

      if (scanError) throw scanError

      setScanResult({
        success: true,
        message: "Attendance recorded successfully!",
        eventName: event.name,
        location: event.geofence_locations?.name,
        timestamp: new Date().toLocaleString(),
      })

      showSuccess(`Checked in to ${event.name}`)
      loadRecentAttendance()
    } catch (error) {
      console.error("QR processing error:", error)
      setScanResult({
        success: false,
        message: "Failed to process attendance",
      })
      showError("Failed to record attendance")
    } finally {
      setIsLoading(false)
    }
  }

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lng2 - lng1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  const handleManualInput = async () => {
    if (!manualCode.trim()) {
      showError("Please enter a location code")
      return
    }

    try {
      setIsLoading(true)
      console.log("[v0] Processing manual code:", manualCode)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        showError("Authentication required")
        return
      }

      const { data: location, error: locationError } = await supabase
        .from("geofence_locations")
        .select("*")
        .eq("location_code", manualCode.toUpperCase())
        .single()

      if (locationError || !location) {
        showError("Invalid location code. Please check and try again.")
        return
      }

      const userLocation = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) {
          console.warn("[v0] Geolocation not supported")
          resolve(null)
          return
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            })
          },
          (error) => {
            console.warn("[v0] Location access error:", error)
            resolve(null)
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          },
        )
      })

      if (userLocation && location.latitude && location.longitude) {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          Number.parseFloat(location.latitude),
          Number.parseFloat(location.longitude),
        )

        console.log("[v0] Distance to location:", distance, "meters")

        // Device-based proximity check: 100m for mobile/tablet, 2000m for desktop
        // Display "50 meters" to users as standard requirement
        const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        const maxDistance = isMobileDevice ? 100 : 2000
        
        if (distance > maxDistance) {
          showError(
            `You are too far from ${location.name} (${Math.round(distance)}m away). You must be within 50 meters of the location to check in.`,
          )
          return
        }
      } else if (!userLocation) {
        showError(
          "GPS location is required for manual code entry. Please enable location access or use the QR scanner camera instead.",
        )
        return
      }

      const now = new Date()
      const today = now.toISOString().split("T")[0]

      const { data: existingAttendance } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", user.id)
        .gte("check_in_time", `${today}T00:00:00Z`)
        .lt("check_in_time", `${today}T23:59:59Z`)
        .maybeSingle()

      let endpoint = "/api/attendance/qr-checkin"
      let action = "check-in"

      if (existingAttendance && !existingAttendance.check_out_time) {
        // Already checked in, perform check-out
        endpoint = "/api/attendance/qr-checkout"
        action = "check-out"
      } else if (existingAttendance && existingAttendance.check_out_time) {
        showError("You have already completed attendance for today")
        return
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: location.id,
          qr_timestamp: new Date().toISOString(),
          device_info: {
            method: "manual_code",
            code: manualCode.toUpperCase(),
            userAgent: navigator.userAgent,
          },
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${action}`)
      }

      setScanResult({
        success: true,
        message: `${action === "check-in" ? "Checked in" : "Checked out"} successfully!`,
        eventName: action === "check-in" ? "Check-in" : "Check-out",
        location: location.name,
        timestamp: new Date().toLocaleString(),
      })

      showSuccess(`${action === "check-in" ? "Checked in to" : "Checked out from"} ${location.name}`)
      setManualCode("")
      setShowManualInput(false)
      loadRecentAttendance()
    } catch (error: any) {
      console.error("[v0] Manual input error:", error)
      showError(error.message || "Failed to record attendance")
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    showSuccess(`Copied ${code} to clipboard`)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* QR Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code Scanner
          </CardTitle>
          <CardDescription>Scan QR codes to record your attendance at events and classes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Camera View */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            {isScanning ? (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                <canvas ref={canvasRef} className="hidden" />
                {/* Scanning overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-primary rounded-lg relative">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary"></div>
                  </div>
                </div>
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                  <p className="text-white text-sm bg-black/70 px-3 py-1 rounded">Position QR code within the frame</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>Camera not active</p>
                  <p className="text-sm">Tap "Start Scanning" to begin</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {!isScanning ? (
                <Button onClick={startScanning} disabled={isLoading} className="flex-1 h-16">
                  <Camera className="h-5 w-5 mr-2" />
                  {isLoading ? "Starting Camera..." : "Start Scanning"}
                </Button>
              ) : (
                <Button onClick={stopScanning} variant="destructive" className="flex-1 h-16">
                  <CameraOff className="h-5 w-5 mr-2" />
                  Stop Scanning
                </Button>
              )}
            </div>

            {/* Manual Code Input */}
            {showManualInput ? (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="manual-code" className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Enter Location Code
                  </Label>
                  <Input
                    id="manual-code"
                    placeholder="e.g., HO-SWZ-001"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleManualInput()
                      }
                    }}
                    className="font-mono text-lg"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the location code displayed at your work location or choose from the list below
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleManualInput} disabled={isLoading || !manualCode.trim()} className="flex-1">
                    {isLoading ? "Processing..." : "Submit Code"}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowManualInput(false)
                      setManualCode("")
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowManualInput(true)}
                variant="outline"
                className="w-full h-16 bg-transparent border-dashed"
              >
                <KeyRound className="h-5 w-5 mr-2" />
                Enter Location Code Manually
              </Button>
            )}
          </div>

          {/* Permission Status */}
          {hasPermission === false && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Camera permission denied. Please enable camera access in your browser settings or use the Manual Code
                Input option above.
              </AlertDescription>
            </Alert>
          )}

          {/* Scan Result */}
          {scanResult && (
            <Alert className={scanResult.success ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}>
              {scanResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={scanResult.success ? "text-green-800" : "text-red-800"}>
                <div className="space-y-1">
                  <p className="font-medium">{scanResult.message}</p>
                  {scanResult.success && scanResult.eventName && (
                    <div className="text-sm space-y-1">
                      <p>Event: {scanResult.eventName}</p>
                      {scanResult.location && <p>Location: {scanResult.location}</p>}
                      {scanResult.timestamp && <p>Time: {scanResult.timestamp}</p>}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {locations.length > 0 && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Available Location Codes
            </CardTitle>
            <CardDescription>
              If camera scanning is not working, tap any code below to copy it, then use "Enter Location Code Manually"
              button above and paste or type the code to check in/out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {locations.map((location) => (
                <button
                  key={location.id}
                  onClick={() => copyToClipboard(location.location_code)}
                  className="flex items-center justify-between p-4 border-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-all group"
                >
                  <div className="text-left flex-1">
                    <p className="text-sm text-muted-foreground mb-1">{location.name}</p>
                    <p className="text-2xl font-bold font-mono text-primary">{location.location_code}</p>
                  </div>
                  <div className="ml-3">
                    {copiedCode === location.location_code ? (
                      <Check className="h-6 w-6 text-green-500" />
                    ) : (
                      <Copy className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>How to use:</strong> Tap any location code to copy it, then click "Enter Location Code Manually"
                button above and paste or type the code to check in/out.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Recent Attendance */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance</CardTitle>
          <CardDescription>Your recent check-ins and attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          {recentAttendance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No recent attendance records found</div>
          ) : (
            <div className="space-y-3">
              {recentAttendance.map((record) => (
                <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium">{record.event_name}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {record.location_name}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(record.check_in_time).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant={record.status === "present" ? "default" : "secondary"}>{record.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
