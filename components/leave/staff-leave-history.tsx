"use client"

import { useState, useEffect } from "react"
import { History, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface LeaveRecord {
  id: string
  leave_type_key: string
  status: string
  preferred_start_date: string
  preferred_end_date: string
  adjusted_start_date: string | null
  adjusted_end_date: string | null
  requested_days: number
  adjusted_days: number | null
  reason: string | null
  leave_year_period: string
  created_at: string
  manager_recommendation: string | null
  hr_office_remarks: string | null
}

interface HistoryStats {
  currentYear: { total: number; approved: number; daysUsed: number; pending: number }
  previousYear: { total: number; approved: number; daysUsed: number }
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  study: "Study",
  unpaid: "Unpaid",
  casual: "Casual",
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  approved: { label: "Approved", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  hr_approved: { label: "HR Approved", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  hod_approved: { label: "HOD Approved", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  manager_confirmed: { label: "Manager Confirmed", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  hr_office_forwarded: { label: "Forwarded to HR", color: "bg-violet-50 text-violet-700 border-violet-200", icon: <Clock className="h-3 w-3" /> },
  pending: { label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="h-3 w-3" /> },
  pending_manager_review: { label: "Awaiting HOD", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="h-3 w-3" /> },
  submitted: { label: "Submitted", color: "bg-slate-50 text-slate-700 border-slate-200", icon: <Clock className="h-3 w-3" /> },
  rejected: { label: "Rejected", color: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", color: "bg-slate-50 text-slate-500 border-slate-200", icon: <XCircle className="h-3 w-3" /> },
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-slate-50 text-slate-600 border-slate-200", icon: <AlertCircle className="h-3 w-3" /> }
  return (
    <Badge className={`inline-flex items-center gap-1 border text-xs px-2 py-0.5 ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  )
}

function RecordRow({ record }: { record: LeaveRecord }) {
  const effectiveDays = record.adjusted_days ?? record.requested_days
  const effectiveStart = record.adjusted_start_date ?? record.preferred_start_date
  const effectiveEnd = record.adjusted_end_date ?? record.preferred_end_date
  const typeLabel = LEAVE_TYPE_LABELS[record.leave_type_key] ?? record.leave_type_key

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">{typeLabel} Leave</span>
          <StatusBadge status={record.status} />
        </div>
        <span className="text-xs text-slate-500">
          {fmtDate(effectiveStart)} &ndash; {fmtDate(effectiveEnd)}
          {record.adjusted_start_date && (
            <span className="ml-2 text-amber-600">(adjusted)</span>
          )}
        </span>
        {record.reason && (
          <span className="text-xs text-slate-400 italic mt-0.5 truncate max-w-xs">{record.reason}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {effectiveDays} day{effectiveDays !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  )
}

interface StaffLeaveHistoryProps {
  userId: string
  staffName: string
}

export function StaffLeaveHistory({ userId, staffName }: StaffLeaveHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [currentRecords, setCurrentRecords] = useState<LeaveRecord[]>([])
  const [previousRecords, setPreviousRecords] = useState<LeaveRecord[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [currentPeriod, setCurrentPeriod] = useState("")
  const [previousPeriod, setPreviousPeriod] = useState("")
  const [showPrevious, setShowPrevious] = useState(false)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/leave/staff-history?userId=${userId}`)
        const data = await res.json()
        if (data.success) {
          setCurrentRecords(data.current || [])
          setPreviousRecords(data.previous || [])
          setStats(data.stats)
          setCurrentPeriod(data.currentPeriod)
          setPreviousPeriod(data.previousPeriod)
          setFetched(true)
        }
      } catch {
        // silently fail — history is supplementary
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <History className="h-4 w-4 animate-pulse" />
          Loading leave history for {staffName}...
        </div>
      </div>
    )
  }

  if (!fetched) return null

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-800">Leave History — {staffName}</span>
        </div>
        <span className="text-xs text-slate-500">For informed HR decision-making</span>
      </div>

      {/* Current year stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-blue-600">This Year</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.total ?? 0}</p>
          <p className="text-[10px] text-slate-500">requests</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-emerald-600">Approved</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.approved ?? 0}</p>
          <p className="text-[10px] text-slate-500">this period</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-amber-600">Days Used</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.daysUsed ?? 0}</p>
          <p className="text-[10px] text-slate-500">{currentPeriod}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Pending</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.pending ?? 0}</p>
          <p className="text-[10px] text-slate-500">awaiting review</p>
        </div>
      </div>

      {/* Current year records */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{currentPeriod} (Current Year)</p>
        {currentRecords.length === 0 ? (
          <p className="text-sm text-slate-400 italic px-1">No leave records found for this period.</p>
        ) : (
          <div className="space-y-1.5">
            {currentRecords.map((r) => <RecordRow key={r.id} record={r} />)}
          </div>
        )}
      </div>

      {/* Previous year toggle */}
      {previousRecords.length > 0 && (
        <div className="space-y-1.5 border-t border-blue-100 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-slate-600 hover:text-slate-900 px-1"
            onClick={() => setShowPrevious((v) => !v)}
          >
            {showPrevious ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showPrevious ? "Hide" : "Show"} previous year ({previousPeriod} — {stats?.previousYear.daysUsed ?? 0} days used, {stats?.previousYear.approved ?? 0} approved)
          </Button>
          {showPrevious && (
            <div className="space-y-1.5">
              {previousRecords.map((r) => <RecordRow key={r.id} record={r} />)}
            </div>
          )}
        </div>
      )}

      {previousRecords.length === 0 && (
        <p className="text-xs text-slate-400 italic border-t border-blue-100 pt-2">No records found for previous year ({previousPeriod}).</p>
      )}
    </div>
  )
}
