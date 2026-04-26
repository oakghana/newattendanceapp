"use client"

import { useEffect } from "react"

export function PWAServiceWorker() {
  useEffect(() => {
    const isPreview =
      window.location.hostname.includes("vusercontent.net") ||
      window.location.hostname.includes("localhost") ||
      process.env.NODE_ENV === "development"

    if (isPreview) {
      console.log("[PWA] Preview/development environment detected, cleaning old service workers and skipping registration")

      const cleanupPreviewCaches = async () => {
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations()
            await Promise.all(registrations.map((registration) => registration.unregister()))
          }

          if ("caches" in window) {
            const cacheKeys = await caches.keys()
            await Promise.all(cacheKeys.map((key) => caches.delete(key)))
          }
        } catch (error) {
          console.warn("[PWA] Failed to cleanup preview service worker/cache state:", error)
        }
      }

      void cleanupPreviewCaches()
      return
    }

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const setupPWAEvents = () => {
        // Handle beforeinstallprompt event globally
        const handleBeforeInstallPrompt = (e: Event) => {
          console.log("[PWA] beforeinstallprompt event captured globally")
          e.preventDefault()
          // Store the event globally for components to access
          ;(window as any).deferredPrompt = e

          // Dispatch custom event for components to listen to
          window.dispatchEvent(new CustomEvent("pwa-install-available", { detail: e }))
        }

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

        // Handle app installed event
        const handleAppInstalled = () => {
          console.log("[PWA] App was installed successfully")
          ;(window as any).deferredPrompt = null

          // Dispatch custom event
          window.dispatchEvent(new CustomEvent("pwa-installed"))
        }

        window.addEventListener("appinstalled", handleAppInstalled)

        const handleOnline = () => {
          console.log("[PWA] App is online")
          window.dispatchEvent(new CustomEvent("pwa-online"))

          if (navigator.serviceWorker.controller && "sync" in window.ServiceWorkerRegistration.prototype) {
            navigator.serviceWorker.ready
              .then((registration) => {
                // Register multiple sync events with correct tags that match the service worker
                const syncPromises = [
                  registration.sync.register("location-sync").catch((error) => {
                    console.warn("[PWA] Failed to register location-sync:", error.message)
                  }),
                  registration.sync.register("attendance-sync").catch((error) => {
                    console.warn("[PWA] Failed to register attendance-sync:", error.message)
                  }),
                  registration.sync.register("proximity-sync").catch((error) => {
                    console.warn("[PWA] Failed to register proximity-sync:", error.message)
                  }),
                ]

                return Promise.allSettled(syncPromises)
              })
              .then((results) => {
                const successful = results.filter((result) => result.status === "fulfilled").length
                console.log(`[PWA] Registered ${successful}/${results.length} sync events on online`)
              })
              .catch((error) => {
                console.warn("[PWA] Failed to register sync events on online:", error.message)
              })
          }
        }

        const handleOffline = () => {
          console.log("[PWA] App is offline")
          window.dispatchEvent(new CustomEvent("pwa-offline"))
        }

        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)

        const handleControllerChange = () => {
          console.log("[PWA] Service worker controller changed, reloading page")
          window.location.reload()
        }

        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange)

        return () => {
          window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
          window.removeEventListener("appinstalled", handleAppInstalled)
          window.removeEventListener("online", handleOnline)
          window.removeEventListener("offline", handleOffline)
          navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
        }
      }

      const registerServiceWorker = async () => {
        try {
          console.log("[PWA] Registering service worker...")

          const swResponse = await fetch("/sw.js", { method: "HEAD" })
          if (!swResponse.ok || !swResponse.headers.get("content-type")?.includes("javascript")) {
            console.warn("[PWA] Service worker file not accessible or wrong MIME type, skipping registration")
            return
          }

          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
          })

          console.log("[PWA] Service Worker registered successfully:", registration)

          registration.addEventListener("updatefound", () => {
            console.log("[PWA] Service Worker update found")
            const newWorker = registration.installing

            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                console.log("[PWA] New service worker state:", newWorker.state)
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[PWA] New service worker installed and ready")
                  // Dispatch custom event for update notification component
                  window.dispatchEvent(new CustomEvent("pwa-update-available"))
                }
              })
            }
          })

          setInterval(
            () => {
              registration.update()
            },
            5 * 60 * 1000,
          )

          navigator.serviceWorker.addEventListener("message", (event) => {
            console.log("[PWA] Message from service worker:", event.data)

            if (event.data.type === "LOCATION_UPDATE") {
              console.log("[PWA] Location data updated:", event.data.data?.length, "locations")
              // Dispatch custom event for components to listen to
              window.dispatchEvent(
                new CustomEvent("location-updated", {
                  detail: {
                    locations: event.data.data,
                    timestamp: event.data.timestamp,
                    userRole: event.data.user_role,
                  },
                }),
              )
            }

            if (event.data.type === "PROXIMITY_UPDATE") {
              console.log("[PWA] Proximity settings updated")
              // Dispatch custom event for components to listen to
              window.dispatchEvent(
                new CustomEvent("proximity-updated", {
                  detail: {
                    settings: event.data.data,
                    timestamp: event.data.timestamp,
                  },
                }),
              )
            }
          })

          if ("sync" in window.ServiceWorkerRegistration.prototype) {
            console.log("[PWA] Background sync supported")

            try {
              // Register initial sync events with correct tags
              const syncPromises = [
                registration.sync.register("location-sync").catch((error) => {
                  console.warn("[PWA] Failed to register initial location-sync:", error.message)
                }),
                registration.sync.register("attendance-sync").catch((error) => {
                  console.warn("[PWA] Failed to register initial attendance-sync:", error.message)
                }),
                registration.sync.register("proximity-sync").catch((error) => {
                  console.warn("[PWA] Failed to register initial proximity-sync:", error.message)
                }),
              ]

              const results = await Promise.allSettled(syncPromises)
              const successful = results.filter((result) => result.status === "fulfilled").length
              console.log(`[PWA] Registered ${successful}/${results.length} initial sync events`)
            } catch (error) {
              console.warn("[PWA] Failed to register initial sync events:", error.message)
            }
          } else {
            console.log("[PWA] Background sync not supported in this environment")
          }

          // Request persistent storage for offline functionality
          if ("storage" in navigator && "persist" in navigator.storage) {
            const persistent = await navigator.storage.persist()
            console.log("[PWA] Persistent storage:", persistent)
          }
        } catch (error) {
          console.error("[PWA] Service Worker registration failed:", error)
        }
      }

      const initializePWA = () => {
        registerServiceWorker()
        return setupPWAEvents()
      }

      // Register service worker after page load
      if (document.readyState === "complete") {
        const cleanup = initializePWA()
        return cleanup
      } else {
        let cleanup: (() => void) | undefined
        const handleLoad = () => {
          cleanup = initializePWA()
        }
        window.addEventListener("load", handleLoad)

        return () => {
          window.removeEventListener("load", handleLoad)
          if (cleanup) cleanup()
        }
      }
    }
  }, [])

  return null
}
