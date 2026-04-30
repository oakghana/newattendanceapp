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
    const reloadKey = "qcc:chunk-reload-attempted"

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

    const recover = () => {
      if (window.sessionStorage.getItem(reloadKey) === "1") {
        return
      }

      window.sessionStorage.setItem(reloadKey, "1")
      window.location.reload()
    }

    const handleError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error || event.message)) {
        recover()
      }
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        recover()
      }
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
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
