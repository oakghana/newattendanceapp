"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Clock, Navigation, CheckCircle, XCircle, RefreshCw } from "lucide-react"
import { getCurrentLocation, calculateDistance, clearGeolocationCache } from "@/lib/geolocation"
import { getDeviceInfo } from "@/lib/device-info"
import { useDeviceRadiusSettings } from "@/hooks/use-device-radius-settings"
import type { GeofenceLocation } from "@/types/geofence"
import { clearLocationCache as clearFastLocationCache } from "@/lib/geolocation-fast"

interface LocationPreviewCardProps {
  assignedLocation?: GeofenceLocation | null
  locations?: GeofenceLocation[]
  rangeMode?: "checkin" | "checkout"
  onRangeStatusChange?: (status: { resolved: boolean; inRange: boolean | null }) => void
}

export function LocationPreviewCard({
  assignedLocation,
  locations = [],
  rangeMode = "checkin",
  onRangeStatusChange,
}: LocationPreviewCardProps) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(
    null,
  )
  const [detectedArea, setDetectedArea] = useState<string>("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [nearestLocation, setNearestLocation] = useState<{
    location: GeofenceLocation
    distance: number
    isInRange: boolean
  } | null>(null)
  const { settings: deviceRadiusSettings } = useDeviceRadiusSettings()

  useEffect(() => {
    loadLocation()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      clearGeolocationCache()
      clearFastLocationCache()
      void loadLocation()
    }, 30 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (userLocation && locations.length > 0) {
      findNearestLocation()
    } else {
      onRangeStatusChange?.({ resolved: false, inRange: null })
    }
  }, [userLocation, locations, deviceRadiusSettings, onRangeStatusChange, rangeMode])

  const loadLocation = async () => {
    try {
      const location = await getCurrentLocation(false)
      setUserLocation(location)
      reverseGeocode(location.latitude, location.longitude)
    } catch (error) {
      console.error("[v0] Failed to load location:", error)
    }
  }

  const findNearestLocation = () => {
    if (!userLocation || locations.length === 0) return

    const deviceInfo = getDeviceInfo()
    // Use admin-configured radius based on current mode so badge matches active action.
    let proximityRadius = 100 // Fallback default
    if (deviceRadiusSettings) {
      const radiusByDevice = {
        mobile: rangeMode === "checkin" ? deviceRadiusSettings.mobile.checkIn : deviceRadiusSettings.mobile.checkOut,
        tablet: rangeMode === "checkin" ? deviceRadiusSettings.tablet.checkIn : deviceRadiusSettings.tablet.checkOut,
        laptop: rangeMode === "checkin" ? deviceRadiusSettings.laptop.checkIn : deviceRadiusSettings.laptop.checkOut,
        desktop: rangeMode === "checkin" ? deviceRadiusSettings.desktop.checkIn : deviceRadiusSettings.desktop.checkOut,
      }
      proximityRadius =
        radiusByDevice[(deviceInfo.device_type as keyof typeof radiusByDevice) || "desktop"] ??
        (rangeMode === "checkin" ? deviceRadiusSettings.desktop.checkIn : deviceRadiusSettings.desktop.checkOut)
    } else {
      // Fallback to defaults if settings not loaded yet
      const isMobileLike = deviceInfo.isMobile || deviceInfo.isTablet
      if (isMobileLike) {
        proximityRadius = 400
      } else if (deviceInfo.isLaptop) {
        proximityRadius = rangeMode === "checkin" ? 700 : 500
      } else {
        proximityRadius = rangeMode === "checkin" ? 2000 : 1000
      }
    }

    const distancesArray = locations
      .map((loc) => ({
        location: loc,
        distance: calculateDistance(userLocation.latitude, userLocation.longitude, loc.latitude, loc.longitude),
        isInRange: false,
      }))
      .sort((a, b) => a.distance - b.distance)

    if (distancesArray.length > 0) {
      const nearest = distancesArray[0]
      nearest.isInRange = nearest.distance <= proximityRadius
      setNearestLocation(nearest)
      onRangeStatusChange?.({ resolved: true, inRange: nearest.isInRange })
    } else {
      onRangeStatusChange?.({ resolved: false, inRange: null })
    }
  }

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      // Add user agent header to comply with Nominatim usage policy
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'QCC-Attendance-App/1.0'
          }
        }
      )
      
      // Check if response is OK
      if (!response.ok) {
        console.error("[v0] Reverse geocoding failed with status:", response.status)
        // Use simple coordinates-based fallback
        const region = lat > 5.6 && lat < 5.7 ? "Greater Accra Region" : "Ghana"
        setDetectedArea(region)
        return
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        console.error("[v0] Reverse geocoding returned non-JSON response")
        const region = lat > 5.6 && lat < 5.7 ? "Greater Accra Region" : "Ghana"
        setDetectedArea(region)
        return
      }

      const data = await response.json()
      
      // Build a detailed address string with street name
      const addressParts = []
      
      if (data.address?.road) {
        addressParts.push(data.address.road)
      }
      
      if (data.address?.suburb || data.address?.neighbourhood) {
        addressParts.push(data.address.suburb || data.address.neighbourhood)
      } else if (data.address?.village || data.address?.town) {
        addressParts.push(data.address.village || data.address.town)
      }
      
      if (data.address?.city || data.address?.state) {
        addressParts.push(data.address.city || data.address.state)
      }
      
      const detailedAddress = addressParts.length > 0 ? addressParts.join(", ") : data.display_name || "Location detected"
      setDetectedArea(detailedAddress)
    } catch (error) {
      console.error("[v0] Failed to reverse geocode:", error)
      // Fallback to simple region based on coordinates
      const region = lat > 5.6 && lat < 5.7 ? "Greater Accra Region" : "Location detected"
      setDetectedArea(region)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadLocation()
    setIsRefreshing(false)
  }

  if (!userLocation) {
    return (
      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Navigation className="h-6 w-6 text-blue-600 dark:text-blue-400 animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-blue-900 dark:text-blue-100">Loading location...</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">Please wait</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Left Section - Current Location */}
          <div className="flex-1 p-4 sm:p-5 md:p-6 border-b lg:border-b-0 lg:border-r border-blue-200 dark:border-blue-800">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-blue-900 dark:text-blue-100 truncate">Your Location</h3>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Live GPS</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8 p-0 flex-shrink-0">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Detected Area</p>
                <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 leading-relaxed">{detectedArea || "Loading..."}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2.5 sm:p-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">GPS Accuracy</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">{Math.round(userLocation.accuracy)}m</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2.5 sm:p-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30 text-xs"
                  >
                    Active
                  </Badge>
                </div>
              </div>

              <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Coordinates</p>
                <p className="text-xs sm:text-sm font-mono text-gray-900 dark:text-gray-100 break-all">{userLocation.latitude.toFixed(6)}°, {userLocation.longitude.toFixed(6)}°</p>
              </div>
            </div>
          </div>

          {/* Right Section - Assigned Location & Nearest Location */}
          <div className="flex-1 p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4">
            {/* Assigned Location */}
            {assignedLocation && (
              <div>
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <h4 className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">Your Assigned Location</h4>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 sm:p-4 space-y-2">
                  <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{assignedLocation.name}</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div className="flex-1">
                      <span className="text-gray-600 dark:text-gray-400">Check-In: </span>
                      <span className="font-semibold text-blue-700 dark:text-blue-300">
                        {assignedLocation.check_in_start_time || "07:00"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <span className="text-gray-600 dark:text-gray-400">Check-Out: </span>
                      <span className="font-semibold text-blue-700 dark:text-blue-300">
                        {assignedLocation.check_out_end_time || "17:00"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Nearest Location */}
            {nearestLocation && (
              <div>
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <h4 className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">Nearest Location</h4>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{nearestLocation.location.name}</p>
                    {nearestLocation.isInRange ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30 flex items-center gap-1 text-xs flex-shrink-0">
                        <CheckCircle className="h-3 w-3" />
                        <span className="hidden sm:inline">Range</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30 flex items-center gap-1 text-xs flex-shrink-0">
                        <XCircle className="h-3 w-3" />
                        <span className="hidden sm:inline">Out</span>
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
