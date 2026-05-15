"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  TrendingUp, Download, RefreshCw, Calendar, Users, Clock,
  CheckCircle2, AlertCircle, MapPin, BarChart3, FileText,
  Activity, Layers,
} from "lucide-react"

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getCurrentMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const last = new Date(y, now.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${last}` }
}

function fmt(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GH", {
    day: "numeric", month: "short", year: "numeric",
  })
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  study: "Study Leave",
  compassionate: "Compassionate Leave",
  casual: "Casual Leave",
  unpaid: "Unpaid Leave",
  special: "Special Leave",
}

function leaveLabel(key: string) {
  return LEAVE_TYPE_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

function daysLeftToResume(startDate: string, endDate: string) {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const leaveStart = new Date(`${startDate}T00:00:00`)
  const leaveEnd = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(leaveStart.getTime()) || Number.isNaN(leaveEnd.getTime())) return "-"

  if (todayStart < leaveStart) {
    const startsIn = Math.ceil((leaveStart.getTime() - todayStart.getTime()) / 86400000)
    return `Starts in ${startsIn}d`
  }

  const resumeDate = new Date(leaveEnd)
  resumeDate.setDate(resumeDate.getDate() + 1)
  const diff = Math.ceil((resumeDate.getTime() - todayStart.getTime()) / 86400000)
  return diff > 0 ? `${diff}d` : "Resumed"
}

function downloadCsv(rows: any[], fileName: string) {
  if (!rows.length) return
  const headers = ["Staff Name", "Employee ID", "Department", "Location", "Leave Type", "Start Date", "End Date", "Days", "Submitted"]
  const lines = [
    headers.join(","),
    ...rows.map(r => [
      `"${r.staff_name || ""}"`,
      r.employee_id || "",
      `"${r.department_name || ""}"`,
      `"${r.location_name || ""}"`,
      leaveLabel(r.leave_type_key || ""),
      r.start_date || "",
      r.end_date || "",
      r.days ?? "",
      r.submitted_at ? r.submitted_at.split("T")[0] : "",
    ].join(","))
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadPdf(rows: any[], fileName: string, title: string, rangeStart: string, rangeEnd: string, locationFilter?: string) {
  const { jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  doc.setFontSize(16)
  doc.setTextColor(30, 90, 50)
  doc.text("QCC Electronic Attendance System", 14, 14)
  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  doc.text(title, 14, 22)
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Period: ${fmt(rangeStart)} — ${fmt(rangeEnd)}`, 14, 28)
  if (locationFilter && locationFilter !== "all") {
    doc.text(`Region / Location: ${locationFilter}`, 14, 33)
    doc.text(`Generated: ${new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra" })}`, 14, 38)
  } else {
    doc.text(`Region / Location: All Regions`, 14, 33)
    doc.text(`Generated: ${new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra" })}`, 14, 38)
  }

  autoTable(doc, {
    startY: 44,
    head: [["Staff Name", "Emp. ID", "Department", "Location", "Leave Type", "Start", "End", "Days"]],
    body: rows.map(r => [
      r.staff_name || "",
      r.employee_id || "",
      r.department_name || "",
      r.location_name || "",
      leaveLabel(r.leave_type_key || ""),
      r.start_date || "",
      r.end_date || "",
      String(r.days ?? ""),
    ]),
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    styles: { fontSize: 8 },
  })

  doc.save(fileName)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, gradient, textColor }: {
  label: string; value: number; icon: any; gradient: string; textColor: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 shadow-sm ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur-sm">
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-white/5" />
    </div>
  )
}

