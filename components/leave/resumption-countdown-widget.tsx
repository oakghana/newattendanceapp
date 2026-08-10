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

function ResumptionList({
  items,
  timers,
  onDismiss,
}: {
  items: ResumptionCountdownData[]
  timers: Record<string, LiveTimer>
  onDismiss: (id: string) => void
}) {
  const pageSize = 20
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const rows = items.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => setPage(1), [items.length])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(110px,0.7fr)_90px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
        <span>Staff member</span><span>Leave type</span><span>Resumption</span><span>Status</span><span />
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((countdown) => {
          const d = countdown.days_left
          const timer = timers[countdown.id] ?? computeTimerTo(countdown.resume_date)
          const urgency = d <= 0 ? "today" : d <= 1 ? "critical" : d <= 2 ? "high" : d <= 3 ? "medium" : "low"
          const styles = {
            today: { row: "bg-emerald-50/70", badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
            critical: { row: "bg-red-50/70", badge: "bg-red-100 text-red-800", bar: "bg-red-500" },
            high: { row: "bg-orange-50/60", badge: "bg-orange-100 text-orange-800", bar: "bg-orange-500" },
            medium: { row: "bg-amber-50/60", badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
            low: { row: "", badge: "bg-sky-100 text-sky-800", bar: "bg-sky-500" },
          }[urgency]
          const progress = Math.min(100, Math.max(0, ((7 - d) / 7) * 100))
          return (
            <div key={countdown.id} className={`grid gap-2 px-3 py-2.5 text-xs md:grid-cols-[minmax(0,1.7fr)_minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(110px,0.7fr)_90px] md:items-center md:gap-3 md:px-4 ${styles.row}`}>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{countdown.staff_name}</p>
                <p className="text-[11px] text-slate-500 md:hidden">{countdown.leave_type.replace(/_/g, " ")} Leave · Ends {format(parseISO(countdown.end_date), "dd MMM yyyy")}</p>
              </div>
              <p className="hidden capitalize text-slate-600 md:block">{countdown.leave_type.replace(/_/g, " ")} Leave</p>
              <div>
                <p className="font-medium text-slate-700">{format(parseISO(countdown.resume_date), "EEE, dd MMM yyyy")}</p>
                <p className="font-mono text-[10px] text-slate-400">{pad2(timer.days)}d {pad2(timer.hours)}h {pad2(timer.minutes)}m</p>
              </div>
              <div className="min-w-0">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.badge}`}>{d <= 0 ? "Today" : `${d}d left`}</span>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${styles.bar}`} style={{ width: `${progress}%` }} /></div>
              </div>
              <button type="button" className="justify-self-start text-[11px] text-slate-400 underline hover:text-slate-700 md:justify-self-end" onClick={() => onDismiss(countdown.id)} aria-label={`Dismiss ${countdown.staff_name} resumption reminder`}>Dismiss</button>
            </div>
          )
        })}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, items.length)} of {items.length}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <span>Page {currentPage} of {pageCount}</span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={currentPage === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
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
    <div className="flex flex-col gap-2">

      {/* Master alert banner */}
      {critical.length > 0 && (
        <Alert className="border-red-300 bg-red-50/80 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="py-0 text-xs font-medium text-red-800">
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
        <p className="text-xs font-semibold text-slate-700">
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

      {/* Compact operational list: paged so hundreds of staff remain easy to scan. */}
      <ResumptionList items={visible} timers={timers} onDismiss={(id) => setDismissed(prev => new Set([...prev, id]))} />


      {/* HR info footer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <p className="font-semibold text-slate-700">📋 HR Action Checklist</p>
        <ul className="list-disc list-inside text-slate-500">
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
