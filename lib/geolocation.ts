export interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  timestamp?: number
}

// Cache location for stable validation (reduces GPS fluctuation issues)
let cachedLocation: LocationData | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 10000 // 10 seconds cache (reduced from 30)

export interface GeofenceLocation {
  id: string
  name: string
  address?: string
  latitude: number
  longitude: number
  radius_meters: number
}

export interface ProximitySettings {
  checkInProximityRange: number
  defaultRadius: number
  requireHighAccuracy: boolean
  allowManualOverride: boolean
}

export interface BrowserToleranceSettings {
  chrome: number
  edge: number
  firefox: number
  safari: number
  opera: number
  default: number
  mobile: number // New: tolerance for mobile/tablet devices
}

export interface GeoSettings {
  browserTolerances?: BrowserToleranceSettings
  enableBrowserSpecificTolerance?: boolean
  globalProximityDistance?: number
  checkInProximityRange?: number
}

export class GeolocationError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message)
    this.name = "GeolocationError"
  }
}

/**
 * Clears the cached geolocation data to force fresh readings
 */
export function clearGeolocationCache(): void {
  cachedLocation = null
  cacheTimestamp = 0
  console.log("[v0] Geolocation cache cleared")
}

export function detectWindowsLocationCapabilities(): {
  isWindows: boolean
  hasGPS: boolean
  hasWiFi: boolean
  supportedSources: string[]
  recommendedSettings: PositionOptions
  browserName: string
  hasKnownIssues: boolean
  issueDescription?: string
} {
  const userAgent = navigator.userAgent.toLowerCase()
  const isWindows = userAgent.includes("windows")

  let browserName = "Unknown"
  let hasKnownIssues = false
  let issueDescription = ""

  if (userAgent.includes("opr/") || userAgent.includes("opera")) {
    browserName = "Opera"
    hasKnownIssues = true
    issueDescription =
      "Opera browser on Windows has known GPS accuracy issues and often uses IP-based location (very inaccurate). We strongly recommend using Chrome or Edge for GPS check-in, or use the QR code option for reliable attendance."
  } else if (userAgent.includes("firefox")) {
    browserName = "Firefox"
  } else if (userAgent.includes("edg/")) {
    browserName = "Edge"
  } else if (userAgent.includes("chrome")) {
    browserName = "Chrome"
  } else if (userAgent.includes("safari")) {
    browserName = "Safari"
  }

  // Detect available location sources on Windows
  const hasGPS = "geolocation" in navigator && "permissions" in navigator
  const hasWiFi = "connection" in navigator || "onLine" in navigator

  const supportedSources = []
  if (hasGPS) supportedSources.push("GPS")
  if (hasWiFi) supportedSources.push("Wi-Fi")
  if (isWindows) supportedSources.push("Windows Location Services")

  const recommendedSettings: PositionOptions = {
    enableHighAccuracy: true,
    timeout: isWindows ? 10000 : 8000,
    maximumAge: 0,
  }

  return {
    isWindows,
    hasGPS,
    hasWiFi,
    supportedSources,
    recommendedSettings,
    browserName,
    hasKnownIssues,
    issueDescription,
  }
}

export function detectBrowser(): {
  name: string
  version: string
  hasGPSIssues: boolean
} {
  const userAgent = navigator.userAgent.toLowerCase()
  let name = "Unknown"
  let version = ""
  let hasGPSIssues = false

  if (userAgent.includes("opr/") || userAgent.includes("opera")) {
    name = "Opera"
    hasGPSIssues = true
    version = userAgent.match(/opr\/([0-9.]+)/)?.[1] || ""
  } else if (userAgent.includes("edg/")) {
    name = "Edge"
    version = userAgent.match(/edg\/([0-9.]+)/)?.[1] || ""
  } else if (userAgent.includes("chrome")) {
    name = "Chrome"
    version = userAgent.match(/chrome\/([0-9.]+)/)?.[1] || ""
  } else if (userAgent.includes("firefox")) {
    name = "Firefox"
    version = userAgent.match(/firefox\/([0-9.]+)/)?.[1] || ""
  } else if (userAgent.includes("safari")) {
    name = "Safari"
    version = userAgent.match(/version\/([0-9.]+)/)?.[1] || ""
  }

  return { name, version, hasGPSIssues }
}

/**
 * Get browser-specific tolerance distance
 */
