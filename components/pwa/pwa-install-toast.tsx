"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Download, X } from "lucide-react"
import { usePWA } from "@/hooks/use-pwa"

export function PWAInstallToast() {
  const [isVisible, setIsVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const { canInstall, isInstalled, installPrompt } = usePWA()

  useEffect(() => {
    // Check if user has already dismissed or installed
    const hasSeenToast = localStorage.getItem("pwa-toast-dismissed")
    
    if (hasSeenToast || isInstalled) {
      setDismissed(true)
      return
    }

    // Show toast after a brief delay for better UX
    const showTimer = setTimeout(() => {
      setIsVisible(true)
    }, 1000)

    // Auto-hide after ~30 seconds to give users enough time to act
    const hideTimer = setTimeout(() => {
      setIsVisible(false)
    }, 31_000) // 1s delay + 30s visible

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [isInstalled])

  const handleInstall = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt()
        const { outcome } = await installPrompt.userChoice
        if (outcome === "accepted") {
          localStorage.setItem("pwa-toast-dismissed", "true")
          setIsVisible(false)
        }
      } catch (error) {
        console.error("Install error:", error)
      }
    } else {
      // Show manual install instructions for iOS/Safari
      alert(
        "To install this app:\n\n" +
        "📱 iPhone/iPad: Tap the Share button, then 'Add to Home Screen'\n\n" +
        "💻 Desktop Chrome: Click the install icon (⊕) in the address bar\n\n" +
        "🖥️ Desktop Edge: Click (...) menu → Apps → Install this site as an app"
      )
    }
  }

  const handleDismiss = () => {
    localStorage.setItem("pwa-toast-dismissed", "true")
    setIsVisible(false)
    setDismissed(true)
  }

  // Don't render if already dismissed or installed
  if (dismissed || isInstalled || !isVisible) {
    return null
  }

  return (
    <div className="fixed bottom-5 left-4 right-4 md:right-6 md:left-auto md:w-80 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-lg p-3.5 flex items-center gap-3">
        {/* app icon */}
        <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shadow-sm">
          <Download className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="truncate">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">QCC Attendance</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">Add to your home screen for faster access & offline use</p>
            </div>
            <div className="ml-2 flex items-center gap-2">
              <button
                onClick={handleDismiss}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-full transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" onClick={handleInstall} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm px-3 py-1.5">
              Install
            </Button>

            <button onClick={handleDismiss} className="text-sm text-slate-500 dark:text-slate-400 hover:underline px-2 py-1">
              Not now
            </button>
          </div>

          <div className="mt-3">
            <div className="h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-300 dark:bg-emerald-500 animate-[shrink_30s_linear_1s_forwards]" style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
