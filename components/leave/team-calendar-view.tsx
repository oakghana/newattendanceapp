"use client"

import { useEffect, useState } from "react"
import {
  AlertCircle,
  Baby,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  Sun,
  User,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface CalendarEntry {
  id: string
  userId: string
  name: string
  employeeId: string | null
  department: string | null
  leaveType: string
  startDate: string
  endDate: string
}

interface TeamCalendarData {
  entries: CalendarEntry[]
  rangeStart: string
  rangeEnd: string
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; colour: string; bg: string }> = {
  annual:            { label: "Annual",          icon: <Sun className="h-3 w-3" />,      colour: "text-cyan-700",    bg: "bg-cyan-100 border-cyan-200" },
  sick:              { label: "Sick",             icon: <Heart className="h-3 w-3" />,     colour: "text-rose-700",    bg: "bg-rose-100 border-rose-200" },
  maternity:         { label: "Maternity",        icon: <Baby className="h-3 w-3" />,      colour: "text-pink-700",    bg: "bg-pink-100 border-pink-200" },
  paternity:         { label: "Paternity",        icon: <User className="h-3 w-3" />,      colour: "text-violet-700",  bg: "bg-violet-100 border-violet-200" },
  casual:            { label: "Casual",           icon: <Briefcase className="h-3 w-3" />, colour: "text-amber-700",   bg: "bg-amber-100 border-amber-200" },
  compassionate:     { label: "Compassionate",    icon: <AlertCircle className="h-3 w-3" />,colour: "text-orange-700", bg: "bg-orange-100 border-orange-200" },
  study_with_pay:    { label: "Study (Paid)",     icon: <BookOpen className="h-3 w-3" />,  colour: "text-emerald-700", bg: "bg-emerald-100 border-emerald-200" },
  study_without_pay: { label: "Study (Unpaid)",   icon: <BookOpen className="h-3 w-3" />,  colour: "text-teal-700",    bg: "bg-teal-100 border-teal-200" },
}

const DEFAULT_META = { label: "Leave", icon: <AlertCircle className="h-3 w-3" />, colour: "text-slate-700", bg: "bg-slate-100 border-slate-200" }

function getTypeMeta(key: string) {
  return TYPE_META[key?.toLowerCase()] ?? DEFAULT_META
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

export function TeamCalendarView() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [data, setData] = useState<TeamCalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null) // selected date YYYY-MM-DD

  useEffect(() => {
    setLoading(true)
    setError(null)
    const m = `${year}-${String(month + 1).padStart(2, "0")}`
    fetch(`/api/leave/team-calendar?month=${m}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [year, month])

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  const totalDays = daysInMonth(year, month)
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun

  // Build a map: dateStr → CalendarEntry[]
  const dayMap: Record<string, CalendarEntry[]> = {}
  for (const entry of data?.entries ?? []) {
    const s = new Date(entry.startDate)
    const e = new Date(entry.endDate)
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0]
      if (!dayMap[key]) dayMap[key] = []
      dayMap[key].push(entry)
    }
  }

  const selectedEntries = selected ? (dayMap[selected] ?? []) : []
  const todayStr = today.toISOString().split("T")[0]

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      {/* Header */}
      <div className="bg-[linear-gradient(135deg,_#0f2741_0%,_#1e3a5f_100%)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2.5">
              <Users className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-white">Team Calendar</CardTitle>
              <p className="text-xs text-slate-300">Who is off this month</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl text-white hover:bg-white/10" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[130px] text-center text-sm font-semibold text-white">
              {MONTH_NAMES[month]} {year}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl text-white hover:bg-white/10" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            Could not load team calendar
          </div>
        ) : (
          <div className="space-y-4">
            {/* Day of week labels */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((d) => (
                <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Blank cells for offset */}
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}

              {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                const dateStr = isoDate(year, month, day)
                const entries = dayMap[dateStr] ?? []
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selected
                const hasLeave = entries.length > 0
                const MAX_DOTS = 3

                return (
                  <button
                    key={day}
                    onClick={() => setSelected(isSelected ? null : dateStr)}
                    className={`relative flex flex-col items-center rounded-xl px-1 py-2 text-sm font-medium transition-all
                      ${isSelected ? "bg-slate-900 text-white shadow-md" : isToday ? "ring-2 ring-cyan-400 ring-offset-1" : "hover:bg-slate-100"}
                      ${hasLeave && !isSelected ? "bg-cyan-50" : ""}
                    `}
                  >
                    <span className={isSelected ? "text-white" : isToday ? "text-cyan-600 font-bold" : "text-slate-800"}>
                      {day}
                    </span>
                    {hasLeave && (
                      <div className="mt-1 flex gap-0.5">
                        {entries.slice(0, MAX_DOTS).map((e, idx) => {
                          const meta = getTypeMeta(e.leaveType)
                          return (
                            <span
                              key={idx}
                              className={`h-1.5 w-1.5 rounded-full ${
                                isSelected ? "bg-white" : meta.colour.replace("text-", "bg-").replace("-700", "-500")
                              }`}
                            />
                          )
                        })}
                        {entries.length > MAX_DOTS && (
                          <span className={`text-[9px] leading-none ${isSelected ? "text-white" : "text-slate-400"}`}>
                            +{entries.length - MAX_DOTS}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected day detail */}
            {selected && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {new Date(selected + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                {selectedEntries.length === 0 ? (
                  <p className="text-sm text-slate-400">No approved leave on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEntries.map((e) => {
                      const meta = getTypeMeta(e.leaveType)
                      return (
                        <div key={e.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm">
                          <div className="flex items-center gap-2.5">
                            <div className={`rounded-lg p-1.5 ${meta.bg} ${meta.colour}`}>{meta.icon}</div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{e.name || "Staff Member"}</p>
                              {e.department && <p className="text-xs text-slate-400">{e.department}</p>}
                            </div>
                          </div>
                          <Badge variant="outline" className={`border text-xs ${meta.bg} ${meta.colour}`}>
                            {meta.label}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {Object.entries(TYPE_META).slice(0, 5).map(([key, m]) => (
                <div key={key} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className={`h-2 w-2 rounded-full ${m.bg.replace("bg-", "bg-").split(" ")[0].replace("100", "400")}`} />
                  {m.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