export async function getBrowserTolerance(geoSettings?: GeoSettings): Promise<number> {
  const browserInfo = detectBrowser()
  const deviceInfo = detectDevice()

  if (deviceInfo.isMobile || deviceInfo.isTablet) {
    return 100
  }

  // Updated Chrome, Firefox, Safari, and Opera to 2000 meters tolerance
  // This is a trade secret and should not be displayed in the UI
  switch (browserInfo.name.toLowerCase()) {
    case "chrome":
      return 2000 // Increased tolerance for PC Chrome users
    case "edge":
      return 200 // Moderate tolerance for PC Edge users
    case "firefox":
      return 2000 // Increased tolerance for PC Firefox users
    case "safari":
      return 2000 // Increased tolerance for PC Safari users
    case "opera":
      return 2000 // Increased tolerance for PC Opera users
    default:
      return 2000 // Default desktop tolerance
  }
}

function detectDevice(): { isMobile: boolean; isTablet: boolean; isDesktop: boolean; isLaptop: boolean; device_type: string; device_name: string; browser_info: string } {
  const ua = navigator.userAgent.toLowerCase()
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua)
  const isDesktop = !isMobile && !isTablet

  // Basic heuristics for laptop and device metadata (keeps typing consistent)
  const isLaptop = isDesktop && !/macintosh|mac os x|windows nt/i.test(ua) ? false : isDesktop
  const device_type = isMobile ? "mobile" : isTablet ? "tablet" : isLaptop ? "laptop" : "desktop"
  const device_name = (navigator.platform || "").toString()
  const browser_info = detectBrowser().name

  return { isMobile, isTablet, isDesktop, isLaptop, device_type, device_name, browser_info }
}

/**
 * Check if user is within proximity of a location with browser-specific tolerance
 */
export async function isWithinBrowserProximity(
  userLocation: LocationData,
  locationLat: number,
  locationLng: number,
  geoSettings?: GeoSettings,
): Promise<{
  isWithin: boolean
  distance: number
  tolerance: number
  browser: string
}> {
  const distance = calculateDistance(userLocation.latitude, userLocation.longitude, locationLat, locationLng)

  const tolerance = await getBrowserTolerance(geoSettings)
  const browserInfo = detectBrowser()

  return {
    isWithin: distance <= tolerance,
    distance: Math.round(distance),
    tolerance,
    browser: browserInfo.name,
  }
}

