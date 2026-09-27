"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0))
}

async function subscribe(registration: ServiceWorkerRegistration) {
  const response = await fetch("/api/notifications/push/subscribe")
  const { publicKey } = await response.json()
  if (!publicKey) return
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await fetch("/api/notifications/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  })
}

export function PushNotificationSetup() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    if (!supported) return

    let cancelled = false

    async function ensureSubscription() {
      const registration = await navigator.serviceWorker.register("/push-sw.js")

      // User explicitly blocked notifications - respect that, never nag again.
      if (Notification.permission === "denied") return

      if (Notification.permission === "granted") {
        // Already decided in the past. If the subscription got lost (e.g. expired
        // or cleared), quietly restore it in the background instead of showing
        // the prompt again.
        const existing = await registration.pushManager.getSubscription()
        if (!existing) {
          await subscribe(registration).catch(() => undefined)
        }
        return
      }

      // Permission has never been asked for on this device - offer the opt-in.
      if (!cancelled) setVisible(true)
    }

    void ensureSubscription().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  async function enableNotifications() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        // Denied or dismissed - hide the prompt either way, don't ask again this session.
        setVisible(false)
        return
      }
      const registration = await navigator.serviceWorker.ready
      await subscribe(registration)
      setVisible(false)
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={enableNotifications}
      disabled={busy}
      className="fixed bottom-5 right-5 z-50 gap-2 bg-background shadow-lg"
    >
      {busy ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {busy ? "Enabling…" : "Enable request alerts"}
    </Button>
  )
}
