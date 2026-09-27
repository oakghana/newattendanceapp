"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0))
}

export function PushNotificationSetup() {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)
    void navigator.serviceWorker?.register("/push-sw.js").then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription()
      setEnabled(Boolean(subscription))
    }).catch(() => undefined)
  }, [])

  async function enableNotifications() {
    if (!supported) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") return
      const response = await fetch("/api/notifications/push/subscribe")
      const { publicKey } = await response.json()
      if (!publicKey) return
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
      await fetch("/api/notifications/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) })
      setEnabled(true)
    } finally {
      setBusy(false)
    }
  }

  if (!supported || enabled) return null
  return (
    <Button type="button" variant="outline" size="sm" onClick={enableNotifications} disabled={busy} className="fixed bottom-5 right-5 z-50 gap-2 bg-background shadow-lg">
      {busy ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {busy ? "Enabling…" : "Enable request alerts"}
    </Button>
  )
}