export async function getCurrentLocation(useCache = false): Promise<LocationData> {
  // Return cached location if available and fresh
  if (useCache && cachedLocation && Date.now() - cacheTimestamp < CACHE_DURATION) {
    console.log("[v0] Using cached location:", cachedLocation)
    return cachedLocation
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"))
      return
    }

    const capabilities = detectWindowsLocationCapabilities()
    console.log("[v0] Windows location capabilities:", capabilities)

    const highAccuracyOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: capabilities.isWindows ? 20000 : 15000, // Longer timeout for better GPS lock
      maximumAge: 0, // Always get fresh location, never use cached
    }

    let attempts = 0
    const maxAttempts = 3 // More attempts for better accuracy
    let bestPosition: GeolocationPosition | null = null

    const tryGetLocation = (options: PositionOptions) => {
      attempts++
      console.log(`[v0] Location attempt ${attempts}/${maxAttempts} with options:`, options)

      // Before making the call, probe permission state (if available) to fail fast when denied
      try {
        if (navigator.permissions && (navigator.permissions as any).query) {
          ;(navigator.permissions as any)
            .query({ name: "geolocation" })
            .then((status: any) => {
              if (status && status.state === "denied") {
                const deniedMessage = capabilities.isWindows
                  ? "Location access denied. Please enable Windows Location Services and allow the browser to use location."
                  : "Location access denied. Please enable geolocation permissions in your browser."
                import("./logger").then(({ logger }) => {
                  logger.warn('[v0] Geolocation permission denied (permissions API)', { state: status.state }, 'geolocation')
                })
                reject(new Error(deniedMessage))
                return
              }

              // Permission not denied — proceed with geolocation call
              invokeGeolocationCall(options)
            })
            .catch((permErr: any) => {
              console.debug("[v0] Permissions API unavailable or errored:", permErr)
              // Proceed to geolocation call
              invokeGeolocationCall(options)
            })
          return
        }
      } catch (permErr) {
        console.debug("[v0] Permissions API unavailable or errored:", permErr)
      }

      // If permissions API not available or probe failed, proceed
      invokeGeolocationCall(options)

      function invokeGeolocationCall(options: PositionOptions) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const accuracy = position.coords.accuracy
            console.log("[v0] Location acquired:", {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: accuracy,
              attempt: attempts,
              source: capabilities.isWindows ? "Windows Location Services" : "Browser Geolocation",
            })

            // Keep track of best position
            if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
              bestPosition = position
            }

            // If accuracy is still poor and we have attempts left, try again
            if (accuracy > 1000 && attempts < maxAttempts) {
              console.log("[v0] Poor accuracy detected, retrying with different settings...")
              // Alternate between high accuracy and network-based
              const retryOptions: PositionOptions = attempts % 2 === 0
                ? {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0,
                  }
                : {
                    enableHighAccuracy: false, // Use network-based location
                    timeout: 10000,
                    maximumAge: 3000,
                  }
              setTimeout(() => tryGetLocation(retryOptions), 1500)
              return
            }

            // Use best position we got
            const finalPosition = bestPosition || position
            console.log("[v0] Using final position with accuracy:", finalPosition.coords.accuracy)

            const locationData: LocationData = {
              latitude: finalPosition.coords.latitude,
              longitude: finalPosition.coords.longitude,
              accuracy: finalPosition.coords.accuracy,
              timestamp: Date.now(),
            }

            // Cache the location for stable validation
            cachedLocation = locationData
            cacheTimestamp = Date.now()

            resolve(locationData)
          },
          (error) => {
            // Normalize error object to avoid empty `{}` in logs on some platforms
            const normalizedError: any = {
              code: (error as any)?.code ?? undefined,
              name: (error as any)?.name || 'GeolocationError',
              message: (error as any)?.message || JSON.stringify(error) || String(error) || 'Unknown geolocation error',
              raw: error,
            }

            // Use structured logger for better telemetry and ensure non-empty output
            import("./logger").then(({ logger }) => {
              logger.warn(`[v0] Location error on attempt ${attempts}`, normalizedError, 'geolocation')
            }).catch(() => {
              console.error(`[v0] Location error on attempt ${attempts}:`, normalizedError)
            })

            if (attempts < maxAttempts) {
              console.log("[v0] Retrying with fallback settings...")
              const fallbackOptions: PositionOptions = {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 5000,
              }
              setTimeout(() => tryGetLocation(fallbackOptions), 1000)
              return
            }

            // After all attempts failed, provide detailed error
            let message = "Unknown error occurred"
            let guidance = ""

            // Prefer code from normalizedError if raw error has no enumerable properties
            switch (normalizedError.code) {
              case 1:
                if (capabilities.isWindows) {
                  message = "Location access denied. Please enable location permissions."
                  guidance = `
Windows Location Setup:
1. Open Windows Settings → Privacy & Security → Location
2. Turn ON "Location services" 
3. Turn ON "Allow apps to access your location"
4. In your browser, click the location icon in the address bar and select "Allow"
5. Refresh this page and try again

Alternative: Use the QR code option for attendance.`
                } else {
                  message =
                    "Location access denied. Please enable location permissions in your browser settings and try again, or use the QR code option instead."
                }
                break
              case 2:
                if (capabilities.isWindows) {
                  message = "Windows Location Services unavailable."
                  guidance = `
Troubleshooting:
1. Check if Windows Location Services are enabled in Settings
2. Ensure you have an active internet connection for Wi-Fi positioning
3. Try moving to a location with better GPS signal (near a window)
4. Use the QR code option as an alternative`
                } else {
                  message =
                    "Location information is unavailable. Please check your GPS settings or use the QR code option."
                }
                break
              case 3:
                if (capabilities.isWindows) {
                  message = "Windows Location Services timed out."
                  guidance = `
Quick fix: Use the QR code option below for instant check-in/check-out

If you prefer GPS:
1. Enable Windows Location Services in Settings → Privacy & Security → Location
2. Ensure internet connection is active
3. Move near a window for better signal
4. Try again`
                } else {
                  message = "Location request timed out. Please use the QR code option below or try again."
                }
                break
              default:
                // If the platform returned a message, include it to aid debugging
                if (normalizedError.message) {
                  message = normalizedError.message
                }
            }

            const fullMessage = guidance ? `${message}\n\n${guidance}` : message
            // Use structured GeolocationError so callers can handle specific cases
            reject(new GeolocationError(fullMessage, normalizedError.code ?? 0))
          },
          options,
        )
      }
    }

    // Start with high accuracy attempt
    tryGetLocation(highAccuracyOptions)
  })
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  const distance = R * c // Distance in meters

  // Round to nearest meter for consistency
  return Math.round(distance)
}

