"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

interface Location {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  radius_meters: number
  district_id?: string
  is_active: boolean
  check_in_start_time?: string | null
  check_out_end_time?: string | null
  require_early_checkout_reason?: boolean
  working_hours_description?: string | null
}

export function useRealTimeLocations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isAssignedLocationOnly, setIsAssignedLocationOnly] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now())

  const supabase = createClient()

  const fetchLocations = useCallback(async () => {
    const MAX_RETRIES = 2
    let attempt = 0

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("Offline")
      setLoading(false)
      return
    }

    while (attempt <= MAX_RETRIES) {
      try {
        console.log("[v0] Real-time locations - Fetching locations (attempt)", attempt + 1)
        const response = await fetch("/api/attendance/user-location", { credentials: "same-origin" })

        // Try to parse body safely
        let result: any = {}
        try {
          result = await response.json()
        } catch (e) {
          console.warn("[v0] Real-time locations - failed to parse response JSON", e)
        }

        if (response.ok && result.success) {
          console.log("[v0] Real-time locations - Fetched", result.data?.length, "locations")
          setLocations(result.data || [])
          setUserRole(result.user_role)
          setIsAssignedLocationOnly(result.assigned_location_only || false)
          setError(null)
          setLastUpdate(Date.now())
          return
        }

        // Handle authentication / authorization specially
        if (response.status === 401) {
          console.warn("[v0] Real-time locations - Unauthenticated (401). User session may have expired.")
          setError("Not authenticated — please sign in again")
          setLocations([])
          return
        }

        if (response.status === 403) {
          console.warn("[v0] Real-time locations - Access forbidden (403)")
          setError("Location access restricted to administrators")
          setLocations([])
          return
        }

        if (response.status === 404) {
          setError("User profile not found. Please contact your administrator.")
          setLocations([])
          return
        }

        // Other non-OK responses — surface server message if present
        const errMsg = result?.error || result?.message || `HTTP ${response.status}`
        if (String(errMsg).toLowerCase() === "offline") {
          console.warn("[v0] Real-time locations - Offline")
        } else {
          console.error("[v0] Real-time locations - Fetch error:", errMsg)
        }
        setError(errMsg)
        setLocations([])
        return
      } catch (err: any) {
        const message = err?.message || err
        if (String(message).toLowerCase() === "offline") {
          setError("Offline")
          setLocations([])
          break
        }
        console.error("[v0] Real-time locations - Exception while fetching locations:", message)
        attempt += 1
        if (attempt > MAX_RETRIES) {
          setError("Failed to fetch locations — network or server error")
          setLocations([])
          break
        }
        // small backoff
        await new Promise((res) => setTimeout(res, 500 * attempt))
      } finally {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Initial fetch
    fetchLocations()

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "LOCATION_UPDATE") {
        console.log("[v0] Real-time locations - Service worker update received")
        setLocations(event.data.data || [])
        setUserRole(event.data.user_role)
        setIsAssignedLocationOnly(event.data.assigned_location_only || false)
        setLastUpdate(event.data.timestamp || Date.now())
      }

      if (event.data?.type === "PROXIMITY_UPDATE") {
        console.log("[v0] Real-time locations - Proximity settings updated")
        // Trigger a location refetch to get updated proximity settings
        fetchLocations()
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage)
    }

    let channel: any = null
    let retryCount = 0
    const maxRetries = 3

    const setupSubscription = () => {
      try {
        channel = supabase
          .channel("locations_realtime")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "geofence_locations",
            },
            (payload) => {
              console.log(
                "[v0] Real-time locations - Change detected:",
                payload.eventType,
                payload.new?.name || payload.old?.name,
              )

              // Always refetch locations when changes occur
              fetchLocations()

              if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready
                  .then((registration) => {
                    if (registration.sync) {
                      return registration.sync.register("location-sync")
                    }
                  })
                  .catch((error) => {
                    console.warn("[v0] Failed to register location sync (non-critical):", error)
                  })
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "app_settings",
            },
            (payload) => {
              console.log("[v0] Real-time locations - Settings change detected:", payload.eventType)

              if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready
                  .then((registration) => {
                    if (registration.sync) {
                      return registration.sync.register("proximity-sync")
                    }
                  })
                  .catch((error) => {
                    console.warn("[v0] Failed to register proximity sync (non-critical):", error)
                  })
              }
            },
          )
          .subscribe((status) => {
            console.log("[v0] Real-time locations - Subscription status:", status)
            setIsConnected(status === "SUBSCRIBED")

            if (status === "CHANNEL_ERROR" && retryCount < maxRetries) {
              retryCount++
              console.log(`[v0] Real-time locations - Retrying subscription (${retryCount}/${maxRetries})`)
              setTimeout(() => {
                if (channel) {
                  supabase.removeChannel(channel)
                }
                setupSubscription()
              }, 2000 * retryCount)
            } else if (status === "CLOSED" && retryCount < maxRetries) {
              retryCount++
              console.log(`[v0] Real-time locations - Connection closed, retrying (${retryCount}/${maxRetries})`)
              setTimeout(() => {
                setupSubscription()
              }, 1000 * retryCount)
            }
          })
      } catch (error) {
        console.error("[v0] Real-time locations - Subscription setup error:", error)
        setIsConnected(false)
      }
    }

    const subscriptionTimeout = setTimeout(() => {
      setupSubscription()
    }, 1000)

    return () => {
      console.log("[v0] Real-time locations - Cleaning up subscription")
      clearTimeout(subscriptionTimeout)

      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch (error) {
          console.warn("[v0] Error removing channel:", error)
        }
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage)
      }
    }
  }, [fetchLocations, supabase])

  return {
    locations,
    loading,
    error,
    isConnected,
    userRole,
    isAssignedLocationOnly,
    lastUpdate,
    refetch: fetchLocations,
  }
}
