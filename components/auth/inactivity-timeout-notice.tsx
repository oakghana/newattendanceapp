"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { clearAllDataAndLogout } from "@/lib/cache-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const IDLE_TIMEOUT_MS = 4 * 60 * 1000
const WARNING_TIMEOUT_MS = 3 * 60 * 1000 // warn with one minute remaining before the four-minute logout

export function InactivityTimeoutNotice() {
  const [warningVisible, setWarningVisible] = useState(false)
  const warningTimer = useRef<number | null>(null)
  const logoutTimer = useRef<number | null>(null)

  useEffect(() => {
    let active = true

    const logoutForInactivity = async () => {
      if (!active) return
      setWarningVisible(false)
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined)
      await createClient().auth.signOut().catch(() => undefined)
      await clearAllDataAndLogout().catch(() => undefined)
      window.location.href = "/auth/login?reason=inactivity"
    }

    const resetIdleTimers = () => {
      setWarningVisible(false)
      if (warningTimer.current) window.clearTimeout(warningTimer.current)
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current)
      warningTimer.current = window.setTimeout(() => setWarningVisible(true), WARNING_TIMEOUT_MS)
      logoutTimer.current = window.setTimeout(() => void logoutForInactivity(), IDLE_TIMEOUT_MS)
    }

    const activityEvents = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"]
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdleTimers, { passive: true }))
    resetIdleTimers()

    return () => {
      active = false
      if (warningTimer.current) window.clearTimeout(warningTimer.current)
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimers))
    }
  }, [])

  if (!warningVisible) return null

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl" role="status" aria-live="polite">
      <Alert>
        <AlertTriangle />
        <AlertTitle>You will be signed out in 1 minute</AlertTitle>
        <AlertDescription>
          For your security, the app signs you out after 4 minutes without activity. Move your mouse, press a key, or use the app to stay signed in.
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function InactivityTimeoutPrompt() {
  return (
    <p className="sr-only">
      For your security, this app automatically signs you out after 4 minutes of inactivity.
    </p>
  )
}