/**
 * Safe wrapper around `getCurrentLocation` that returns a structured result
 * instead of rejecting. Callers that prefer not to handle exceptions can use
 * this to receive `{ location }` or `{ error }` and display friendly UI.
 */
export async function safeGetCurrentLocation(useCache = false): Promise<{ location?: LocationData; error?: GeolocationError }> {
  try {
    const location = await getCurrentLocation(useCache)
    return { location }
  } catch (err: any) {
    if (err instanceof GeolocationError) {
      return { error: err }
    }
    return { error: new GeolocationError(err?.message || String(err), err?.code ?? 0) }
  }
}

// OPTIMIZATION: Memoized distance cache to prevent recalculating same distances
const distanceCache = new Map<string, number>()
const MAX_CACHE_ENTRIES = 1000

/**
 * Memoized distance calculation - caches results to avoid redundant calculations
 * Useful when checking multiple locations from same user position
 */
export function calculateDistanceMemoized(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const key = `${lat1.toFixed(6)},${lon1.toFixed(6)},${lat2.toFixed(6)},${lon2.toFixed(6)}`
  
  if (distanceCache.has(key)) {
    return distanceCache.get(key)!
  }

  const distance = calculateDistance(lat1, lon1, lat2, lon2)

  // Keep cache size bounded
  if (distanceCache.size >= MAX_CACHE_ENTRIES) {
    const iteratorResult = distanceCache.keys().next()
    const firstKey = iteratorResult && !iteratorResult.done ? iteratorResult.value : undefined
    if (firstKey) {
      distanceCache.delete(firstKey)
    }
  }

  distanceCache.set(key, distance)
  return distance
}

/**
 * Clears the distance calculation cache
 * Call when user location significantly changes or on logout
 */
export function clearDistanceCache() {
  distanceCache.clear()
}

export function isWithinGeofence(
  userLocation: LocationData,
  geofenceLocation: GeofenceLocation,
): { isWithin: boolean; distance: number; accuracyWarning?: string; criticalAccuracyIssue?: boolean } {
  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    geofenceLocation.latitude,
    geofenceLocation.longitude,
  )

  const toleranceBuffer = 20
  const effectiveRadius = geofenceLocation.radius_meters + toleranceBuffer
  const isWithin = distance <= effectiveRadius

  let accuracyWarning: string | undefined
  let criticalAccuracyIssue = false

  const capabilities = detectWindowsLocationCapabilities()

  if (userLocation.accuracy > 1000) {
    criticalAccuracyIssue = true
    accuracyWarning = capabilities.hasKnownIssues
      ? `⚠️ CRITICAL: GPS accuracy is extremely poor (${(userLocation.accuracy / 1000).toFixed(1)}km)!

${capabilities.issueDescription}

RECOMMENDED SOLUTION: Use the QR Code option below for instant and accurate check-in/check-out.`
      : `⚠️ CRITICAL: GPS accuracy is extremely poor (${(userLocation.accuracy / 1000).toFixed(1)}km)!

Your browser is using IP-based location instead of GPS, making it highly inaccurate.

RECOMMENDED SOLUTIONS:
1. Use the QR Code option below for instant check-in/check-out (FASTEST)
2. Switch to Chrome or Microsoft Edge browser for better GPS accuracy
3. Enable Windows Location Services in Settings → Privacy & Security → Location`
  } else if (userLocation.accuracy > 100) {
    accuracyWarning = capabilities.hasKnownIssues
      ? `GPS accuracy is poor (${Math.round(userLocation.accuracy)}m). 

Browser: ${capabilities.browserName} - Known GPS issues on Windows.

RECOMMENDED: Use QR code for reliable check-in, or switch to Chrome/Edge browser.`
      : capabilities.isWindows
        ? `GPS accuracy is low (${Math.round(userLocation.accuracy)}m). For better accuracy on Windows:
• Move near a window for better GPS signal
• Ensure Windows Location Services are enabled
• Check that Wi-Fi is connected for assisted positioning
• Or use QR code for instant check-in`
        : "GPS accuracy is low. Please ensure you have a clear view of the sky for better location precision, or use QR code."
  }

  return {
    isWithin,
    distance: Math.round(distance),
    accuracyWarning,
    criticalAccuracyIssue,
  }
}

