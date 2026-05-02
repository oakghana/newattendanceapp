"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp, Download, RefreshCw, Calendar, Users, Clock,
  CheckCircle2, AlertCircle, MapPin, BarChart3, FileText,
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

async function downloadPdf(rows: any[], fileName: string, title: string, rangeStart: string, rangeEnd: string) {
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
  doc.text(`Generated: ${new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra" })}`, 14, 33)

  autoTable(doc, {
    startY: 38,
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
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card className={`border-0 shadow-sm bg-gradient-to-br ${color}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-xl bg-white/30 p-2">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-white/80 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-slate-600 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-xs font-semibold text-slate-700 text-right">{value}</span>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function HrLeaveAnalyticsPanel() {
  const [range, setRange] = useState(getCurrentMonthRange)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load leave analytics")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end])

  useEffect(() => { load() }, [load])

  const analytics = data?.analytics
  const records: any[] = analytics?.records ?? []
  const roster: any[] = analytics?.current_leave_roster ?? []
  const typeBreakdown: any[] = analytics?.leave_type_breakdown ?? []
  const locationRanking: any[] = analytics?.location_ranking ?? []
  const totals = analytics?.totals ?? {}
  const maxType = Math.max(...typeBreakdown.map((t: any) => Number(t.total || 0)), 1)
  const maxLoc = Math.max(...locationRanking.map((l: any) => Number(l.total || 0)), 1)
  const rangeStart = data?.rangeStart ?? range.start
  const rangeEnd = data?.rangeEnd ?? range.end

  const rangeLabel = `leave_analytics_${range.start}_to_${range.end}`

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-800 via-purple-700 to-violet-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Leave Analytics Dashboard
            </h2>
            <p className="text-purple-200 text-sm mt-1">
              Executive insights · Quality Control Company Limited
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => downloadCsv(records, `${rangeLabel}.csv`)}
              disabled={!records.length}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => downloadPdf(records, `${rangeLabel}.pdf`, "Leave Analytics Report", rangeStart, rangeEnd)}
              disabled={!records.length}>
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          </div>
        </div>

        {/* Date range controls */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/20">
            <Calendar className="w-4 h-4 text-purple-200 shrink-0" />
            <span className="text-xs text-purple-200">From</span>
            <input type="date" value={range.start}
              onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
              className="bg-transparent text-white text-sm border-none outline-none w-32" />
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/20">
            <Calendar className="w-4 h-4 text-purple-200 shrink-0" />
            <span className="text-xs text-purple-200">To</span>
            <input type="date" value={range.end}
              onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
              className="bg-transparent text-white text-sm border-none outline-none w-32" />
          </div>
          <Button size="sm" onClick={load} disabled={loading}
            className="bg-white text-purple-800 hover:bg-purple-50 font-semibold">
            Apply
          </Button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
          <p className="text-sm">Loading analytics…</p>
        </div>
      )}

      {!loading && analytics && (
        <>
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Outstanding" value={totals.outstanding_requests ?? 0} icon={AlertCircle} color="from-amber-500 to-orange-500" />
            <StatCard label="Approved Total" value={totals.approved_total ?? 0} icon={CheckCircle2} color="from-emerald-600 to-green-500" />
            <StatCard label="On Leave Now" value={totals.staff_on_leave_now ?? 0} icon={Users} color="from-blue-600 to-blue-500" />
            <StatCard label="Yet to Enjoy" value={totals.staff_yet_to_enjoy ?? 0} icon={Clock} color="from-violet-600 to-purple-500" />
            <StatCard label="Completed" value={totals.staff_completed_leave ?? 0} icon={CheckCircle2} color="from-teal-600 to-teal-500" />
            <StatCard label="Unique Staff" value={totals.unique_staff_in_range ?? 0} icon={Users} color="from-pink-600 to-rose-500" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Leave Type Breakdown ── */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-600" /> Leave by Type
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {typeBreakdown.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No data for period</p>}
                {typeBreakdown.map((t: any) => (
                  <MiniBar key={t.leave_type_key}
                    label={leaveLabel(t.leave_type_key)}
                    value={Number(t.total || 0)}
                    max={maxType}
                    color="bg-purple-500" />
                ))}
              </CardContent>
            </Card>

            {/* ── Location Ranking ── */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" /> Staff on Leave by Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {locationRanking.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No data for period</p>}
                {locationRanking.map((l: any) => (
                  <MiniBar key={l.name || "Unknown"}
                    label={l.name || "Unknown"}
                    value={Number(l.total || 0)}
                    max={maxLoc}
                    color="bg-emerald-500" />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── Current Roster ── */}
          {roster.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" /> Staff Currently on Leave
                  <Badge variant="secondary" className="ml-1 text-xs">{roster.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Staff</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Emp. ID</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Department</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Leave Type</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Start</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">End</th>
                        <th className="text-right py-2 px-2 text-slate-500 font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((r: any, i) => (
                        <tr key={r.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 px-2 font-medium text-slate-800">{r.staff_name}</td>
                          <td className="py-2 px-2 text-slate-500">{r.employee_id || "—"}</td>
                          <td className="py-2 px-2 text-slate-500">{r.department_name || "—"}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700">{leaveLabel(r.leave_type_key)}</Badge>
                          </td>
                          <td className="py-2 px-2 text-slate-600">{r.start_date}</td>
                          <td className="py-2 px-2 text-slate-600">{r.end_date}</td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-700">{r.days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Full Records ── */}
          {records.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" /> All Leave Records in Period
                  <Badge variant="secondary" className="ml-1 text-xs">{records.length}</Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => downloadCsv(records, `${rangeLabel}.csv`)}>
                    <Download className="w-3 h-3 mr-1" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => downloadPdf(records, `${rangeLabel}.pdf`, "Leave Analytics Report", rangeStart, rangeEnd)}>
                    <FileText className="w-3 h-3 mr-1" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Staff</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Emp. ID</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Department</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Location</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Leave Type</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Start</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">End</th>
                        <th className="text-right py-2 px-2 text-slate-500 font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r: any, i) => (
                        <tr key={r.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 px-2 font-medium text-slate-800">{r.staff_name}</td>
                          <td className="py-2 px-2 text-slate-500">{r.employee_id || "—"}</td>
                          <td className="py-2 px-2 text-slate-500">{r.department_name || "—"}</td>
                          <td className="py-2 px-2 text-slate-500">{r.location_name || "—"}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className="text-[10px] border-purple-200 text-purple-700">{leaveLabel(r.leave_type_key)}</Badge>
                          </td>
                          <td className="py-2 px-2 text-slate-600">{r.start_date}</td>
                          <td className="py-2 px-2 text-slate-600">{r.end_date}</td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-700">{r.days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {records.length === 0 && roster.length === 0 && (
            <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No leave data for this period</p>
              <p className="text-sm mt-1">Adjust the date range above and click Apply.</p>
            </div>
          )}
        </>
      )}

      {!loading && loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
        </div>
      )}
    </div>
  )
}
