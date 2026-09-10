"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Navigation, Clock, RefreshCw, CheckCircle, XCircle } from "lucide-react"
import { getCurrentLocation, calculateDistance } from "@/lib/geolocation"
import { getDeviceInfo } from "@/lib/device-info"
import { useDeviceRadiusSettings } from "@/hooks/use-device-radius-settings"
import type { GeofenceLocation } from "@/types/geofence"

interface AdminLocationsOverviewProps {
  locations: GeofenceLocation[]
}

interface LocationWithDistance extends GeofenceLocation {
  distance: number
  isInRange: boolean
  formattedDistance: string
}

export function AdminLocationsOverview({ locations }: AdminLocationsOverviewProps) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(
    null,
  )
  const [detectedArea, setDetectedArea] = useState<string>("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [locationsWithDistance, setLocationsWithDistance] = useState<LocationWithDistance[]>([])
  const { settings: deviceRadiusSettings } = useDeviceRadiusSettings()

  useEffect(() => {
    loadLocation()
  }, [])

  useEffect(() => {
    if (userLocation && locations.length > 0) {
      calculateDistances()
    }
  }, [userLocation, locations, deviceRadiusSettings])

  const loadLocation = async () => {
    try {
      const location = await getCurrentLocation()
      setUserLocation(location)
      reverseGeocode(location.latitude, location.longitude)
    } catch (error) {
      // Permission denial / GPS unavailable is an expected user state, not an app error.
      console.warn("[v0] Failed to load location:", error)
    }
  }

  const calculateDistances = () => {
    if (!userLocation) return

    const deviceInfo = getDeviceInfo()
    // Use admin-configured device radius settings for CHECKOUT consistency
    let proximityRadius = 100 // Fallback default
    if (deviceRadiusSettings) {
      if (deviceInfo.device_type === "mobile") {
        proximityRadius = deviceRadiusSettings.mobile.checkOut
      } else if (deviceInfo.device_type === "tablet") {
        proximityRadius = deviceRadiusSettings.tablet.checkOut
      } else if (deviceInfo.device_type === "laptop") {
        proximityRadius = deviceRadiusSettings.laptop.checkOut
      } else if (deviceInfo.device_type === "desktop") {
        proximityRadius = deviceRadiusSettings.desktop.checkOut
      }
    } else {
      // Fallback to defaults if settings not loaded yet
      if (deviceInfo.isMobile || deviceInfo.isTablet) {
        proximityRadius = 400
      } else if (deviceInfo.isLaptop) {
        proximityRadius = 500
      } else {
        proximityRadius = 1000 // Desktop checkout radius
      }
    }

    const locationsWithDist: LocationWithDistance[] = locations
      .map((loc) => {
        const distance = calculateDistance(userLocation.latitude, userLocation.longitude, loc.latitude, loc.longitude)
        const isInRange = distance <= proximityRadius
        const formattedDistance = distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(2)}km`

        return {
          ...loc,
          distance,
          isInRange,
          formattedDistance,
        }
      })
      .sort((a, b) => a.distance - b.distance)

    setLocationsWithDistance(locationsWithDist)
  }

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      )
      const data = await response.json()

      const addressParts = []
      if (data.address?.road) addressParts.push(data.address.road)
      if (data.address?.suburb || data.address?.neighbourhood) {
        addressParts.push(data.address.suburb || data.address.neighbourhood)
      } else if (data.address?.village || data.address?.town) {
        addressParts.push(data.address.village || data.address.town)
      }
      if (data.address?.city || data.address?.state) {
        addressParts.push(data.address.city || data.address.state)
      }

      const detailedAddress = addressParts.length > 0 ? addressParts.join(", ") : data.display_name || "Unknown Location"
      setDetectedArea(detailedAddress)
    } catch (error) {
      console.error("[v0] Failed to reverse geocode:", error)
      setDetectedArea("Location detected")
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadLocation()
    setIsRefreshing(false)
  }

  if (!userLocation) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-3">
            <Navigation className="h-6 w-6 text-blue-600 animate-pulse" />
            <p className="font-semibold text-gray-900 dark:text-gray-100">Loading your location...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Admin Current Location Card */}
      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-blue-900 dark:text-blue-100">Your Current Location</CardTitle>
                <p className="text-sm text-blue-700 dark:text-blue-300">Live GPS tracking</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Detected Area</p>
            <p className="text-base font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
              {detectedArea || "Loading..."}
            </p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">GPS Accuracy: </span>
                <span className="font-semibold">{Math.round(userLocation.accuracy)}m</span>
              </div>
              <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30">
                Active
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Locations with Distances */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Navigation className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>All QCC Locations</CardTitle>
              <p className="text-sm text-muted-foreground">Distances from your current position</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locationsWithDistance.map((location) => (
              <Card
                key={location.id}
                className={`overflow-hidden transition-all hover:shadow-md ${
                  location.isInRange
                    ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{location.name}</h3>
                      {location.isInRange ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30 flex items-center gap-1 w-fit">
                          <CheckCircle className="h-3 w-3" />
                          Within Range
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/30 flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" />
                          Out of Range
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Navigation className="h-4 w-4" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">{location.formattedDistance}</span>
                      <span className="text-xs">away</span>
                    </div>

                    {(location.check_in_start_time || location.check_out_end_time) && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Clock className="h-4 w-4" />
                        <div className="text-xs">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {location.check_in_start_time || "07:00"}
                          </span>
                          {" - "}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {location.check_out_end_time || "17:00"}
                          </span>
                        </div>
                      </div>
                    )}

                    {location.address && (
                      <div className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="text-xs line-clamp-2">{location.address}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {locationsWithDistance.length === 0 && (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 dark:text-gray-400">No locations found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