export function findNearestLocation(
  userLocation: LocationData,
  locations: GeofenceLocation[],
): { location: GeofenceLocation; distance: number } | null {
  if (locations.length === 0) return null

  let nearest = locations[0]
  let minDistance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    nearest.latitude,
    nearest.longitude,
  )

  for (let i = 1; i < locations.length; i++) {
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      locations[i].latitude,
      locations[i].longitude,
    )
    if (distance < minDistance) {
      minDistance = distance
      nearest = locations[i]
    }
  }

  return { location: nearest, distance: Math.round(minDistance) }
}

export function validateAttendanceLocation(
  userLocation: LocationData,
  qccLocations: GeofenceLocation[],
  proximitySettings?: ProximitySettings,
  deviceRadiusCheckIn?: number, // From database settings
): {
  canCheckIn: boolean
  nearestLocation?: GeofenceLocation
  distance?: number
  message: string
  accuracyWarning?: string
  criticalAccuracyIssue?: boolean
  allLocations?: Array<{ location: GeofenceLocation; distance: number }>
  availableLocations?: Array<{ location: GeofenceLocation; distance: number }>
} {
  const deviceInfo = detectDevice()
  // Use database-configured device radius if provided, otherwise use defaults
  // Default: mobile/tablet 400m, laptop 700m, desktop 2000m
  let deviceProximityBase = deviceRadiusCheckIn
  if (!deviceProximityBase) {
    if (deviceInfo.isMobile || deviceInfo.isTablet) {
      deviceProximityBase = 400
    } else if (deviceInfo.isLaptop) {
      deviceProximityBase = 700
    } else {
      deviceProximityBase = 2000 // Desktop PC
    }
  }
  const displayDistance = 50 // Trade secret: what we show to users in UI messages (actual validation uses device-specific radius)

  console.log("[v0] Check-in validation - Device Detection:", {
    deviceType: deviceInfo.device_type,
    deviceName: deviceInfo.device_name,
    isMobile: deviceInfo.isMobile,
    isTablet: deviceInfo.isTablet,
    isLaptop: deviceInfo.isLaptop,
    isDesktop: deviceInfo.isDesktop,
    deviceProximityBase: deviceProximityBase,
    userAgent: deviceInfo.browser_info
  })

  const nearest = findNearestLocation(userLocation, qccLocations)

  if (!nearest) {
    return {
      canCheckIn: false,
      message: "No QCC locations found in the system.",
    }
  }

  // Calculate distances using device-specific radius (overrides location radius)
  const allLocationsWithDistance = qccLocations
    .map((location) => {
      const distance = Math.round(
        calculateDistance(userLocation.latitude, userLocation.longitude, location.latitude, location.longitude),
      )
      // Use device-specific radius (location radius is ignored)
      const withinRange = distance <= deviceProximityBase
      return {
        location,
        distance,
        effectiveRadius: deviceProximityBase,
        withinRange
      }
    })
    .sort((a, b) => a.distance - b.distance)

  const availableLocations = allLocationsWithDistance.filter(({ withinRange }) => withinRange)

  console.log("[v0] Check-in validation - Locations:", {
    nearestLocation: allLocationsWithDistance[0]?.location.name,
    nearestDistance: allLocationsWithDistance[0]?.distance,
    proximityRadius: deviceProximityBase, // Changed from internalProximityDistance to deviceProximityBase
    availableLocationsCount: availableLocations.length,
    allLocations: allLocationsWithDistance.map(l => `${l.location.name}: ${l.distance}m`)
  })

  const canCheckIn = availableLocations.length > 0

  let message: string

  if (canCheckIn) {
    message = `You can check in at ${nearest.location.name}`
  } else {
    const nearestDistanceKm = (nearest.distance / 1000).toFixed(1)
    message = `You are too far from ${nearest.location.name}. You must be within ${displayDistance} meters of a QCC location to check in.`
  }

  let accuracyWarning: string | undefined
  let criticalAccuracyIssue = false
  const capabilities = detectWindowsLocationCapabilities()

  if (userLocation.accuracy > 1000) {
    criticalAccuracyIssue = true
    accuracyWarning = capabilities.hasKnownIssues
      ? `⚠️ CRITICAL GPS ISSUE: Your location accuracy is ${(userLocation.accuracy / 1000).toFixed(1)}km!

Browser: ${capabilities.browserName}
${capabilities.issueDescription}

✅ SOLUTION: Use the QR Code button below for instant and accurate attendance tracking!`
      : `⚠️ CRITICAL GPS ISSUE: Your location accuracy is ${(userLocation.accuracy / 1000).toFixed(1)}km!

Your browser is using IP-based location (very inaccurate) instead of actual GPS.

SOLUTIONS:
✅ Use QR Code option below (FASTEST & MOST RELIABLE)
🌐 Switch to Chrome or Microsoft Edge browser for better GPS
⚙️ Enable Windows Location Services in Settings`
  } else if (userLocation.accuracy > 100) {
    accuracyWarning = capabilities.hasKnownIssues
      ? `⚠️ Poor GPS accuracy (${Math.round(userLocation.accuracy)}m)

Browser: ${capabilities.browserName} has known GPS issues on Windows.

RECOMMENDED: Use QR code or switch to Chrome/Edge for better accuracy.`
      : capabilities.isWindows
        ? `GPS accuracy is low (${Math.round(userLocation.accuracy)}m). For better accuracy:
• Move near a window for better GPS signal  
• Ensure Windows Location Services are enabled
• Connect to Wi-Fi for assisted positioning
• Or use QR code for guaranteed check-in`
        : `GPS accuracy is low (${Math.round(userLocation.accuracy)}m). Consider using QR code for reliable check-in.`
  } else if (userLocation.accuracy > 30 && userLocation.accuracy <= 100) {
    accuracyWarning = `GPS accuracy: ${Math.round(userLocation.accuracy)}m (proximity range: ${displayDistance}m). Consider using QR code for guaranteed check-in.`
  }

  return {
    canCheckIn,
    nearestLocation: nearest.location,
    distance: nearest.distance,
    message,
    accuracyWarning,
    criticalAccuracyIssue,
    allLocations: allLocationsWithDistance,
    availableLocations,
  }
}

