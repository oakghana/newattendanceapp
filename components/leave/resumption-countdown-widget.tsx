"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Clock, AlertTriangle, CheckCircle2, Volume2, VolumeX, Bell, BellOff, RefreshCw } from "lucide-react"
import { differenceInDays, differenceInSeconds, parseISO, format, addDays, startOfDay } from "date-fns"

interface ResumptionCountdownData {
  id: string
  staff_name: string
  leave_type: string
  end_date: string
  resume_date: string
  days_left: number
  status?: string
}

interface LiveTimer {
  days: number
  hours: number
  minutes: number
  seconds: number
  total_seconds: number
}

interface ResumptionCountdownWidgetProps {
  onMute?: (isMuted: boolean) => void
  autoPlaySound?: boolean
}

function computeTimerTo(targetDateStr: string): LiveTimer {
  const now = new Date()
  const target = startOfDay(addDays(parseISO(targetDateStr), 0))
  const diff = Math.max(0, target.getTime() - now.getTime())
  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  return { days, hours, minutes, seconds, total_seconds: totalSec }
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

export function ResumptionCountdownWidget({ onMute, autoPlaySound = true }: ResumptionCountdownWidgetProps) {
  const [countdowns, setCountdowns] = useState<ResumptionCountdownData[]>([])
  const [timers, setTimers] = useState<Record<string, LiveTimer>>({})
  const [loading, setLoading] = useState(true)
  const [soundMuted, setSoundMuted] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const audioCtxRef = useRef<AudioContext | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCountdowns = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch("/api/leave/reminders/resume-five-days-countdown")
      if (res.ok) {
        const data = await res.json()
        const items: ResumptionCountdownData[] = data.countdowns || []
        setCountdowns(items)
        const initial: Record<string, LiveTimer> = {}
        items.forEach(c => { initial[c.id] = computeTimerTo(c.resume_date) })
        setTimers(initial)
      }
    } catch (e) {
      console.error("[v0] Resumption countdowns fetch error:", e)
    } finally {
      setLoading(false)
      if (!silent) setRefreshing(false)
    }
  }, [])

  // Initial fetch + 60-second refresh
  useEffect(() => {
    fetchCountdowns()
    const poll = setInterval(() => fetchCountdowns(true), 60000)
    return () => clearInterval(poll)
  }, [fetchCountdowns])

  // Live second-by-second timer
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      setTimers(prev => {
        const next: Record<string, LiveTimer> = {}
        countdowns.forEach(c => {
          next[c.id] = computeTimerTo(c.resume_date)
        })
        return next
      })
    }, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [countdowns])

  // Request browser notification permission
  const enableNotifications = async () => {
    if (!("Notification" in window)) return
    const perm = await Notification.requestPermission()
    setNotificationsEnabled(perm === "granted")
    if (perm === "granted") {
      new Notification("🔔 Leave Resumption Alerts Enabled", {
        body: "You will receive daily reminders for upcoming staff resumptions.",
        icon: "/favicon.ico",
      })
    }
  }

  // Trigger a browser notification for critical countdowns
  useEffect(() => {
    if (!notificationsEnabled) return
    countdowns.filter(c => !dismissed.has(c.id) && c.days_left <= 2).forEach(c => {
      new Notification(`🚨 Staff Resumption: ${c.days_left === 0 ? "TODAY" : c.days_left + " day(s) left"}`, {
        body: `${c.staff_name} (${c.leave_type}) resumes on ${format(parseISO(c.resume_date), "EEE, dd MMM yyyy")}`,
        icon: "/favicon.ico",
        tag: `resumption-${c.id}`,
      })
    })
  }, [countdowns, notificationsEnabled, dismissed])

  const playAlertSound = useCallback(() => {
    if (soundMuted) return
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = "sine"
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.6)
    } catch { /* audio not supported */ }
  }, [soundMuted])

  useEffect(() => {
    if (autoPlaySound && countdowns.some(c => c.days_left <= 1)) playAlertSound()
  }, [countdowns, autoPlaySound, playAlertSound])

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/60 animate-pulse">
        <CardContent className="py-6 text-center text-sm text-slate-500">
          ⏳ Loading resumption countdowns...
        </CardContent>
      </Card>
    )
  }

  const visible = countdowns.filter(c => !dismissed.has(c.id))
  if (visible.length === 0) return null

  const critical = visible.filter(c => c.days_left <= 2)
  const warning = visible.filter(c => c.days_left > 2 && c.days_left <= 5)

  return (
    <div className="space-y-3">

      {/* Master alert banner */}
      {critical.length > 0 && (
        <Alert className="border-red-400 bg-red-50 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 font-medium">
            🚨 <strong>CRITICAL:</strong> {critical.length} staff member{critical.length > 1 ? "s" : ""} resuming within 48 hours — immediate action required!
          </AlertDescription>
        </Alert>
      )}
      {warning.length > 0 && critical.length === 0 && (
        <Alert className="border-amber-400 bg-amber-50 shadow-sm">
          <Clock className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            ⏰ <strong>Heads-up:</strong> {warning.length} staff member{warning.length > 1 ? "s" : ""} returning within 5 days. Ensure handover arrangements are in place.
          </AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">
          📅 Leave Resumption Tracker ({visible.length})
        </p>
        <div className="flex items-center gap-2">
          {!notificationsEnabled && "Notification" in window && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={enableNotifications}>
              <Bell className="h-3.5 w-3.5" /> Enable Alerts
            </Button>
          )}
          {notificationsEnabled && (
            <Badge variant="secondary" className="gap-1 text-xs bg-green-100 text-green-700">
              <BellOff className="h-3 w-3" /> Alerts On
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-slate-500"
            onClick={() => setSoundMuted(m => { onMute?.(!m); return !m })}
          >
            {soundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {soundMuted ? "Sound Off" : "Sound On"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-slate-500"
            onClick={() => fetchCountdowns()} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Countdown cards */}
      <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
        {visible.map(countdown => {
          const timer = timers[countdown.id] ?? computeTimerTo(countdown.resume_date)
          const d = countdown.days_left

          const urgency =
            d <= 0 ? "today"
            : d <= 1 ? "critical"
            : d <= 2 ? "high"
            : d <= 3 ? "medium"
            : "low"

          const palette: Record<string, { card: string; badge: string; bar: string; text: string }> = {
            today:    { card: "border-emerald-400 bg-emerald-50 shadow-emerald-100",    badge: "bg-emerald-600 text-white", bar: "bg-emerald-500",  text: "text-emerald-800" },
            critical: { card: "border-red-400 bg-red-50 shadow-red-100 animate-pulse", badge: "bg-red-600 text-white",     bar: "bg-red-500",      text: "text-red-800" },
            high:     { card: "border-orange-400 bg-orange-50 shadow-orange-100",      badge: "bg-orange-500 text-white",  bar: "bg-orange-500",   text: "text-orange-800" },
            medium:   { card: "border-amber-300 bg-amber-50 shadow-amber-100",         badge: "bg-amber-500 text-white",   bar: "bg-amber-400",    text: "text-amber-800" },
            low:      { card: "border-sky-200 bg-sky-50",                              badge: "bg-sky-500 text-white",     bar: "bg-sky-400",      text: "text-sky-800" },
          }
          const pal = palette[urgency]

          const emoji =
            urgency === "today" ? "🎉"
            : urgency === "critical" ? "🚨"
            : urgency === "high" ? "⚠️"
            : urgency === "medium" ? "⏰"
            : "📅"

          const progressPct = Math.min(100, Math.max(0, ((7 - d) / 7) * 100))

          return (
            <Card key={countdown.id} className={`border-2 shadow-sm ${pal.card}`}>
              <CardContent className="p-4 space-y-3">

                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{emoji}</span>
                    <div>
                      <p className="font-bold text-slate-800 leading-tight">{countdown.staff_name}</p>
                      <p className="text-xs text-slate-500 capitalize">{countdown.leave_type.replace(/_/g, " ")} Leave</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${pal.badge}`}>
                      {urgency === "today" ? "RESUMES TODAY" : `${d}d left`}
                    </span>
                    <button
                      className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                      onClick={() => setDismissed(prev => new Set([...prev, countdown.id]))}
                    >
                      dismiss
                    </button>
                  </div>
                </div>

                {/* Live digital clock */}
                <div className={`rounded-xl border px-3 py-2 text-center font-mono ${
                  urgency === "critical" ? "border-red-200 bg-white" : "border-slate-200 bg-white/70"
                }`}>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Time until resumption</p>
                  <div className="flex items-center justify-center gap-1">
                    {[
                      { val: pad2(timer.days), label: "d" },
                      { val: pad2(timer.hours), label: "h" },
                      { val: pad2(timer.minutes), label: "m" },
                      { val: pad2(timer.seconds), label: "s" },
                    ].map(({ val, label }, i) => (
                      <div key={label} className="flex items-baseline gap-0.5">
                        {i > 0 && <span className="text-slate-300 font-bold text-base">:</span>}
                        <span className={`text-2xl font-extrabold tabular-nums ${pal.text}`}>{val}</span>
                        <span className="text-[10px] text-slate-400">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Date pills */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-white/80 border border-slate-100 px-2.5 py-1.5">
                    <p className="text-slate-400 mb-0.5">Leave ends</p>
                    <p className="font-semibold text-slate-700">{format(parseISO(countdown.end_date), "EEE dd MMM")}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 border border-slate-100 px-2.5 py-1.5">
                    <p className="text-slate-400 mb-0.5">Resumes</p>
                    <p className="font-semibold text-slate-700">{format(parseISO(countdown.resume_date), "EEE dd MMM")}</p>
                  </div>
                </div>

                {/* Progress toward resumption */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Progress to return</span>
                    <span>{Math.round(progressPct)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full transition-all ${pal.bar}`} style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                {/* Urgency message */}
                {urgency === "today" && (
                  <p className="text-xs font-medium text-emerald-700 rounded-lg bg-emerald-100 px-3 py-2">
                    🎉 {countdown.staff_name.split(" ")[0]} should be checking in today. Attendance system will auto-confirm resumption!
                  </p>
                )}
                {urgency === "critical" && (
                  <p className="text-xs font-medium text-red-700 rounded-lg bg-red-100 px-3 py-2">
                    🚨 Returning TOMORROW — ensure all handover and workspace preparations are complete.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* HR info footer */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700">📋 HR Action Checklist</p>
        <ul className="list-disc list-inside space-y-0.5 text-slate-500">
          <li>Verify return-to-work documentation for all upcoming resumptions</li>
          <li>Contact critical (≤48h) staff if issues are expected</li>
          <li>Ensure workspace, access and handover is ready before their return</li>
          <li>Log any non-resumptions immediately via the issue-warning system</li>
        </ul>
        <p className="text-[10px] text-slate-400 pt-1">
          ℹ️ Attendance check-in auto-confirms resumption. Daily reminders continue until confirmed.
        </p>
      </div>
    </div>
  )
}