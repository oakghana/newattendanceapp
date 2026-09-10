"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import type { LocationData } from "@/lib/geolocation"

interface LocationWatchOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
  onLocationChange?: (location: LocationData) => void
  onError?: (error: GeolocationPositionError) => void
}

export function useLocationWatch({
  enableHighAccuracy = false,
  timeout = 8000,
  maximumAge = 3000,
  onLocationChange,
  onError,
}: LocationWatchOptions) {
  const [location, setLocation] = useState<LocationData | null>(null)
  const [isWatching, setIsWatching] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const lastLocationRef = useRef<LocationData | null>(null)
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }
    setIsWatching(false)
  }, [])

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      onError?.(new Error("Geolocation not supported") as unknown as GeolocationPositionError)
      return
    }

    if (watchIdRef.current !== null) {
      return // Already watching
    }

    setIsWatching(true)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
          speed: position.coords.speed,
          heading: position.coords.heading,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
        }

        // Only update if location has changed significantly (>10 meters)
        if (!lastLocationRef.current || getDistance(lastLocationRef.current, newLocation) > 10) {
          // Debounce updates to at most every 500ms
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current)
          }

          updateTimeoutRef.current = setTimeout(() => {
            lastLocationRef.current = newLocation
            setLocation(newLocation)
            onLocationChange?.(newLocation)
          }, 100)
        }
      },
      (error) => {
        // Permission denial / GPS unavailable is an expected user state, not an app error.
        console.warn("[v0] Location watch error:", error)
        onError?.(error)
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    )
  }, [enableHighAccuracy, timeout, maximumAge, onLocationChange, onError])

  useEffect(() => {
    return () => {
      stopWatching()
    }
  }, [stopWatching])

  return {
    location,
    isWatching,
    startWatching,
    stopWatching,
  }
}

// Helper function to calculate distance between two coordinates (simplified Haversine)
function getDistance(loc1: LocationData, loc2: LocationData): number {
  const R = 6371e3 // Radius of Earth in meters
  const φ1 = (loc1.latitude * Math.PI) / 180
  const φ2 = (loc2.latitude * Math.PI) / 180
  const Δφ = ((loc2.latitude - loc1.latitude) * Math.PI) / 180
  const Δλ = ((loc2.longitude - loc1.longitude) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}