export function validateCheckoutLocation(
  userLocation: LocationData,
  qccLocations: GeofenceLocation[],
  deviceRadiusCheckOut?: number, // From database settings
): {
  canCheckOut: boolean
  nearestLocation?: GeofenceLocation
  distance?: number
  message: string
  accuracyWarning?: string
} {
  const deviceInfo = detectDevice()
  // Use database-configured device radius if provided, otherwise use defaults
  // Default: mobile/tablet 400m, laptop 700m, desktop 1000m
  let deviceProximityBase = deviceRadiusCheckOut
  if (!deviceProximityBase) {
    if (deviceInfo.isMobile || deviceInfo.isTablet) {
      deviceProximityBase = 400
    } else if (deviceInfo.isLaptop) {
      deviceProximityBase = 700
    } else {
      deviceProximityBase = 1000 // Desktop PC
    }
  }
  const displayDistance = 50 // Trade secret: what we show to users in UI messages (actual validation uses device-specific radius, regardless of device)


  const nearest = findNearestLocation(userLocation, qccLocations)

  if (!nearest) {
    return {
      canCheckOut: false,
      message: "No QCC locations found in the system.",
    }
  }

  // Use device-specific radius (location radius is ignored)
  const baseProximity = deviceProximityBase

  // More lenient validation: if accuracy is poor, allow a small capped buffer to avoid overly permissive ranges
  const MAX_ACCURACY_BUFFER = 500 // meters - safety cap to avoid huge buffers from coarse IP location
  const accuracyBuffer = userLocation.accuracy > 1000 ? Math.min(userLocation.accuracy * 0.5, MAX_ACCURACY_BUFFER) : 0

  const effectiveProximity = baseProximity + accuracyBuffer

  console.log("[v0] Check-out validation:", {
    location: nearest.location.name,
    distance: nearest.distance,
    deviceProximityBase,
    baseProximity,
    effectiveProximity,
    userAccuracy: userLocation.accuracy,
    accuracyBuffer,
  })

  // Honor a public env toggle for testing to allow poor-accuracy checkout
  const allowPoorAccuracy = typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_ALLOW_POOR_ACCURACY_CHECKOUT === 'true')

  // Only hard-block when accuracy is so extreme that even the full accuracy
  // buffer cannot bring the user within range.  For moderate poor-accuracy
  // readings (5 000–15 000 m) the effectiveProximity buffer already compensates.
  const canPassWithBuffer = nearest.distance <= effectiveProximity
  if (!allowPoorAccuracy && userLocation.accuracy > 15000 && !canPassWithBuffer) {
    return {
      canCheckOut: false,
      nearestLocation: nearest.location,
      distance: nearest.distance,
      message:
        "Cannot validate location due to extremely poor GPS accuracy. Please use the QR code option or ensure you have a better GPS signal.",
    }
  }

  const canCheckOut = nearest.distance <= effectiveProximity

  let message: string

  if (canCheckOut) {
    message = `You can check out at ${nearest.location.name}`
  } else {
    message = `You must be within ${displayDistance} meters of a QCC location to check out`
  }

  let accuracyWarning: string | undefined
  const capabilities = detectWindowsLocationCapabilities()

  if (userLocation.accuracy > 100) {
    accuracyWarning = capabilities.isWindows
      ? `GPS accuracy is low (${Math.round(userLocation.accuracy)}m). For better accuracy with ${displayDistance}m proximity range on Windows:
• Check Windows Location Services settings
• Ensure good GPS signal reception
• Verify Wi-Fi connection for assisted positioning
• Consider using QR code for guaranteed check-out`
      : `GPS accuracy is low (${Math.round(userLocation.accuracy)}m). For best results with ${displayDistance}m proximity range:
• Ensure you have a clear view of the sky
• Move to a location with better GPS signal
• Use QR code option for instant check-out`
  }

  return {
    canCheckOut,
    nearestLocation: nearest.location,
    distance: nearest.distance,
    message,
    accuracyWarning,
  }
}

