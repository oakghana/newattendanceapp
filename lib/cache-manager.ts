/**
 * Cache Manager Utility
 * Provides functions to clear browser cache, storage, and force app refresh
 * Optimized for production with minimal logging
 */

import { clearGeolocationCache } from "@/lib/geolocation"
import { clearLocationCache as clearFastLocationCache } from "@/lib/geolocation-fast"

const isDev = process.env.NODE_ENV === "development"

export async function clearAppCache(): Promise<void> {
  try {
    clearGeolocationCache()
    clearFastLocationCache()

    // 1. Clear all localStorage
    localStorage.clear()

    // 2. Clear all sessionStorage
    sessionStorage.clear()

    // 3. Clear IndexedDB (parallel execution for speed)
    const clearIndexedDB = async () => {
      if (window.indexedDB) {
        const databases = await window.indexedDB.databases()
        await Promise.all(
          databases
            .filter((db) => db.name)
            .map((db) => window.indexedDB.deleteDatabase(db.name!))
        )
      }
    }

    // 4. Clear Service Worker caches
    const clearCaches = async () => {
      if ("caches" in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      }
    }

    // 5. Unregister Service Workers
    const unregisterSW = async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }
    }

    // Execute all cleanup operations in parallel for speed
    await Promise.all([clearIndexedDB(), clearCaches(), unregisterSW()])

    if (isDev) console.log("[v0] Cache clearing completed")
  } catch (error) {
    if (isDev) console.error("[v0] Error clearing cache:", error)
    throw error
  }
}

export function forceReload(): void {
  // Use location.reload with forceGet to bypass cache
  window.location.reload()
}

export async function clearCacheAndReload(): Promise<void> {
  await clearAppCache()
  // Small delay to ensure cache clearing completes
  setTimeout(() => {
    forceReload()
  }, 500)
}

/**
 * Clear all cookies related to the attendance system
 * Optimized for performance with batch operations
 */
export function clearAllCookies(): void {
  try {
    const cookies = document.cookie.split(";")
    const domain = window.location.hostname
    const expiry = "expires=Thu, 01 Jan 1970 00:00:00 UTC"

    // Batch delete all cookies
    cookies.forEach((cookie) => {
      const eqPos = cookie.indexOf("=")
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim()
      
      // Delete for all possible paths/domains
      document.cookie = `${name}=; ${expiry}; path=/;`
      document.cookie = `${name}=; ${expiry}; path=/; domain=${domain}`
      document.cookie = `${name}=; ${expiry}; path=/; domain=.${domain}`
    })
  } catch (error) {
    if (isDev) console.error("[v0] Error clearing cookies:", error)
  }
}

/**
 * Clear all browser storage and logout user completely
 * Optimized for fast execution
 */
export async function clearAllDataAndLogout(): Promise<void> {
  try {
    // Execute in parallel for speed
    await Promise.all([
      clearAppCache(),
      Promise.resolve(clearAllCookies()),
    ])

    // Clear browser history
    try {
      window.history.replaceState(null, "", "/auth/login")
    } catch {
      // Silently fail - not critical
    }
  } catch (error) {
    if (isDev) console.error("[v0] Error in clearAllDataAndLogout:", error)
    throw error
  }
}
