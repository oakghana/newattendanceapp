"use client"

import type React from "react"
import { useEffect } from "react"
import { NotificationProvider } from "@/components/ui/notification-system"
import { TimeBasedThemeProvider } from "@/components/theme/time-based-theme-provider"
import { PWAComponents } from "./pwa-components"
import { Toaster as AppToaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    const reloadStateKey = "qcc:chunk-reload-state-v2"
    const maxRecoveryAttempts = 3
    const recoveryWindowMs = 5 * 60 * 1000

    const isChunkLoadFailure = (value: unknown) => {
      const message = String(
        (value as { message?: string })?.message ||
          (value as { reason?: { message?: string } })?.reason?.message ||
          value ||
          "",
      )

      return (
        message.includes("ChunkLoadError") ||
        message.includes("Loading chunk") ||
        message.includes("Failed to load chunk") ||
        message.includes("/_next/static/chunks/")
      )
    }

    const recover = async () => {
      const now = Date.now()
      const rawState = window.sessionStorage.getItem(reloadStateKey)
      let parsedState: { attempts: number; firstAt: number } | null = null
      if (rawState) {
        try {
          parsedState = JSON.parse(rawState) as { attempts: number; firstAt: number }
        } catch {
          parsedState = null
        }
      }
      const inWindow = !!parsedState && now - parsedState.firstAt < recoveryWindowMs
      const attempts = inWindow ? parsedState.attempts : 0

      if (attempts >= maxRecoveryAttempts) {
        return
      }

      const nextState = {
        attempts: attempts + 1,
        firstAt: inWindow && parsedState ? parsedState.firstAt : now,
      }
      window.sessionStorage.setItem(reloadStateKey, JSON.stringify(nextState))

      try {
        if (typeof window !== "undefined" && "caches" in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((registration) => registration.unregister()))
        }
      } catch {
        // Ignore cache clear failures and continue with reload.
      }

      const url = new URL(window.location.href)
      url.searchParams.set("chunkRecover", String(nextState.attempts))
      window.location.replace(url.toString())
    }

    const handleError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error || event.message)) {
        void recover()
      }
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        void recover()
      }
    }

    const clearRecoveryState = window.setTimeout(() => {
      window.sessionStorage.removeItem(reloadStateKey)
    }, 15_000)

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
      window.clearTimeout(clearRecoveryState)
    }
  }, [])

  return (
    <TimeBasedThemeProvider>
      <NotificationProvider>{children}</NotificationProvider>
      <PWAComponents />
      <AppToaster />
      <SonnerToaster richColors closeButton position="top-right" />
    </TimeBasedThemeProvider>
  )
}