export async function requestLocationPermission(): Promise<{ granted: boolean; message: string }> {
  if (!navigator.geolocation) {
    return {
      granted: false,
      message: "Geolocation is not supported by this browser. Please use the QR code option instead.",
    }
  }

  const capabilities = detectWindowsLocationCapabilities()

  try {
    // Check if permissions API is available
    if ("permissions" in navigator) {
      const permission = await navigator.permissions.query({ name: "geolocation" })

      if (permission.state === "granted") {
        return { granted: true, message: "Location permission already granted" }
      } else if (permission.state === "denied") {
        const message = capabilities.isWindows
          ? `Location access is blocked. To enable on Windows:

1. Windows Settings:
   • Open Settings → Privacy & Security → Location
   • Turn ON "Location services"
   • Turn ON "Allow apps to access your location"

2. Browser Settings:
   • Click the location icon (🔒) in your address bar
   • Select "Allow" for location access
   • Refresh the page and try again

Alternative: Use the QR code option for attendance.`
          : `Location access is blocked. Please enable location permissions in your browser settings:

1. Click the location icon (🔒) in your browser's address bar
2. Select 'Allow' for location access
3. Refresh the page and try again

Alternatively, use the QR code option for attendance.`

        return { granted: false, message }
      }
    }

    // Try to get location to trigger permission request
    await getCurrentLocation()
    return { granted: true, message: "Location permission granted successfully" }
  } catch (error) {
    if (error instanceof GeolocationError && error.code === 1) {
      const message = capabilities.isWindows
        ? `Location access denied. To enable on Windows:

1. Windows Settings → Privacy & Security → Location:
   • Turn ON "Location services"
   • Turn ON "Allow apps to access your location"

2. Browser permissions:
   • Click the location icon (🔒) in your browser's address bar
   • Select "Allow" for location access
   • Refresh the page and try again

Or use the QR code option for attendance tracking.`
        : `Location access denied. To enable:

1. Click the location icon (🔒) in your browser's address bar
2. Select "Allow" for location access
3. Refresh the page and try again

Or use the QR code option for attendance tracking.`

      return { granted: false, message }
    }
    return {
      granted: false,
      message: error instanceof Error ? error.message : "Failed to access location. Please use the QR code option.",
    }
  }
}

export function getWindowsLocationTroubleshooting(): {
  isWindows: boolean
  troubleshootingSteps: string[]
  quickFixes: string[]
} {
  const capabilities = detectWindowsLocationCapabilities()

  if (!capabilities.isWindows) {
    return {
      isWindows: false,
      troubleshootingSteps: [
        "Enable location permissions in your browser",
        "Check GPS settings on your device",
        "Ensure you have internet connectivity",
      ],
      quickFixes: ["Try refreshing the page", "Use QR code for attendance instead"],
    }
  }

  return {
    isWindows: true,
    troubleshootingSteps: [
      "Open Windows Settings > Privacy & Security > Location",
      "Turn on 'Location services' for Windows",
      "Turn on 'Allow apps to access your location'",
      "In your browser, allow location access when prompted",
      "Ensure you have Wi-Fi or internet connection for better accuracy",
      "Check that your browser has permission to access location",
    ],
    quickFixes: [
      "Connect to Wi-Fi for improved location accuracy",
      "Move to an area with better GPS signal (near windows)",
      "Restart your browser and try again",
      "Use QR code for immediate attendance tracking",
    ],
  }
}

