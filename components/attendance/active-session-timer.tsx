"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, MapPin, LogOut, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { canCheckOutAtTime } from "@/lib/attendance-utils"
import type { AttendanceTimeConfig } from "@/lib/attendance-utils"

interface ActiveSessionTimerProps {
  checkInTime: string
  checkInLocation: string
  checkOutLocation?: string
  minimumWorkMinutes?: number
  locationCheckInTime?: string | null
  locationCheckOutTime?: string | null
  onCheckOut?: () => void
  canCheckOut?: boolean
  allowImmediateCheckout?: boolean
  isCheckingOut?: boolean
  userDepartment?: { code?: string | null; name?: string | null } | undefined | null
  userRole?: string | null
  runtimeConfig?: AttendanceTimeConfig
  getNow?: () => Date
}

export function ActiveSessionTimer({
  checkInTime,
  checkInLocation,
  minimumWorkMinutes = 120,
  locationCheckInTime,
  locationCheckOutTime,
  onCheckOut,
  canCheckOut = true,
  allowImmediateCheckout = false,
  isCheckingOut = false,
  userDepartment,
  userRole,
  runtimeConfig,
  getNow,
}: ActiveSessionTimerProps) {
  const resolveNow = getNow || (() => new Date())
  const [currentTime, setCurrentTime] = useState(resolveNow())
  const [countdown, setCountdown] = useState<{ h: number; m: number; s: number; done: boolean }>({
    h: 0, m: 0, s: 0, done: false,
  })

  useEffect(() => {
    const tick = setInterval(() => {
      const now = resolveNow()
      setCurrentTime(now)
      const checkInDate = new Date(checkInTime)
      const unlockAt = new Date(checkInDate.getTime() + minimumWorkMinutes * 60 * 1000)
      const diff = unlockAt.getTime() - now.getTime()
      if (diff <= 0) {
        setCountdown({ h: 0, m: 0, s: 0, done: true })
      } else {
        setCountdown({
          h: Math.floor(diff / 3600000),
          m: Math.floor((diff % 3600000) / 60000),
          s: Math.floor((diff % 60000) / 1000),
          done: false,
        })
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [checkInTime, minimumWorkMinutes])

  const checkInDate = new Date(checkInTime)
  const elapsedMs = currentTime.getTime() - checkInDate.getTime()
  const elapsedMins = Math.max(0, Math.floor(elapsedMs / 60000))
  const elapsedHours = Math.floor(elapsedMins / 60)
  const elapsedMinutes = elapsedMins % 60

  // Progress toward 8-hour work day (capped at 100%)
  const targetMins = 8 * 60
  const progressPct = Math.min(100, Math.round((elapsedMins / targetMins) * 100))

  const canCheckoutNow =
    canCheckOut ||
    allowImmediateCheckout ||
    canCheckOutAtTime(currentTime, userDepartment, userRole, runtimeConfig) ||
    countdown.done

  // Status label
  const statusLabel =
    elapsedHours >= 7
      ? "Full day achieved"
      : elapsedHours >= 2
        ? "Checkout available"
        : "Minimum time pending"

  const statusColor =
    elapsedHours >= 7
      ? "bg-emerald-500"
      : elapsedHours >= 2
        ? "bg-blue-500"
        : "bg-amber-500"

  return (
    <div className="space-y-3">
      {/* Main Session Card */}
      <Card className="border-0 shadow-md overflow-hidden">
        {/* Top colour strip */}
        <div className={`h-1.5 w-full ${statusColor} transition-colors duration-700`} />
        <CardContent className="p-4 md:p-5 space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="relative shrink-0">
                <div className={`absolute inset-0 rounded-full ${statusColor} animate-ping opacity-20`} />
                <div className={`relative rounded-full p-2 ${statusColor}`}>
                  <Clock className="h-4 w-4 text-white" />
                </div>
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight text-foreground">Active Work Session</p>
                <p className="text-xs text-muted-foreground">
                  Started at {checkInDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {checkInLocation ? ` · ${checkInLocation}` : ""}
                </p>
              </div>
            </div>
            <Badge
              className={`${statusColor} text-white text-xs shrink-0 hover:opacity-90`}
            >
              {statusLabel}
            </Badge>
          </div>

          {/* Time display */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-bold tabular-nums tracking-tight text-foreground">
                {String(elapsedHours).padStart(2, "0")}
                <span className="text-muted-foreground text-2xl">h </span>
                {String(elapsedMinutes).padStart(2, "0")}
                <span className="text-muted-foreground text-2xl">m</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">time on duty</p>
            </div>
            {(locationCheckInTime || locationCheckOutTime) && (
              <div className="text-right text-xs text-muted-foreground space-y-0.5">
                {locationCheckInTime && <p>Open: <span className="font-medium text-foreground">{locationCheckInTime}</span></p>}
                {locationCheckOutTime && <p>Close: <span className="font-medium text-foreground">{locationCheckOutTime}</span></p>}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0h</span>
              <span className="font-medium text-foreground">{progressPct}%</span>
              <span>8h</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${statusColor}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {checkInLocation}
              </span>
              {elapsedHours >= 7 ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Full day ✓
                </span>
              ) : elapsedHours >= 2 ? (
                <span className="text-blue-600 dark:text-blue-400 font-medium">Ready to check out</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  {countdown.done ? "Ready" : `${countdown.h > 0 ? `${countdown.h}h ` : ""}${countdown.m}m ${countdown.s}s until checkout`}
                </span>
              )}
            </div>
          </div>

          {/* Checkout Button */}
          {onCheckOut && (
            <Button
              onClick={onCheckOut}
              disabled={isCheckingOut || !canCheckoutNow}
              size="lg"
              className={`w-full font-semibold transition-all duration-300 ${
                canCheckoutNow
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-lg active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {isCheckingOut ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Checking Out…
                </>
              ) : canCheckoutNow ? (
                <>
                  <LogOut className="mr-2 h-5 w-5" />
                  Check Out Now
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  {countdown.h > 0
                    ? `Available in ${countdown.h}h ${countdown.m}m`
                    : `Available in ${countdown.m}m ${countdown.s}s`}
                </>
              )}
            </Button>
          )}

          {/* Info strip: no reason needed after 7h */}
          {canCheckoutNow && (
            <p className="text-center text-xs text-muted-foreground">
              {elapsedHours >= 7
                ? "No reason required — full day completed."
                : "Early checkout — a brief reason will be requested."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Out-of-range notice */}
      {!canCheckoutNow && !countdown.done && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-800 dark:text-amber-300">
            Checkout requires a minimum of <strong>2 hours</strong> on duty.
            After 5:30 pm you may request an off-premises checkout if you are outside the approved range.
          </p>
        </div>
      )}
    </div>
  )
}
