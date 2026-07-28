'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Search, Download, TrendingUp, TrendingDown, CheckCircle2, XCircle, Clock, RefreshCw, CalendarDays, Award } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface CarryoverRequest {
  id: string
  staff_id: string
  staff_name: string
  staff_employee_id: string
  staff_position: string
  staff_department: string
  leave_year: string
  leave_type_key: string
  balance_available: number
  max_carryover_allowed: number
  requested_carryover_days: number
  approved_days: number
  forfeited_days: number
  status: string
  requested_at: string
  approval_note: string
  approval_reason: string
  forfeited_reason: string
}

const STATUS_CONFIG = {
  PENDING:  { color: 'bg-amber-100 text-amber-800 border-amber-200',  dot: 'bg-amber-500',   label: 'Pending',  icon: <Clock className="h-3.5 w-3.5" /> },
  APPROVED: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', label: 'Approved', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  REJECTED: { color: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', label: 'Rejected', icon: <XCircle className="h-3.5 w-3.5" /> },
} as const

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  if (!cfg) return <Badge variant="outline">{status}</Badge>
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function CarryoverApprovalDashboard() {
  const [carryoverRequests, setCarryoverRequests] = useState<CarryoverRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [leaveYear, setLeaveYear] = useState('2025/2026')
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    fetchCarryovers()
  }, [filterStatus, leaveYear])

  const fetchCarryovers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'ALL') params.append('status', filterStatus)
      if (leaveYear) params.append('leave_year', leaveYear)
      params.append('limit', '100')

      const res = await fetch(`/api/leave/carryover/pending?${params.toString()}`)
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        toast({ title: 'Error', description: errorData.error || `Failed to load (${res.status})`, variant: 'destructive' })
        setCarryoverRequests([])
        return
      }
      const data = await res.json()
      setCarryoverRequests(data.carryover_requests || [])
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load carryover data', variant: 'destructive' })
      setCarryoverRequests([])
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    pending:  carryoverRequests.filter(r => r.status === 'PENDING').length,
    approved: carryoverRequests.filter(r => r.status === 'APPROVED').length,
    rejected: carryoverRequests.filter(r => r.status === 'REJECTED').length,
    totalRequested: carryoverRequests.reduce((s, r) => s + (r.requested_carryover_days || 0), 0),
    totalApproved:  carryoverRequests.reduce((s, r) => s + (r.approved_days || 0), 0),
    totalForfeited: carryoverRequests.reduce((s, r) => s + (r.forfeited_days || 0), 0),
  }

  const allLeaveTypes = Array.from(new Set(carryoverRequests.map(r => r.leave_type_key).filter(Boolean)))

  const filteredRequests = carryoverRequests.filter(req => {
    const matchSearch = !searchTerm ||
      req.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.staff_employee_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.staff_department?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = !leaveTypeFilter || req.leave_type_key === leaveTypeFilter
    return matchSearch && matchType
  })

  const exportToCSV = () => {
    const headers = ['Staff Name','Employee ID','Department','Leave Year','Leave Type','Requested Days','Approved Days','Forfeited Days','Status','Date']
    const rows = filteredRequests.map(req => [
      req.staff_name, req.staff_employee_id, req.staff_department, req.leave_year,
      req.leave_type_key, req.requested_carryover_days, req.approved_days || 0,
      req.forfeited_days || 0, req.status, new Date(req.requested_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `carryover-${leaveYear.replace('/', '-')}.csv`
    a.click()
  }

  const FILTER_TABS = [
    { key: 'ALL', label: 'All', count: carryoverRequests.length },
    { key: 'PENDING', label: 'Pending', count: stats.pending },
    { key: 'APPROVED', label: 'Approved', count: stats.approved },
    { key: 'REJECTED', label: 'Rejected', count: stats.rejected },
  ] as const

  return (
    <div className="space-y-6">
      {/* Gradient header banner */}
      <div className="rounded-2xl bg-gradient-to-br from-orange-600 via-amber-500 to-yellow-400 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="h-5 w-5 opacity-90" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] opacity-90">Carryover & Audit</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Leave Balance Carryover</h2>
            <p className="mt-1 text-sm opacity-85">Review, approve and audit staff carryover requests</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={leaveYear}
              onChange={(e) => setLeaveYear(e.target.value)}
              className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm font-semibold text-white placeholder-white/70 backdrop-blur focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <option value="2025/2026" className="text-slate-900">2025 / 2026</option>
              <option value="2024/2025" className="text-slate-900">2024 / 2025</option>
              <option value="2023/2024" className="text-slate-900">2023 / 2024</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchCarryovers}
              disabled={loading}
              className="bg-white/20 text-white border border-white/30 hover:bg-white/30 backdrop-blur"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pending Review',   value: stats.pending,       icon: <Clock className="h-6 w-6" />,        bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   num: 'text-amber-600'  },
          { label: 'Approved',         value: stats.approved,      icon: <CheckCircle2 className="h-6 w-6" />, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', num: 'text-emerald-600'},
          { label: 'Rejected',         value: stats.rejected,      icon: <XCircle className="h-6 w-6" />,      bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     num: 'text-red-600'   },
          { label: 'Total Days Req.',  value: stats.totalRequested, icon: <Award className="h-6 w-6" />,        bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    num: 'text-blue-600'  },
        ].map(({ label, value, icon, bg, border, text, num }) => (
          <Card key={label} className={`${bg} ${border} border transition-shadow hover:shadow-md`}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${text} mb-1`}>{label}</p>
                  <p className={`text-4xl font-extrabold ${num} tabular-nums`}>{loading ? '—' : value}</p>
                </div>
                <div className={`rounded-xl ${bg} ${text} p-2.5 opacity-80`}>{icon}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary breakdown (only when data) */}
      {carryoverRequests.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Days Approved</p>
              <p className="text-2xl font-bold text-blue-700">{stats.totalApproved}</p>
            </div>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 flex items-center gap-3">
            <TrendingDown className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-xs text-rose-600 font-semibold uppercase tracking-wide">Days Forfeited</p>
              <p className="text-2xl font-bold text-rose-700">{stats.totalForfeited}</p>
            </div>
          </div>
          <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 flex items-center gap-3">
            <Award className="h-5 w-5 text-purple-600 shrink-0" />
            <div>
              <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Total Adjustments</p>
              <p className="text-2xl font-bold text-purple-700">{stats.approved + stats.rejected}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status pill tabs */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
          {FILTER_TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterStatus === key
                  ? 'bg-white shadow text-slate-900 border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${filterStatus === key ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-500'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, ID or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 rounded-xl border-slate-200"
          />
        </div>

        {/* Leave type filter */}
        {allLeaveTypes.length > 0 && (
          <select
            value={leaveTypeFilter}
            onChange={(e) => setLeaveTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white text-slate-700"
          >
            <option value="">All Types</option>
            {allLeaveTypes.map(t => (
              <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        )}

        {/* Export */}
        <Button onClick={exportToCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-orange-400" />
          <span className="ml-3 text-slate-500 font-medium">Loading carryover records...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredRequests.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-16 flex flex-col items-center gap-3">
          <span className="text-5xl select-none">📂</span>
          <p className="text-base font-semibold text-slate-600">No carryover records found</p>
          <p className="text-sm text-slate-400">
            {carryoverRequests.length > 0 ? 'Try adjusting your search or filters.' : 'There are no carryover records for this period.'}
          </p>
        </div>
      )}

      {/* Records table */}
      {!loading && filteredRequests.length > 0 && (
        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                  {['Date','Staff','Department','Leave Year','Type','Req. Days','Approved','Forfeited','Status','Note'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((request, i) => (
                  <tr key={request.id} className={`transition-colors hover:bg-orange-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(request.requested_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 leading-tight">{request.staff_name || '—'}</p>
                      <p className="text-xs text-slate-400">{request.staff_employee_id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{request.staff_department || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {request.leave_year}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-lg bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800 uppercase">
                        {(request.leave_type_key || 'LEAVE').replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{request.requested_carryover_days ?? 0}</td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-600">{request.approved_days || 0}</td>
                    <td className="px-4 py-3 text-center font-bold text-rose-500">{request.forfeited_days || 0}</td>
                    <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={request.approval_reason || request.forfeited_reason || ''}>
                      {request.approval_reason || request.forfeited_reason || <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            Showing {filteredRequests.length} of {carryoverRequests.length} records
          </div>
        </Card>
      )}
    </div>
  )
}
