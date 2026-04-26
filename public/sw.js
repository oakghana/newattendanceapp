const APP_VERSION = "1.9.1"
const CACHE_VERSION = "2026-04-25"
const STATIC_CACHE = `qcc-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `qcc-dynamic-${CACHE_VERSION}`

const CACHE_EXPIRATION_TIME = 5 * 60 * 1000 // 5 minutes in milliseconds

const STATIC_ASSETS = [
  "/auth/login",
  "/images/qcc-logo.png",
  "/manifest.json",
]

const NO_CACHE_ENDPOINTS = [
  "/api/attendance/check-in",
  "/api/attendance/check-out",
  "/api/attendance/personal",
  "/api/attendance/today", // Added to ensure fresh attendance data
  "/api/admin/users",
  "/api/admin/reports",
  "/api/admin/analytics",
  "/api/admin/audit-logs",
  "/api/auth/",
  "/api/settings",
]

self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker version:", APP_VERSION)
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching static assets")
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log("[SW] Static assets cached successfully")
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error("[SW] Failed to cache static assets:", error)
      }),
  )
})

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker version:", APP_VERSION)
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("[SW] Deleting old cache:", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log("[SW] Clearing dynamic cache for fresh start")
        return caches.delete(DYNAMIC_CACHE)
      })
      .then(() => {
        console.log("[SW] Service worker activated")
        return self.clients.claim()
      })
      .then(() => {
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "SW_ACTIVATED",
              version: APP_VERSION,
              timestamp: Date.now(),
            })
          })
        })
      }),
  )
})

function isCacheExpired(cachedResponse) {
  if (!cachedResponse) return true

  const cachedDate = cachedResponse.headers.get("sw-cache-date")
  if (!cachedDate) return true

  const cacheTime = new Date(cachedDate).getTime()
  const now = Date.now()

  return now - cacheTime > CACHE_EXPIRATION_TIME
}

function shouldNotCache(url) {
  return NO_CACHE_ENDPOINTS.some((endpoint) => url.pathname.includes(endpoint))
}

function isNextAssetRequest(url) {
  return url.pathname.startsWith("/_next/")
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests and external URLs
  if (request.method !== "GET" || !url.origin.includes(self.location.origin)) {
    return
  }

  // Always prefer the network for app shell and route navigation pages.
  // This prevents old cached HTML from referencing deleted chunk files.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return (
              cachedResponse ||
              caches.match("/auth/login") ||
              new Response("<html><body><h1>Offline</h1><p>You are currently offline.</p></body></html>", {
                headers: { "Content-Type": "text/html" },
              })
            )
          })
        }),
    )
    return
  }

  // Next.js runtime/chunk assets must be network-first to avoid stale chunk mismatch
  // after deployments (e.g. failed to load /_next/static/chunks/*.js).
  if (isNextAssetRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request).then((cachedResponse) => {
          return (
            cachedResponse ||
            new Response("Asset unavailable", {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
            })
          )
        })
      }),
    )
    return
  }

  if (url.pathname.startsWith("/api/")) {
    if (shouldNotCache(url)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const headers = new Headers(response.headers)
            headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
            headers.set("Pragma", "no-cache")
            headers.set("Expires", "0")

            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers,
            })
          })
          .catch(() => {
            return new Response(
              JSON.stringify({
                error: "Network Error",
                message: "Unable to connect. Please check your internet connection and try again.",
              }),
              {
                status: 503,
                statusText: "Service Unavailable",
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                },
              },
            )
          }),
      )
      return
    }

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              const headers = new Headers(responseClone.headers)
              headers.set("sw-cache-date", new Date().toISOString())

              const cachedResponse = new Response(responseClone.body, {
                status: responseClone.status,
                statusText: responseClone.statusText,
                headers: headers,
              })

              cache.put(request, cachedResponse)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse && !isCacheExpired(cachedResponse)) {
              console.log("[SW] Serving cached API response (offline mode)")
              return cachedResponse
            }

            return new Response(
              JSON.stringify({
                error: "Offline",
                message: "You are currently offline. Please try again when connected.",
              }),
              {
                status: 503,
                statusText: "Service Unavailable",
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                },
              },
            )
          })
        }),
    )
    return
  }

  // Handle static assets with cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          throw new Error("Network error and no cached response available")
        })
    }),
  )
})

self.addEventListener("sync", (event) => {
  console.log("[v0] [SW] Background sync triggered:", event.tag)

  if (event.tag === "attendance-sync") {
    event.waitUntil(syncAttendanceData())
  }

  if (event.tag === "location-sync") {
    event.waitUntil(syncLocationData())
  }

  if (event.tag === "proximity-sync") {
    event.waitUntil(syncProximitySettings())
  }
})

self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received")

  const options = {
    body: event.data ? event.data.text() : "New notification from QCC Attendance",
    icon: "/images/qcc-logo.png",
    badge: "/images/qcc-logo.png",
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "view",
        title: "View",
        icon: "/images/qcc-logo.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/images/qcc-logo.png",
      },
    ],
  }

  event.waitUntil(self.registration.showNotification("QCC Attendance", options))
})

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action)

  event.notification.close()

  if (event.action === "view") {
    event.waitUntil(clients.openWindow("/dashboard"))
  }
})

async function syncAttendanceData() {
  try {
    console.log("[SW] Syncing attendance data...")

    // Get pending attendance records from IndexedDB
    const pendingRecords = await getPendingAttendanceRecords()

    for (const record of pendingRecords) {
      try {
        const response = await fetch("/api/attendance/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(record),
        })

        if (response.ok) {
          await removePendingAttendanceRecord(record.id)
          console.log("[SW] Synced attendance record:", record.id)
        }
      } catch (error) {
        console.error("[SW] Failed to sync attendance record:", error)
      }
    }
  } catch (error) {
    console.error("[SW] Background sync failed:", error)
  }
}

async function getPendingAttendanceRecords() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("QCCAttendance", 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(["pendingAttendance"], "readonly")
      const store = transaction.objectStore("pendingAttendance")
      const getAllRequest = store.getAll()

      getAllRequest.onsuccess = () => resolve(getAllRequest.result)
      getAllRequest.onerror = () => reject(getAllRequest.error)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains("pendingAttendance")) {
        db.createObjectStore("pendingAttendance", { keyPath: "id" })
      }
    }
  })
}

async function removePendingAttendanceRecord(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("QCCAttendance", 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(["pendingAttendance"], "readwrite")
      const store = transaction.objectStore("pendingAttendance")
      const deleteRequest = store.delete(id)

      deleteRequest.onsuccess = () => resolve()
      deleteRequest.onerror = () => reject(deleteRequest.error)
    }
  })
}

async function syncLocationData() {
  try {
    console.log("[v0] [SW] Syncing location data...")

    const response = await fetch("/api/attendance/user-location")
    if (response.ok) {
      const result = await response.json()

      if (result.success && result.data) {
        const locations = result.data

        // Cache the location data for offline access
        const cache = await caches.open(DYNAMIC_CACHE)
        await cache.put(
          "/api/attendance/user-location",
          new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          }),
        )

        console.log("[v0] [SW] Location data synced and cached:", locations.length, "locations")

        // Notify all clients about location updates with enhanced data
        const clients = await self.clients.matchAll()
        clients.forEach((client) => {
          client.postMessage({
            type: "LOCATION_UPDATE",
            data: locations,
            timestamp: Date.now(),
            user_role: result.user_role,
            assigned_location_only: result.assigned_location_only,
          })
        })
      }
    }
  } catch (error) {
    console.error("[v0] [SW] Location sync failed:", error)
  }
}

async function syncProximitySettings() {
  try {
    console.log("[v0] [SW] Syncing proximity settings...")

    const response = await fetch("/api/settings")
    if (response.ok) {
      const settings = await response.json()

      // Cache the settings data for offline access
      const cache = await caches.open(DYNAMIC_CACHE)
      await cache.put(
        "/api/settings",
        new Response(JSON.stringify(settings), {
          headers: { "Content-Type": "application/json" },
        }),
      )

      console.log("[v0] [SW] Proximity settings synced and cached")

      // Notify all clients about proximity settings updates
      const clients = await self.clients.matchAll()
      clients.forEach((client) => {
        client.postMessage({
          type: "PROXIMITY_UPDATE",
          data: settings,
          timestamp: Date.now(),
        })
      })
    }
  } catch (error) {
    console.error("[v0] [SW] Proximity settings sync failed:", error)
  }
}