// ─── Bar Row ────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, gradient }: { label: string; value: number; max: number; gradient: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="group space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{label}</span>
        <span className="text-xs font-bold text-slate-800 tabular-nums">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function HrLeaveAnalyticsPanel() {
  const { toast } = useToast()
  const [range, setRange] = useState(getCurrentMonthRange)
  const [loading, setLoading] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<string>("all")

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end })
      const res = await fetch(`/api/leave/analytics?${params}`, { cache: "no-store" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error((json && (json.error || json.message)) || "Failed to load leave analytics")
      }
      setData(json)
      setSelectedLocation("all") // reset filter on new load
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load leave analytics")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end])

  useEffect(() => { load() }, [load])

  const analytics = data?.analytics
  const allRecords: any[] = analytics?.records ?? []
  const allRoster: any[] = analytics?.current_leave_roster ?? []
  const allLocationRanking: any[] = analytics?.location_ranking ?? []

  // All unique location names for the dropdown
  const allLocations = Array.from(
    new Set(allRecords.map((r: any) => r.location_name || "Unassigned Location"))
  ).sort()

  // Client-side location filter
  const records: any[] = selectedLocation === "all"
    ? allRecords
    : allRecords.filter((r: any) => r.location_name === selectedLocation)

  const roster: any[] = selectedLocation === "all"
    ? allRoster
    : allRoster.filter((r: any) => r.location_name === selectedLocation)

  const locationRanking: any[] = selectedLocation === "all"
    ? allLocationRanking
    : allLocationRanking.filter((l: any) => l.name === selectedLocation)

  // Recompute type breakdown from filtered records
  const typeBreakdown: any[] = (() => {
    const map = new Map<string, number>()
    records.forEach((r: any) => {
      const key = r.leave_type_key || "unknown"
      map.set(key, (map.get(key) || 0) + 1)
    })
    return Array.from(map.entries())
      .map(([leave_type_key, total]) => ({ leave_type_key, total }))
      .sort((a, b) => b.total - a.total)
  })()

  // Recompute totals from filtered records
  const totals = (() => {
    if (selectedLocation === "all") return analytics?.totals ?? {}
    const now = new Date()
    const todayStr = now.toISOString().split("T")[0]
    return {
      approved: records.length,
      on_leave_now: records.filter((r: any) => r.start_date <= todayStr && r.end_date >= todayStr).length,
      upcoming: records.filter((r: any) => r.start_date > todayStr).length,
      yet_to_enjoy: records.filter((r: any) => r.start_date > todayStr).length,
      completed: records.filter((r: any) => r.end_date < todayStr).length,
      outstanding: analytics?.totals?.outstanding ?? 0,
      unique_staff: new Set(records.map((r: any) => r.employee_id)).size,
    }
  })()

  const maxType = Math.max(...typeBreakdown.map((t: any) => Number(t.total || 0)), 1)
  const maxLoc = Math.max(...locationRanking.map((l: any) => Number(l.total || 0)), 1)
  const rangeStart = data?.rangeStart ?? range.start
  const rangeEnd = data?.rangeEnd ?? range.end

  const locationLabel = selectedLocation === "all" ? "all-regions" : selectedLocation.toLowerCase().replace(/\s+/g, "-")
  const rangeLabel = `leave_analytics_${range.start}_to_${range.end}_${locationLabel}`

  const sendFiveDayResumeReminders = useCallback(async () => {
    setSendingReminder(true)
    try {
      const res = await fetch("/api/leave/reminders/resume-five-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "hr-leave-analytics-panel" }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error((json && (json.error || json.message)) || "Failed to send reminders")
      }
      toast({
        title: "5-day reminders sent",
        description: `Sent ${Number(json?.sent || 0)} reminder email(s). Skipped ${Number(json?.skipped || 0)} already-notified request(s).`,
      })
    } catch (error) {
      toast({
        title: "Reminder send failed",
        description: error instanceof Error ? error.message : "Failed to send resume reminders",
        variant: "destructive",
      })
    } finally {
      setSendingReminder(false)
    }
  }, [toast])

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-900 p-6 shadow-xl text-white">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-purple-500/10" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-indigo-500/10" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-lg bg-white/10 p-1.5">
                <TrendingUp className="w-4 h-4 text-purple-300" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-300">HR Leave Intelligence</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Leave Analytics Dashboard</h2>
            <p className="mt-1 text-sm text-slate-300">Executive insights · Quality Control Company Limited</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="ghost"
              className="h-8 border border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button size="sm" variant="ghost"
              className="h-8 border border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => downloadCsv(records, `${rangeLabel}.csv`)}
              disabled={!records.length}
              title={selectedLocation !== "all" ? `Export ${records.length} records for ${selectedLocation}` : `Export all ${records.length} records`}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
            <Button size="sm" variant="ghost"
              className="h-8 border border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => downloadPdf(records, `${rangeLabel}.pdf`, "Leave Analytics Report", rangeStart, rangeEnd, selectedLocation)}
              disabled={!records.length}
              title={selectedLocation !== "all" ? `Export PDF for ${selectedLocation}` : "Export PDF for all regions"}>
              <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF
            </Button>
            <Button size="sm" variant="ghost"
              className="h-8 border border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => void sendFiveDayResumeReminders()}
              disabled={sendingReminder}>
              <Clock className={`w-3.5 h-3.5 mr-1.5 ${sendingReminder ? "animate-pulse" : ""}`} />
              {sendingReminder ? "Sending..." : "Send 5-Day Reminders"}
            </Button>
          </div>
        </div>

        {/* Date range + location filter controls */}
        <div className="relative mt-5 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">From</p>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 backdrop-blur-sm">
              <Calendar className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <input type="date" value={range.start}
                onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
                className="bg-transparent text-sm text-white outline-none w-32 [color-scheme:dark]" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">To</p>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 backdrop-blur-sm">
              <Calendar className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <input type="date" value={range.end}
                onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
                className="bg-transparent text-sm text-white outline-none w-32 [color-scheme:dark]" />
            </div>
          </div>

          {/* Location / Region Filter */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Region / Location</p>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 backdrop-blur-sm">
              <MapPin className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <select
                value={selectedLocation}
                onChange={e => setSelectedLocation(e.target.value)}
                className="bg-transparent text-sm text-white outline-none min-w-[160px] [color-scheme:dark] cursor-pointer"
              >
                <option value="all">All Regions</option>
                {allLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          <Button size="sm" onClick={load} disabled={loading}
            className="h-9 bg-white text-indigo-900 hover:bg-purple-50 font-semibold shadow-sm">
            Apply Range
          </Button>

          {/* Active filter badge */}
          {selectedLocation !== "all" && (
            <div className="flex items-center gap-1.5 rounded-xl border border-purple-400/40 bg-purple-500/20 px-3 py-2 text-xs text-purple-200">
              <MapPin className="w-3 h-3" />
              <span>Filtered: {selectedLocation}</span>
              <button
                onClick={() => setSelectedLocation("all")}
                className="ml-1 rounded-full hover:text-white transition-colors text-purple-300"
                aria-label="Clear location filter"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Filter summary line */}
        {!loading && analytics && (
          <div className="relative mt-3 text-xs text-slate-400">
            Showing <span className="text-white font-medium">{records.length}</span> record{records.length !== 1 ? "s" : ""}
            {selectedLocation !== "all" && (
              <> for <span className="text-purple-300 font-medium">{selectedLocation}</span></>
            )}
            {" "}· <span className="text-white font-medium">{fmt(rangeStart)}</span> to <span className="text-white font-medium">{fmt(rangeEnd)}</span>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <div className="relative mb-4">
            <div className="h-10 w-10 rounded-full border-2 border-slate-200" />
            <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-t-purple-600 animate-spin" />
          </div>
          <p className="text-sm font-medium">Loading analytics data…</p>
        </div>
      )}

      {!loading && analytics && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Outstanding" value={totals.outstanding_requests ?? 0} icon={AlertCircle}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600" textColor="text-amber-100" />
            <StatCard label="Approved Total" value={totals.approved_total ?? 0} icon={CheckCircle2}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600" textColor="text-emerald-100" />
            <StatCard label="On Leave Now" value={totals.staff_on_leave_now ?? 0} icon={Activity}
              gradient="bg-gradient-to-br from-blue-500 to-indigo-600" textColor="text-blue-100" />
            <StatCard label="Yet to Enjoy" value={totals.staff_yet_to_enjoy ?? 0} icon={Clock}
              gradient="bg-gradient-to-br from-violet-500 to-purple-600" textColor="text-violet-100" />
            <StatCard label="Completed" value={totals.staff_completed_leave ?? 0} icon={Layers}
              gradient="bg-gradient-to-br from-teal-500 to-cyan-600" textColor="text-teal-100" />
            <StatCard label="Unique Staff" value={totals.unique_staff_in_range ?? 0} icon={Users}
              gradient="bg-gradient-to-br from-pink-500 to-rose-600" textColor="text-pink-100" />
          </div>

          {/* ── Charts ── */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Leave Type Breakdown */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-purple-100 p-1.5">
                  <BarChart3 className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Leave by Type</h3>
                  <p className="text-[11px] text-slate-400">{typeBreakdown.length} leave categories</p>
                </div>
              </div>
              <div className="space-y-3">
                {typeBreakdown.length === 0
                  ? <p className="py-8 text-center text-sm text-slate-400">No data for selected period</p>
                  : typeBreakdown.map((t: any) => (
                    <BarRow key={t.leave_type_key}
                      label={leaveLabel(t.leave_type_key)}
                      value={Number(t.total || 0)}
                      max={maxType}
                      gradient="from-violet-500 to-purple-600" />
                  ))}
              </div>
            </div>

            {/* Location Ranking */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-emerald-100 p-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Leave by Location</h3>
                  <p className="text-[11px] text-slate-400">{locationRanking.length} locations</p>
                </div>
              </div>
              <div className="space-y-3">
                {locationRanking.length === 0
                  ? <p className="py-8 text-center text-sm text-slate-400">No data for selected period</p>
                  : locationRanking.map((l: any) => (
                    <BarRow key={l.name || "Unknown"}
                      label={l.name || "Unknown"}
                      value={Number(l.total || 0)}
                      max={maxLoc}
                      gradient="from-emerald-500 to-teal-600" />
                  ))}
              </div>
            </div>
          </div>

          {/* ── Current Roster ── */}
          {roster.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-blue-100 p-1.5">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Currently on Leave</h3>
                    <p className="text-[11px] text-slate-400">Active approved leave today</p>
                  </div>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50">{roster.length}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Staff</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ID</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Leave Type</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Period</th>
                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {roster.map((r: any, i) => (
                      <tr key={r.id || i} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{r.staff_name}</td>
                        <td className="py-3 px-3 text-slate-500 font-mono">{r.employee_id || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{r.department_name || "—"}</td>
                        <td className="py-3 px-3">
                          <Badge variant="outline" className="text-[10px] border-indigo-200 bg-indigo-50 text-indigo-700">{leaveLabel(r.leave_type_key)}</Badge>
                        </td>
                        <td className="py-3 px-3 text-slate-500">{r.start_date} → {r.end_date}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">{r.days}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Full Records ── */}
          {records.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-slate-100 p-1.5">
                    <FileText className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">All Leave Records</h3>
                    <p className="text-[11px] text-slate-400">{fmt(rangeStart)} — {fmt(rangeEnd)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => downloadCsv(records, `${rangeLabel}.csv`)}>
                    <Download className="w-3 h-3" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => downloadPdf(records, `${rangeLabel}.pdf`, "Leave Analytics Report", rangeStart, rangeEnd)}>
                    <FileText className="w-3 h-3" /> PDF
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Staff</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">ID</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Start</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">End</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Days Left</th>
                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.map((r: any, i) => (
                      <tr key={r.id || i} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{r.staff_name}</td>
                        <td className="py-3 px-3 text-slate-500 font-mono">{r.employee_id || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{r.department_name || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{r.location_name || "—"}</td>
                        <td className="py-3 px-3">
                          <Badge variant="outline" className="text-[10px] border-purple-200 bg-purple-50 text-purple-700">{leaveLabel(r.leave_type_key)}</Badge>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{r.start_date}</td>
                        <td className="py-3 px-3 text-slate-600">{r.end_date}</td>
                        <td className="py-3 px-3 text-slate-600 font-medium">{daysLeftToResume(String(r.start_date || ""), String(r.end_date || ""))}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">{r.days}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {records.length === 0 && roster.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
              <div className="mb-4 rounded-2xl bg-slate-100 p-4">
                <TrendingUp className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-semibold text-slate-700">No leave data for this period</p>
              <p className="mt-1 text-sm text-slate-400">Adjust the date range above and click Apply Range.</p>
            </div>
          )}
        </>
      )}

      {!loading && loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-sm text-rose-700">{loadError}</p>
        </div>
      )}
    </div>
  )
}