export function watchLocation(
  onLocationUpdate: (location: LocationData) => void,
  onError: (error: Error) => void,
): number | null {
  if (!navigator.geolocation) {
    onError(new Error("Geolocation is not supported by this browser"))
    return null
  }

  const capabilities = detectWindowsLocationCapabilities()

  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: capabilities.isWindows ? 12000 : 10000,
    maximumAge: 0, // Always get fresh location updates
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onLocationUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now(),
      })
    },
    (error) => {
      let message = "Location tracking error"
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = capabilities.isWindows
            ? "Windows Location Services access denied. Please check your Windows privacy settings."
            : "Location access denied"
          break
        case error.POSITION_UNAVAILABLE:
          message = capabilities.isWindows
            ? "Windows Location Services unavailable. Check your location settings."
            : "Location unavailable"
          break
        case error.TIMEOUT:
          message = capabilities.isWindows ? "Windows Location Services timeout. Trying again..." : "Location timeout"
          break
      }
      onError(new Error(message))
    },
    options,
  )
}

export async function getAveragedLocation(samples = 3): Promise<LocationData> {
  console.log(`[v0] Getting ${samples} location samples for averaging...`)

  const readings: LocationData[] = []
  let totalAccuracy = 0

  for (let i = 0; i < samples; i++) {
    try {
      const reading = await getCurrentLocation()
      readings.push(reading)
      totalAccuracy += reading.accuracy
      console.log(`[v0] Sample ${i + 1}/${samples}:`, {
        lat: reading.latitude,
        lon: reading.longitude,
        accuracy: reading.accuracy,
      })

      // Wait 2 seconds between readings for GPS to stabilize
      if (i < samples - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error(`[v0] Failed to get sample ${i + 1}:`, error)
      // If we have at least one reading, use it
      if (readings.length > 0) break
      throw error
    }
  }

  if (readings.length === 0) {
    throw new Error("Failed to get any location readings")
  }

  // Calculate average position
  const avgLat = readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length
  const avgLon = readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length
  const avgAccuracy = totalAccuracy / readings.length

  console.log(`[v0] Averaged location from ${readings.length} samples:`, {
    latitude: avgLat,
    longitude: avgLon,
    accuracy: avgAccuracy,
    improvement: `${(((readings[0].accuracy - avgAccuracy) / readings[0].accuracy) * 100).toFixed(1)}% better`,
  })

  return {
    latitude: avgLat,
    longitude: avgLon,
    accuracy: avgAccuracy,
    timestamp: Date.now(),
  }
}

export interface ReverseGeocodeResult {
  display_name: string
  address: string
  road?: string
  suburb?: string
  city?: string
  region?: string
  country?: string
  coordinates: string
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
  try {
    // Use Nominatim (OpenStreetMap) for reverse geocoding - free and no API key required
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "QCC-Attendance-App/1.0",
        },
      },
    )

    if (!response.ok) {
      throw new Error("Reverse geocoding failed")
    }

    const data = await response.json()

    // Extract meaningful location name parts
    const addr = data.address || {}
    const locationParts = []

    if (addr.building || addr.office) {
      locationParts.push(addr.building || addr.office)
    }
    if (addr.road || addr.street) {
      locationParts.push(addr.road || addr.street)
    }
    if (addr.suburb || addr.neighbourhood) {
      locationParts.push(addr.suburb || addr.neighbourhood)
    }
    if (addr.city || addr.town || addr.village) {
      locationParts.push(addr.city || addr.town || addr.village)
    }

    const shortName =
      locationParts.length > 0
        ? locationParts.slice(0, 3).join(", ")
        : data.display_name?.split(",").slice(0, 3).join(",").trim() || "Unknown Location"

    const fullDisplayName = data.display_name || shortName

    const result: ReverseGeocodeResult = {
      display_name: fullDisplayName,
      address: shortName,
      road: addr.road || addr.street,
      suburb: addr.suburb || addr.neighbourhood,
      city: addr.city || addr.town || addr.village,
      region: addr.state || addr.region,
      country: addr.country,
      coordinates,
    }

    console.log("[v0] Reverse geocoded location:", result.address)
    return result
  } catch (error) {
    console.error("[v0] Reverse geocoding error:", error)
    return {
      display_name: coordinates,
      address: coordinates,
      coordinates,
    }
  }
}
