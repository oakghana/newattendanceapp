"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, RefreshCw, Sparkles } from "lucide-react"

export function PWAUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const checkForUpdates = async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        setRegistration(reg)

        // Check for updates every 60 seconds
        setInterval(() => {
          reg.update()
        }, 60000)

        // Listen for new service worker waiting
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing

          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New service worker is ready to take over
                setShowUpdate(true)
              }
            })
          }
        })

        // Check if there's already a waiting service worker
        if (reg.waiting) {
          setShowUpdate(true)
        }
      } catch (error) {
        console.error("[PWA] Failed to check for updates:", error)
      }
    }

    // Listen for service worker activation messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "SW_ACTIVATED") {
        console.log("[PWA] New version activated:", event.data.version)
        // Reload the page to use the new version
        window.location.reload()
      }
    }

    const handleUpdateEvent = () => {
      setShowUpdate(true)
    }

    navigator.serviceWorker.addEventListener("message", handleMessage)
    window.addEventListener("pwa-update-available", handleUpdateEvent)
    checkForUpdates()

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage)
      window.removeEventListener("pwa-update-available", handleUpdateEvent)
    }
  }, [])

  useEffect(() => {
    if (!showUpdate) return
    const timer = setTimeout(() => setShowUpdate(false), 30_000)
    return () => clearTimeout(timer)
  }, [showUpdate])

  const handleUpdate = () => {
    if (registration?.waiting) {
      // Tell the waiting service worker to skip waiting
      registration.waiting.postMessage({ type: "SKIP_WAITING" })
      setShowUpdate(false)
    }
  }

  const handleDismiss = () => {
    setShowUpdate(false)
  }

  if (!showUpdate) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-5">
      <Card className="border-green-500 bg-card p-4 shadow-xl ring-2 ring-green-500/20">
        <div className="flex items-start gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500/10">
            <RefreshCw className="h-6 w-6 text-green-600 animate-spin" style={{ animationDuration: "3s" }} />
            <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-green-500 p-0 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-white" />
            </Badge>
          </div>
          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">New Update Available!</h3>
                <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-xs">
                  v.1.8. 14/10/25
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                A new version of QCC Attendance is ready. Update now to get the latest features, improvements, and bug
                fixes.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate} className="h-8 bg-green-600 hover:bg-green-700 text-white">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Update Now
              </Button>
              <Button size="sm" variant="outline" onClick={handleDismiss} className="h-8 bg-transparent">
                Remind Me Later
              </Button>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={handleDismiss} className="h-6 w-6 shrink-0 hover:bg-muted">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  )
}
