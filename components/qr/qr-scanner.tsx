"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Camera, X, CheckCircle, KeyRound, Upload, MapPin, Info } from "lucide-react"
import { parseQRCode, parseLocationCode, validateQRCode, type QRCodeData } from "@/lib/qr-code"
import { useToast } from "@/hooks/use-toast"

interface QRScannerProps {
  onScanSuccess: (data: QRCodeData) => void
  onClose: () => void
  autoStart?: boolean
}

interface Location {
  id: string
  name: string
  address: string
  location_code: string
}

export function QRScanner({ onScanSuccess, onClose, autoStart = false }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [availableLocations, setAvailableLocations] = useState<Location[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    setIsMobile(checkMobile)
    console.log("[v0] Mobile device detected:", checkMobile)

    fetchAvailableLocations()

    if (autoStart && !checkMobile) {
      startScanning()
    }
  }, [])

  const fetchAvailableLocations = async () => {
    try {
      const response = await fetch("/api/locations/active")
      if (response.ok) {
        const { locations } = await response.json()
        setAvailableLocations(locations || [])
      }
    } catch (error) {
      console.error("[v0] Failed to fetch locations:", error)
    } finally {
      setLoadingLocations(false)
    }
  }

  const startScanning = async () => {
    try {
      setError(null)
      setIsScanning(true)

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, max: 1920, min: 640 },
          height: { ideal: 1080, max: 1080, min: 480 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: false,
      }

      console.log("[v0] Requesting camera access for mobile device")
      console.log("[v0] Camera constraints:", constraints)

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access is not supported on this device")
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log("[v0] Camera stream obtained successfully")

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream

        videoRef.current.setAttribute("playsinline", "true")
        videoRef.current.setAttribute("webkit-playsinline", "true")
        videoRef.current.setAttribute("muted", "true")
        videoRef.current.setAttribute("autoplay", "true")
        videoRef.current.muted = true

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Video load timeout")), 10000)

          videoRef.current!.onloadedmetadata = () => {
            clearTimeout(timeout)
            console.log("[v0] Video metadata loaded")
            resolve()
          }

          videoRef.current!.onerror = (e) => {
            clearTimeout(timeout)
            console.error("[v0] Video error:", e)
            reject(new Error("Video load error"))
          }
        })

        await videoRef.current.play()
        console.log("[v0] Camera stream started successfully, starting QR scan interval")

        setTimeout(() => {
          scanIntervalRef.current = setInterval(scanForQRCode, 300)
        }, 500)
      }
    } catch (err) {
      console.error("[v0] Camera access error:", err)

      let errorMessage = "Unable to access camera. "

      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          errorMessage += "Please allow camera permissions in your browser settings and reload the page."
        } else if (err.name === "NotFoundError") {
          errorMessage += "No camera found on your device. Try using the 'Enter Location Code' option instead."
        } else if (err.name === "NotReadableError") {
          errorMessage += "Camera is already in use by another app. Please close other apps and try again."
        } else {
          errorMessage += err.message || "Please enable camera permissions and try again."
        }
      }

      setError(errorMessage)
      toast({
        title: "Camera Error",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })

      setIsScanning(false)
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

      const jsQR = (await import("jsqr")).default
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      })

      if (code) {
        console.log("[v0] QR code detected:", code.data)
        await processQRCode(code.data)
      }
    } catch (error) {
      console.error("[v0] QR scanning error:", error)
    }
  }

  const processQRCode = async (qrDataString: string) => {
    try {
      stopScanning()
      console.log("[v0] Processing QR code:", qrDataString)

      const qrData = parseQRCode(qrDataString)
      if (!qrData) {
        const errorMsg = "Invalid QR code format. Please scan a valid location QR code."
        setError(errorMsg)
        toast({
          title: "Invalid QR Code",
          description: errorMsg,
          variant: "destructive",
          duration: 8000,
        })
        return
      }

      const validation = validateQRCode(qrData)
      if (!validation.isValid) {
        const errorMsg = validation.reason || "Invalid or expired QR code"
        setError(errorMsg)
        toast({
          title: "Invalid QR Code",
          description: errorMsg,
          variant: "destructive",
          duration: 8000,
        })
        return
      }

      console.log("[v0] Getting GPS location for QR code verification...")

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("GPS location timeout. Please ensure location services are enabled."))
          }, 15000)

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timeout)
              resolve(pos)
            },
            (err) => {
              clearTimeout(timeout)
              let errorMessage = "Unable to get your location. "

              if (err.code === 1) {
                errorMessage += "Please enable location permissions in your browser/phone settings."
              } else if (err.code === 2) {
                errorMessage += "Location unavailable. Please check your GPS/WiFi settings."
              } else if (err.code === 3) {
                errorMessage += "Location request timed out. Please try again."
              } else {
                errorMessage += err.message || "Please enable location services."
              }

              reject(new Error(errorMessage))
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            },
          )
        })

        const userLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }

        console.log("[v0] GPS location obtained:", userLocation)

        const response = await fetch("/api/attendance/qr-checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: qrData.location_id,
            qr_timestamp: new Date().toISOString(),
            userLatitude: userLocation.latitude,
            userLongitude: userLocation.longitude,
            device_info: {
              browser: navigator.userAgent,
              platform: navigator.platform,
            },
          }),
        })

        const result = await response.json()
        console.log("[v0] QR check-in API response:", result)

        if (!response.ok) {
          let errorMsg = "Failed to check in"

          if (response.status === 403) {
            // Distance error
            if (result.distance && result.locationName) {
              errorMsg = `You must be within 50 meters of your assigned location to check in. Please use manual location code entry.`
            } else if (result.message) {
              errorMsg = result.message
            } else if (result.error) {
              errorMsg = result.error
            }
          } else if (response.status === 400) {
            errorMsg = result.error || result.message || "Invalid QR code or location"
          } else if (response.status === 401) {
            errorMsg = "You are not logged in. Please log in and try again."
          } else {
            errorMsg = result.error || result.message || "An error occurred during check-in"
          }

          console.error("[v0] QR check-in failed:", errorMsg)
          setError(errorMsg)

          toast({
            title: "Check-In Failed",
            description: errorMsg,
            variant: "destructive",
            duration: 10000,
          })
          return
        }

        const successMsg =
          result.message || `Successfully checked in at ${result.data?.location_tracking?.location_name || "location"}`
        setSuccess(successMsg)

        toast({
          title: "Check-In Successful",
          description: successMsg,
          variant: "default",
          duration: 5000,
        })

        console.log("[v0] QR check-in successful")
        onScanSuccess(qrData)
      } catch (gpsError) {
        console.error("[v0] GPS error:", gpsError)

        const errorMsg =
          gpsError instanceof Error
            ? gpsError.message
            : "Unable to get your location. Please enable location services and try again."

        setError(errorMsg)

        toast({
          title: "Location Required",
          description: errorMsg,
          variant: "destructive",
          duration: 10000,
        })
      }
    } catch (error) {
      console.error("[v0] QR processing error:", error)

      const errorMsg = error instanceof Error ? error.message : "Failed to process QR code. Please try again."

      setError(errorMsg)

      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
        duration: 8000,
      })
    }
  }

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsScanning(false)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    console.log("[v0] Processing uploaded QR image:", file.name)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const result = e.target?.result as string

      const img = new Image()
      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext("2d")

          if (!ctx) {
            setError("Failed to process image")
            return
          }

          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

          const jsQR = (await import("jsqr")).default
          const code = jsQR(imageData.data, imageData.width, imageData.height)

          if (code) {
            console.log("[v0] QR code found in uploaded image:", code.data)
            await processQRCode(code.data)
          } else {
            setError("No QR code found in image. Please try again with a clearer image.")
            toast({
              title: "No QR Code Found",
              description: "Please ensure the QR code is visible and try again.",
              variant: "destructive",
              duration: 5000,
            })
          }
        } catch (error) {
          console.error("[v0] Image processing error:", error)
          setError("Failed to process image")
        }
      }
      img.src = result
    }
    reader.readAsDataURL(file)
  }

  const handleManualCodeSubmit = async () => {
    if (!manualCode.trim()) {
      setError("Please enter a location code")
      toast({
        title: "Error",
        description: "Please enter a location code",
        variant: "destructive",
        duration: 5000,
      })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log("[v0] Processing manual code entry:", manualCode)

      const qrData = parseQRCode(manualCode)

      if (qrData) {
        // It's a full JSON QR code (from scanning)
        console.log("[v0] Parsed as JSON QR code")
        const validation = validateQRCode(qrData)
        if (!validation.isValid) {
          throw new Error(validation.reason || "Invalid or expired QR code")
        }

        // Process with GPS check
        await attemptGPSAndSubmit(qrData)
      } else {
        const locationCode = parseLocationCode(manualCode)

        if (!locationCode) {
          throw new Error("Invalid location code format. Please enter a valid code like 'SWANZY', 'ACCRA', or 'NSAWAM'")
        }

        console.log("[v0] Parsed as simple location code:", locationCode.locationCode)

        // Lookup location by code
        const response = await fetch(`/api/locations/lookup?code=${encodeURIComponent(locationCode.locationCode)}`)

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || "Location code not found")
        }

        const { location } = await response.json()
        console.log("[v0] Found location:", location)

        // Create QR data structure from location
        const manualQRData: QRCodeData = {
          type: "location",
          locationId: location.id,
          timestamp: Date.now(),
          signature: "manual-entry", // Special signature for manual entries
        }

        // Process with optional GPS
        await attemptGPSAndSubmit(manualQRData)
      }

      setSuccess("Check-in successful!")
      toast({
        title: "Success",
        description: "Location code validated and check-in initiated",
        duration: 5000,
      })

      // Close scanner after short delay
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (error: any) {
      console.error("[v0] Manual code processing error:", error)
      const errorMsg = error.message || "Failed to process location code"
      setError(errorMsg)
      toast({
        title: "Check-in Failed",
        description: errorMsg,
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const attemptGPSAndSubmit = async (qrData: QRCodeData) => {
    try {
      console.log("[v0] Attempting to get GPS for manual entry (optional, 3 second timeout)...")
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("GPS timeout")), 3000)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeout)
            resolve(pos)
          },
          (err) => {
            clearTimeout(timeout)
            reject(err)
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 },
        )
      })

      console.log("[v0] GPS location obtained, distance will be verified")
      toast({
        title: "GPS Obtained",
        description: "Your location will be verified (within 50m required)",
        duration: 3000,
      })

      onScanSuccess({
        ...qrData,
        userLatitude: position.coords.latitude,
        userLongitude: position.coords.longitude,
      })
    } catch (gpsError) {
      console.log("[v0] GPS not available, proceeding WITHOUT GPS verification")
      toast({
        title: "GPS Unavailable",
        description: "Checking in without distance verification. Location verified by code only.",
        duration: 4000,
      })

      onScanSuccess(qrData)
    }
  }

  const startMobileCamera = async () => {
    try {
      setError(null)
      setIsScanning(true)

      console.log("[v0] Starting mobile camera for QR scanning")

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { exact: "environment" }, // Force back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log("[v0] Mobile camera stream obtained successfully")

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute("playsinline", "true")
        videoRef.current.setAttribute("webkit-playsinline", "true")
        videoRef.current.setAttribute("muted", "true")
        videoRef.current.setAttribute("autoplay", "true")
        videoRef.current.muted = true

        await videoRef.current.play()
        console.log("[v0] Mobile camera started, beginning QR scan")

        // Start scanning for QR codes
        scanIntervalRef.current = setInterval(scanForQRCode, 500)

        toast({
          title: "Camera Active",
          description: "Point your camera at the QR code to scan",
          duration: 3000,
        })
      }
    } catch (error: any) {
      console.error("[v0] Mobile camera error:", error)
      let errorMessage = "Failed to access camera. "

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        errorMessage += "Please allow camera access in your browser settings."
      } else if (error.name === "NotFoundError") {
        errorMessage += "No camera found on your device."
      } else if (error.name === "NotReadableError") {
        errorMessage += "Camera is being used by another app."
      } else {
        errorMessage += "Please try using manual code entry instead."
      }

      setError(errorMessage)
      setIsScanning(false)

      toast({
        title: "Camera Error",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })
    }
  }

  useEffect(() => {
    if (autoStart && !isScanning && !isMobile) {
      startScanning()
    }

    return () => {
      stopScanning()
    }
  }, [autoStart])

  const handleLocationCodeClick = async (location: any) => {
    const code =
      location.location_code || location.qr_code || location.name.substring(0, 10).toUpperCase().replace(/\s/g, "")

    console.log("[v0] Location clicked:", location.name, "Code:", code)

    // Auto-fill the input
    setManualCode(code)

    // Show toast notification
    toast({
      title: "Location Selected",
      description: `Processing check-in to ${location.name}...`,
      duration: 3000,
    })

    // Directly process the check-in with the code
    try {
      console.log("[v0] Auto-submitting location code:", code)

      // Lookup location by code to get full location data
      const response = await fetch(`/api/locations/lookup?code=${encodeURIComponent(code)}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Location code not found")
      }

      const { location: foundLocation } = await response.json()
      console.log("[v0] Found location for auto check-in:", foundLocation)

      // Create QR data structure from location
      const autoCheckInData: QRCodeData = {
        type: "location",
        locationId: foundLocation.id,
        timestamp: Date.now(),
        signature: "auto-checkin", // Special signature for one-tap check-ins
      }

      console.log("[v0] Calling onScanSuccess with auto check-in data")

      // Call the success callback to trigger check-in (without GPS requirement)
      onScanSuccess(autoCheckInData)

      toast({
        title: "Success",
        description: `Checking in to ${location.name}`,
        duration: 3000,
      })
    } catch (error: any) {
      console.error("[v0] Auto check-in error:", error)
      toast({
        title: "Check-in Failed",
        description: error.message || "Could not process check-in. Please try again.",
        variant: "destructive",
        duration: 5000,
      })
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{isMobile ? "Enter Location Code" : "Location Code Check-In"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          {isMobile
            ? "Tap your location below for instant check-in/out"
            : "Enter location code from your work site or scan QR code"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 text-green-900 border-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {isMobile ? (
          <div className="space-y-6">
            <Alert className="bg-green-50 border-green-500 border-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <AlertDescription className="text-sm font-semibold text-green-900">
                ✓ RECOMMENDED: Enter Location Code for Instant Check-In
              </AlertDescription>
            </Alert>

            <Card className="border-2 border-primary bg-primary/5 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Enter Location Code
                </CardTitle>
                <CardDescription className="text-sm font-semibold">
                  Fastest and most reliable method - No camera or GPS issues!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="manual-code" className="text-base font-semibold">
                    Location Code
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Type or tap a location below (e.g., SWANZY, ACCRA, NSAWAM)
                  </p>
                  <div className="flex gap-2">
                    <Input
                      id="manual-code"
                      placeholder="Enter location code"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleManualCodeSubmit()
                        }
                      }}
                      className="text-lg h-14 font-mono font-bold"
                    />
                    <Button
                      onClick={handleManualCodeSubmit}
                      size="lg"
                      className="px-8 h-14 text-base"
                      disabled={isLoading}
                    >
                      {isLoading ? "Checking..." : "Submit"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Tap Your Location for Instant Check-In
                </CardTitle>
                <CardDescription className="text-sm font-medium">One tap = Automatic check-in/out</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingLocations ? (
                  <div className="text-xs text-muted-foreground">Loading available locations...</div>
                ) : availableLocations.length > 0 ? (
                  <div className="grid gap-2">
                    {availableLocations.map((location) => (
                      <button
                        key={location.id}
                        onClick={() => handleLocationCodeClick(location)}
                        className="flex items-center justify-between p-4 bg-background rounded-lg border-2 hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                      >
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium text-sm truncate">{location.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{location.address}</div>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-mono text-base font-bold ml-3 flex-shrink-0">
                          <CheckCircle className="h-4 w-4" />
                          {location.location_code || location.name.substring(0, 10).toUpperCase()}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No locations available</div>
                )}

                <Alert className="bg-blue-50 dark:bg-blue-950/50 border-blue-200">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Tip:</strong> Bookmark this page on your phone for quick daily check-ins!
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">If Code Entry Doesn't Work</span>
              </div>
            </div>

            <Card className="border-dashed opacity-75">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Last Resort: Scan with Phone Camera
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Only use if manual code entry above is not working:</p>

                <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                  <li>Open your phone's Camera app</li>
                  <li>Point at QR code poster at your location</li>
                  <li>Code will appear - copy it</li>
                  <li>Enter code in the field above</li>
                </ol>

                <label htmlFor="qr-camera-input" className="block">
                  <Input
                    id="qr-camera-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button variant="outline" size="lg" className="w-full h-14 bg-transparent" asChild>
                    <div>
                      <Upload className="h-5 w-5 mr-3" />
                      Take Photo of QR Code
                    </div>
                  </Button>
                </label>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="bg-green-50 border-green-500 border-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <AlertDescription className="text-sm font-semibold text-green-900">
                ✓ RECOMMENDED: Enter Location Code (Fastest Method)
              </AlertDescription>
            </Alert>

            <Card className="border-2 border-primary bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Enter Location Code</CardTitle>
                <CardDescription>Most reliable method for all devices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="desktop-manual-code">Location Code</Label>
                    <Input
                      id="desktop-manual-code"
                      placeholder="Enter location code (e.g., SWANZY)"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleManualCodeSubmit()
                        }
                      }}
                      className="font-mono font-bold text-lg h-12"
                    />
                  </div>
                  <Button onClick={handleManualCodeSubmit} className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Checking In..." : "Submit Code"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {availableLocations.length > 0 && (
              <Card className="bg-background">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Quick Select Location
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {availableLocations.map((location) => (
                      <button
                        key={location.id}
                        onClick={() => handleLocationCodeClick(location)}
                        className="flex flex-col items-start p-3 bg-background rounded-lg border-2 hover:border-primary hover:bg-primary/5 transition-all"
                      >
                        <div className="font-medium text-sm truncate w-full">{location.name}</div>
                        <div className="text-xs font-mono font-bold text-primary mt-1">
                          {location.location_code || location.name.substring(0, 10).toUpperCase()}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Alternative Option</span>
              </div>
            </div>

            <Card className="border-dashed opacity-75">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Scan QR Code with Webcam</CardTitle>
              </CardHeader>
              <CardContent>
                {!isScanning ? (
                  <Button onClick={startScanning} variant="outline" className="w-full bg-transparent">
                    <Camera className="mr-2 h-4 w-4" />
                    Start Camera Scanner
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                      <canvas ref={canvasRef} className="hidden" />
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 border-4 border-primary/30 rounded-lg" />
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary animate-scan" />
                      </div>
                    </div>
                    <Button onClick={stopScanning} variant="destructive" className="w-full">
                      Stop Scanner
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
