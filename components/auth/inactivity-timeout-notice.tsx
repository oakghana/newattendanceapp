"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { clearAllDataAndLogout } from "@/lib/cache-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const IDLE_TIMEOUT_MS = 30 * 60 * 1000
const WARNING_BEFORE_LOGOUT_MS = 5 * 60 * 1000
const ACTIVITY_KEY = "qcc_last_activity_at"
const ACTIVITY_WRITE_THROTTLE_MS = 5_000

function readLastActivity(): number {
  try {
    const stored = Number(window.localStorage.getItem(ACTIVITY_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : Date.now()
  } catch {
    return Date.now()
  }
}

export function InactivityTimeoutNotice() {
  const [warningVisible, setWarningVisible] = useState(false)
  const warningTimer = useRef<number | null>(null)
  const logoutTimer = useRef<number | null>(null)
  const lastWriteRef = useRef(0)
  const warningVisibleRef = useRef(false)
  warningVisibleRef.current = warningVisible

  useEffect(() => {
    let active = true

    const clearTimers = () => {
      if (warningTimer.current) window.clearTimeout(warningTimer.current)
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current)
    }

    const logoutForInactivity = async () => {
      if (!active) return
      // Activity in ANY open tab counts. Re-check the shared timestamp so an idle
      // background tab can never sign out a user who is working in another tab.
      if (Date.now() - readLastActivity() < IDLE_TIMEOUT_MS) {
        scheduleFromLastActivity()
        return
      }
      setWarningVisible(false)
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined)
      // "local" ends only this browser's session instead of revoking every
      // session the account has on other devices.
      await createClient().auth.signOut({ scope: "local" }).catch(() => undefined)
      await clearAllDataAndLogout().catch(() => undefined)
      window.location.href = "/auth/login?reason=inactivity"
    }

    function scheduleFromLastActivity() {
      clearTimers()
      const idleFor = Date.now() - readLastActivity()
      const untilLogout = Math.max(0, IDLE_TIMEOUT_MS - idleFor)
      const untilWarning = Math.max(0, untilLogout - WARNING_BEFORE_LOGOUT_MS)
      setWarningVisible(untilLogout <= WARNING_BEFORE_LOGOUT_MS)
      warningTimer.current = window.setTimeout(() => setWarningVisible(true), untilWarning)
      logoutTimer.current = window.setTimeout(() => void logoutForInactivity(), untilLogout)
    }

    const recordActivity = () => {
      const now = Date.now()
      if (now - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS && !warningVisibleRef.current) return
      lastWriteRef.current = now
      try {
        window.localStorage.setItem(ACTIVITY_KEY, String(now))
      } catch {
        // Storage can be unavailable (private mode); fall back to per-tab timing.
      }
      scheduleFromLastActivity()
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_KEY) scheduleFromLastActivity()
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleFromLastActivity()
    }

    const activityEvents = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"]
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }))
    window.addEventListener("storage", onStorage)
    document.addEventListener("visibilitychange", onVisible)

    // Opening or navigating within the app is itself activity.
    lastWriteRef.current = 0
    recordActivity()

    return () => {
      active = false
      clearTimers()
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity))
      window.removeEventListener("storage", onStorage)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  if (!warningVisible) return null

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl" role="status" aria-live="polite">
      <Alert>
        <AlertTriangle />
        <AlertTitle>You will be signed out in 5 minutes</AlertTitle>
        <AlertDescription>
          For your security, the app signs you out after 30 minutes without activity. Move your mouse, press a key, or use the app to stay signed in.
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function InactivityTimeoutPrompt() {
  return (
    <p className="sr-only">
      For your security, this app automatically signs you out after 30 minutes of inactivity.
    </p>
  )
}
