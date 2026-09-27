"use client"

import { useState, useEffect } from "react"
import { History, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface LoanRecord {
  id: string
  request_number: string | null
  loan_type_key: string
  loan_type_label: string | null
  status: string
  requested_amount: number | null
  fixed_amount: number | null
  repayment_status: string | null
  created_at: string
  director_note: string | null
  hod_review_note: string | null
  hr_note: string | null
  _bucket: "approved" | "rejected" | "pending" | "other"
}

interface HistoryStats {
  currentYear: { total: number; approved: number; rejected: number; pending: number }
  previousYear: { total: number; approved: number; rejected: number }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  approved: { label: "Approved", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: "Denied", color: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="h-3 w-3" /> },
  pending: { label: "In Review", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="h-3 w-3" /> },
  other: { label: "Other", color: "bg-slate-50 text-slate-600 border-slate-200", icon: <AlertCircle className="h-3 w-3" /> },
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function fmtAmount(n: number | null | undefined) {
  if (n == null) return "—"
  return `GHc ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatusBadge({ bucket, status }: { bucket: string; status: string }) {
  const cfg = STATUS_CONFIG[bucket] ?? STATUS_CONFIG.other
  return (
    <Badge className={`inline-flex items-center gap-1 border text-xs px-2 py-0.5 ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
      <span className="ml-1 opacity-70">({status.replace(/_/g, " ")})</span>
    </Badge>
  )
}

function RecordRow({ record }: { record: LoanRecord }) {
  const amount = record.fixed_amount ?? record.requested_amount

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">{record.loan_type_label || record.loan_type_key}</span>
          <StatusBadge bucket={record._bucket} status={record.status} />
        </div>
        <span className="text-xs text-slate-500">
          {record.request_number ? `${record.request_number} · ` : ""}Requested {fmtDate(record.created_at)}
        </span>
        {record._bucket === "rejected" && (record.director_note || record.hod_review_note || record.hr_note) && (
          <span className="text-xs text-red-500 italic mt-0.5 truncate max-w-xs">
            {record.director_note || record.hod_review_note || record.hr_note}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {fmtAmount(amount)}
        </span>
      </div>
    </div>
  )
}

interface StaffLoanHistoryProps {
  userId: string
  staffName: string
}

export function StaffLoanHistory({ userId, staffName }: StaffLoanHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [currentRecords, setCurrentRecords] = useState<LoanRecord[]>([])
  const [previousRecords, setPreviousRecords] = useState<LoanRecord[]>([])
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
        const res = await fetch(`/api/loan/staff-history?userId=${userId}`)
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
          Loading loan history for {staffName}...
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
          <span className="text-sm font-semibold text-slate-800">Loan History — {staffName}</span>
        </div>
        <span className="text-xs text-slate-500">For informed HR decision-making</span>
      </div>

      {/* Current year stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-blue-600">{currentPeriod}</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.total ?? 0}</p>
          <p className="text-[10px] text-slate-500">requests</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-emerald-600">Approved</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.approved ?? 0}</p>
          <p className="text-[10px] text-slate-500">this year</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-red-500">Denied</p>
          <p className="text-lg font-bold text-slate-900">{stats?.currentYear.rejected ?? 0}</p>
          <p className="text-[10px] text-slate-500">this year</p>
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
          <p className="text-sm text-slate-400 italic px-1">No loan records found for this year.</p>
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
            {showPrevious ? "Hide" : "Show"} previous year ({previousPeriod} — {stats?.previousYear.approved ?? 0} approved, {stats?.previousYear.rejected ?? 0} denied)
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
