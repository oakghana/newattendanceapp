"use client"

import { useState, useEffect } from "react"

interface PWAState {
  isInstalled: boolean
  isOnline: boolean
  canInstall: boolean
  installPrompt: any
  serviceWorkerReady: boolean
}

export function usePWA() {
  const [pwaState, setPWAState] = useState<PWAState>({
    isInstalled: false,
    isOnline: true,
    canInstall: false,
    installPrompt: null,
    serviceWorkerReady: false,
  })

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true

      setPWAState((prev) => ({ ...prev, isInstalled: isStandalone }))
    }

    const updateOnlineStatus = () => {
      setPWAState((prev) => ({ ...prev, isOnline: navigator.onLine }))
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setPWAState((prev) => ({
        ...prev,
        canInstall: true,
        installPrompt: e,
      }))
    }

    const handleAppInstalled = () => {
      setPWAState((prev) => ({
        ...prev,
        isInstalled: true,
        canInstall: false,
        installPrompt: null,
      }))
    }

    const registerServiceWorker = async () => {
      if ("serviceWorker" in navigator) {
        try {
          // First check if the service worker file exists
          const swResponse = await fetch("/sw.js", { method: "HEAD" })
          if (!swResponse.ok) {
            console.warn("[PWA] Service Worker file not accessible, skipping registration")
            return
          }

          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
          })

          console.log("[PWA] Service Worker registered successfully:", registration)
          setPWAState((prev) => ({ ...prev, serviceWorkerReady: true }))

          // Listen for updates
          registration.addEventListener("updatefound", () => {
            console.log("[PWA] Service Worker update found")
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("[PWA] New service worker installed, refresh recommended")
                }
              })
            }
          })
        } catch (error) {
          console.warn("[PWA] Service Worker registration failed, continuing without SW:", error)
          // Don't throw error, just continue without service worker
          setPWAState((prev) => ({ ...prev, serviceWorkerReady: false }))
        }
      } else {
        console.warn("[PWA] Service Workers not supported in this browser")
      }
    }

    checkInstalled()
    updateOnlineStatus()
    registerServiceWorker()

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)
    window.addEventListener("online", updateOnlineStatus)
    window.addEventListener("offline", updateOnlineStatus)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
      window.removeEventListener("online", updateOnlineStatus)
      window.removeEventListener("offline", updateOnlineStatus)
    }
  }, [])

  const installApp = async () => {
    if (pwaState.installPrompt) {
      try {
        await pwaState.installPrompt.prompt()
        const { outcome } = await pwaState.installPrompt.userChoice
        console.log("[PWA] Install outcome:", outcome)

        setPWAState((prev) => ({
          ...prev,
          canInstall: false,
          installPrompt: null,
        }))
      } catch (error) {
        console.error("[PWA] Install failed:", error)
      }
    } else {
      console.log("[PWA] No install prompt available, showing manual instructions")
      const userAgent = navigator.userAgent.toLowerCase()
      const instructions = /android/.test(userAgent)
        ? "Android (Chrome): Tap the menu (⋮) → 'Install app' or 'Add to Home screen' → 'Install'"
        : /iphone|ipad|ipod/.test(userAgent)
          ? "iPhone/iPad (Safari): Tap Share → 'Add to Home Screen' → 'Add'"
          : "Chrome/Edge: Click the menu (⋮) → 'Install app'\nSafari: Click Share → 'Add to Home Screen'\nFirefox: Click the menu → 'Install'"

      alert(`To install QCC Attendance:\n\n${instructions}`)
    }
  }

  return {
    ...pwaState,
    installApp,
  }
}
