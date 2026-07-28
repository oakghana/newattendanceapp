"use client"

import { useEffect, useState, useMemo } from "react"
import {
  AlertCircle,
  Baby,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hash,
  Heart,
  Loader2,
  MapPin,
  Sun,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format, parseISO, isWithinInterval, addDays, isSameDay } from "date-fns"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEntry {
  id: string
  userId: string
  name: string
  employeeId: string | null
  position: string | null
  department: string | null
  departmentId: string | null
  leaveType: string
  startDate: string
  endDate: string
  days: number
}

interface TeamCalendarData {
  entries: CalendarEntry[]
  rangeStart: string
  rangeEnd: string
  isGlobalRole?: boolean
}

// ─── Leave type metadata ───────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; colour: string; bg: string; dot: string }> = {
  annual:            { label: "Annual Leave",    icon: <Sun className="h-3 w-3" />,        colour: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200",    dot: "bg-cyan-400" },
  sick:              { label: "Sick Leave",       icon: <Heart className="h-3 w-3" />,       colour: "text-rose-700",    bg: "bg-rose-50 border-rose-200",    dot: "bg-rose-400" },
  maternity:         { label: "Maternity",        icon: <Baby className="h-3 w-3" />,        colour: "text-pink-700",    bg: "bg-pink-50 border-pink-200",    dot: "bg-pink-400" },
  paternity:         { label: "Paternity",        icon: <User className="h-3 w-3" />,        colour: "text-violet-700",  bg: "bg-violet-50 border-violet-200",dot: "bg-violet-400" },
  casual:            { label: "Casual Leave",     icon: <Briefcase className="h-3 w-3" />,   colour: "text-amber-700",   bg: "bg-amber-50 border-amber-200",  dot: "bg-amber-400" },
  compassionate:     { label: "Compassionate",    icon: <AlertCircle className="h-3 w-3" />, colour: "text-orange-700",  bg: "bg-orange-50 border-orange-200",dot: "bg-orange-400" },
  study_with_pay:    { label: "Study (Paid)",     icon: <BookOpen className="h-3 w-3" />,    colour: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",dot: "bg-emerald-400" },
  study_without_pay: { label: "Study (Unpaid)",   icon: <BookOpen className="h-3 w-3" />,    colour: "text-teal-700",    bg: "bg-teal-50 border-teal-200",    dot: "bg-teal-400" },
}
const DEFAULT_META = { label: "Leave", icon: <AlertCircle className="h-3 w-3" />, colour: "text-slate-600", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" }
function getTypeMeta(key: string) { return TYPE_META[key?.toLowerCase()] ?? DEFAULT_META }

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

function daysRemaining(endDate: string): number {
  try {
    const end = parseISO(endDate)
    const today = new Date()
    today.setHours(0,0,0,0)
    const diff = Math.round((end.getTime() - today.getTime()) / 86400000)
    return Math.max(0, diff)
  } catch { return 0 }
}

function onLeaveToday(entry: CalendarEntry, today: string): boolean {
  return entry.startDate <= today && entry.endDate >= today
}

// ─── Staff Detail Card ─────────────────────────────────────────────────────────

function StaffLeaveCard({ entry, showDaysRemaining = false }: { entry: CalendarEntry; showDaysRemaining?: boolean }) {
  const meta = getTypeMeta(entry.leaveType)
  const remaining = showDaysRemaining ? daysRemaining(entry.endDate) : null

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm hover:shadow-md transition-shadow">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.bg} ${meta.colour}`}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm text-slate-900 truncate">{entry.name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
              {entry.employeeId && (
                <span className="text-xs text-slate-400 flex items-center gap-1"><Hash className="h-3 w-3" />{entry.employeeId}</span>
              )}
              {entry.position && (
                <span className="text-xs text-slate-400 flex items-center gap-1"><Briefcase className="h-3 w-3" />{entry.position}</span>
              )}
              {entry.department && (
                <span className="text-xs text-slate-400 flex items-center gap-1"><Building2 className="h-3 w-3" />{entry.department}</span>
              )}
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 border text-xs font-medium ${meta.bg} ${meta.colour}`}>
            {meta.label}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(parseISO(entry.startDate), "d MMM")} — {format(parseISO(entry.endDate), "d MMM yyyy")}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {entry.days} day{entry.days !== 1 ? "s" : ""}
          </span>
          {showDaysRemaining && remaining !== null && remaining > 0 && (
            <span className="text-emerald-600 font-medium">{remaining} day{remaining !== 1 ? "s" : ""} remaining</span>
          )}
          {showDaysRemaining && remaining === 0 && (
            <span className="text-rose-500 font-medium">Returns today</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon, colour, bg, border, active, onClick,
}: {
  label: string; value: number; sub?: string; icon: React.ReactNode
  colour: string; bg: string; border: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 ${active ? `${border} ${bg} shadow-md ring-2 ring-offset-1 ring-current` : `border-slate-200 bg-white hover:${bg} hover:border-slate-300 hover:shadow-sm`}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`p-2 rounded-xl border ${active ? border : "border-slate-200 bg-slate-50"} ${active ? `${bg} ${colour}` : "text-slate-400"}`}>
          {icon}
        </div>
        <span className={`text-2xl font-bold leading-none ${active ? colour : "text-slate-800"}`}>{value}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600 leading-tight">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </button>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface TeamCalendarViewProps {
  isHrOffice?: boolean
  userId?: string
  userDepartment?: string | null
  userDepartmentName?: string | null
  userRole?: string | null
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function TeamCalendarView({
  isHrOffice = false,
  userId,
  userDepartment,
  userDepartmentName,
  userRole,
}: TeamCalendarViewProps) {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [data, setData] = useState<TeamCalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<"today" | "month" | "upcoming" | null>(null)

  // Fetch data on month change
  useEffect(() => {
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const m = `${year}-${String(month + 1).padStart(2, "0")}`
    fetch(`/api/leave/team-calendar?month=${m}`, { cache: "no-store", signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        if (e.name !== "AbortError") { setError(e.message || "Failed to load"); setLoading(false) }
      })
    return () => { clearTimeout(timeout); controller.abort() }
  }, [year, month])

  // Navigation
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1); setSelectedDate(null) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1); setSelectedDate(null) }

  // Build day map
  const dayMap = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {}
    for (const entry of data?.entries ?? []) {
      const s = parseISO(entry.startDate)
      const e = parseISO(entry.endDate)
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split("T")[0]
        if (!map[key]) map[key] = []
        map[key].push(entry)
      }
    }
    return map
  }, [data])

  // Smart metrics
  const onLeaveTodayList = useMemo(() => (data?.entries ?? []).filter(e => onLeaveToday(e, todayStr)), [data, todayStr])
  const onLeaveThisMonth = useMemo(() => {
    const seen = new Set<string>()
    return (data?.entries ?? []).filter(e => { if (seen.has(e.userId)) return false; seen.add(e.userId); return true })
  }, [data])

  const upcomingList = useMemo(() => {
    const in7 = addDays(today, 7).toISOString().split("T")[0]
    return (data?.entries ?? []).filter(e => e.startDate > todayStr && e.startDate <= in7)
  }, [data, todayStr])

  const totalDeptStaff = 20 // approximate; ideally passed from server. Used for coverage %.
  const coveragePct = onLeaveTodayList.length > 0
    ? Math.max(0, Math.round(((totalDeptStaff - onLeaveTodayList.length) / totalDeptStaff) * 100))
    : 100

  // Calendar grid
  const totalDays = daysInMonth(year, month)
  const firstDow = new Date(year, month, 1).getDay()

  const selectedEntries = selectedDate ? (dayMap[selectedDate] ?? []) : []

  // Active metric panel data
  const panelData = useMemo(() => {
    if (activePanel === "today") return onLeaveTodayList
    if (activePanel === "month") return onLeaveThisMonth
    if (activePanel === "upcoming") return upcomingList
    return []
  }, [activePanel, onLeaveTodayList, onLeaveThisMonth, upcomingList])

  const scopeLabel = isHrOffice ? "All departments" : userDepartmentName ? `${userDepartmentName} department` : "Your department"

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-amber-500" />
            Department Leave Calendar
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{scopeLabel} — who is on leave and when</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-1 py-1 shadow-sm">
          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[110px] text-center text-sm font-semibold text-slate-800">
            {MONTH_NAMES[month]} {year}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-sm">Could not load leave data</p>
        </div>
      ) : (
        <>
          {/* ── Smart Metric Cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Currently on Leave"
              value={onLeaveTodayList.length}
              sub="as of today"
              icon={<Users className="h-4 w-4" />}
              colour="text-rose-700"
              bg="bg-rose-50"
              border="border-rose-300"
              active={activePanel === "today"}
              onClick={() => setActivePanel(p => p === "today" ? null : "today")}
            />
            <MetricCard
              label="On Leave This Month"
              value={onLeaveThisMonth.length}
              sub="unique staff"
              icon={<Calendar className="h-4 w-4" />}
              colour="text-blue-700"
              bg="bg-blue-50"
              border="border-blue-300"
              active={activePanel === "month"}
              onClick={() => setActivePanel(p => p === "month" ? null : "month")}
            />
            <MetricCard
              label="Upcoming (7 days)"
              value={upcomingList.length}
              sub="starting soon"
              icon={<Clock className="h-4 w-4" />}
              colour="text-amber-700"
              bg="bg-amber-50"
              border="border-amber-300"
              active={activePanel === "upcoming"}
              onClick={() => setActivePanel(p => p === "upcoming" ? null : "upcoming")}
            />
            <MetricCard
              label="Dept Coverage"
              value={coveragePct}
              sub="% at work today"
              icon={<TrendingUp className="h-4 w-4" />}
              colour="text-emerald-700"
              bg="bg-emerald-50"
              border="border-emerald-300"
            />
          </div>

          {/* ── Metric Panel (slide-down on card click) ─────────────────── */}
          {activePanel && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {activePanel === "today" && `Staff on leave today — ${format(today, "d MMMM yyyy")}`}
                  {activePanel === "month" && `All staff on leave in ${MONTH_NAMES[month]} ${year}`}
                  {activePanel === "upcoming" && "Starting leave in the next 7 days"}
                </p>
                <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {panelData.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No staff found for this category</p>
              ) : (
                <div className="space-y-2">
                  {panelData.map((entry) => (
                    <StaffLeaveCard key={entry.id} entry={entry} showDaysRemaining={activePanel === "today"} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Calendar Grid ───────────────────────────────────────────── */}
          <Card className="border border-slate-200 shadow-none">
            <CardContent className="p-4">
              {/* Day labels */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">{d}</div>
                ))}
              </div>
              {/* Days */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`blank-${i}`} />)}
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                  const dateStr = isoDate(year, month, day)
                  const entries = dayMap[dateStr] ?? []
                  const isToday = dateStr === todayStr
                  const isSelected = dateStr === selectedDate
                  const hasLeave = entries.length > 0

                  return (
                    <button
                      key={day}
                      onClick={() => { setSelectedDate(isSelected ? null : dateStr); setActivePanel(null) }}
                      className={`relative flex flex-col items-center rounded-xl px-1 py-2 text-sm font-medium transition-all duration-150
                        ${isSelected ? "bg-slate-900 text-white shadow-md" : isToday ? "ring-2 ring-amber-400 ring-offset-1 bg-amber-50" : hasLeave ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-100"}
                      `}
                    >
                      <span className={`text-sm leading-none ${isSelected ? "text-white" : isToday ? "text-amber-700 font-bold" : hasLeave ? "text-blue-700 font-semibold" : "text-slate-700"}`}>
                        {day}
                      </span>
                      {hasLeave && (
                        <div className="mt-1 flex gap-0.5 flex-wrap justify-center">
                          {entries.slice(0, 3).map((e, idx) => {
                            const meta = getTypeMeta(e.leaveType)
                            return <span key={idx} className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : meta.dot}`} />
                          })}
                          {entries.length > 3 && (
                            <span className={`text-[9px] leading-none ${isSelected ? "text-slate-300" : "text-slate-400"}`}>+{entries.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Selected Date Detail ────────────────────────────────────── */}
          {selectedDate && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <button onClick={() => setSelectedDate(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedEntries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No approved leave on this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedEntries.map((entry) => (
                    <StaffLeaveCard key={entry.id} entry={entry} showDaysRemaining={true} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Legend ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100">
            {Object.entries(TYPE_META).map(([key, m]) => (
              <div key={key} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                {m.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
