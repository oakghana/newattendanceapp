'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Send,
  RotateCcw,
  CalendarClock,
  FileText,
  ChevronRight,
  RefreshCw,
  UserCheck,
  X,
  Calendar,
  Building2,
  Hash,
  Briefcase,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format, parseISO } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveRequest {
  id: string
  user_id: string
  leave_type_key: string
  preferred_start_date: string
  preferred_end_date: string
  status: string
  hod_approved_at?: string | null
  created_at: string
  staff?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
    department?: { name: string } | null
  }
}

interface DeferRecallRequest {
  id: string
  staff_user_id: string
  request_reason?: string
  recall_reason?: string
  deferment_to_year?: string
  created_at: string
  hod_approval_status: string
  assigned_hr_executive_id?: string | null
  staff?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
  } | null
  department?: { id: string; name: string } | null
  leave?: { id: string; leave_type: string } | null
  type: 'deferment' | 'recall'
}

interface HRExecutive {
  id: string
  name: string
  position: string
}

interface MetricCard {
  label: string
  count: number
  icon: React.ReactNode
  colour: string
  bg: string
  border: string
  tab: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr?: string | null) {
  if (!dateStr) return '—'
  try { return format(parseISO(dateStr), 'd MMM yyyy') } catch { return dateStr }
}

function leaveTypeLabel(key: string) {
  const map: Record<string, string> = {
    annual: 'Annual Leave', sick: 'Sick Leave', maternity: 'Maternity',
    paternity: 'Paternity', casual: 'Casual Leave', compassionate: 'Compassionate',
    study_with_pay: 'Study (Paid)', study_without_pay: 'Study (Unpaid)',
  }
  return map[key?.toLowerCase()] ?? key ?? 'Leave'
}

function daysBetween(start: string, end: string) {
  try {
    const ms = parseISO(end).getTime() - parseISO(start).getTime()
    return Math.max(1, Math.round(ms / 86400000) + 1)
  } catch { return 0 }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StaffInfo({ name, employeeId, position, department }: { name: string; employeeId?: string; position?: string; department?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold text-slate-900 text-sm">{name || 'Unknown Staff'}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {employeeId && <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{employeeId}</span>}
        {position && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{position}</span>}
        {department && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{department}</span>}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <FileText className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HRLeaveOfficeRequestDashboard() {
  const { toast } = useToast()

  // Data state
  const [hodPendingRequests, setHodPendingRequests] = useState<LeaveRequest[]>([])
  const [hrPendingRequests, setHrPendingRequests] = useState<LeaveRequest[]>([])
  const [defermentRequests, setDefermentRequests] = useState<DeferRecallRequest[]>([])
  const [recallRequests, setRecallRequests] = useState<DeferRecallRequest[]>([])
  const [hrExecutives, setHrExecutives] = useState<HRExecutive[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // UI state
  const [search, setSearch] = useState('')
  const [actionModal, setActionModal] = useState<{
    open: boolean
    type: 'leave-approve' | 'leave-reject' | 'assign-exec'
    requestId: string
    requestKind: 'deferment' | 'recall'
    staffName: string
  } | null>(null)
  const [selectedExecutive, setSelectedExecutive] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    try {
      const [deferRecallRes, execRes, allRequestsRes] = await Promise.all([
        fetch('/api/leave/deferment-recall/pending-requests'),
        fetch('/api/admin/users/by-role?roles=hr_executive,manager_hr,director_hr'),
        fetch('/api/leave/requests?status=hod_approved,pending&limit=100'),
      ])

      // Deferments & Recalls
      if (deferRecallRes.ok) {
        const data = await deferRecallRes.json()
        setDefermentRequests((data.defermentRequests || []).map((r: any) => ({ ...r, type: 'deferment' })))
        setRecallRequests((data.recallRequests || []).map((r: any) => ({ ...r, type: 'recall' })))
      }

      // HR Executives
      if (execRes.ok) {
        const execData = await execRes.json()
        setHrExecutives(
          (execData.data || execData.users || []).map((u: any) => ({
            id: u.id,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
            position: u.position || 'HR Executive',
          }))
        )
      }

      // Leave requests in processing states
      if (allRequestsRes.ok) {
        const reqData = await allRequestsRes.json()
        const requests: LeaveRequest[] = reqData.requests || reqData.data || []
        setHodPendingRequests(requests.filter((r) => r.status === 'pending'))
        setHrPendingRequests(requests.filter((r) => r.status === 'hod_approved'))
      }
    } catch (err: any) {
      if (!silent) {
        toast({ title: 'Error loading data', description: err.message || 'Please try again.', variant: 'destructive' })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Action handlers ────────────────────────────────────────────────────────

  const openAssignModal = (req: DeferRecallRequest) => {
    setActionModal({ open: true, type: 'assign-exec', requestId: req.id, requestKind: req.type, staffName: req.staff ? `${req.staff.first_name} ${req.staff.last_name}` : 'Staff' })
    setSelectedExecutive('')
    setActionNotes('')
  }

  const handleAssignSubmit = async () => {
    if (!actionModal || !selectedExecutive) {
      toast({ title: 'Select an HR executive first', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/leave/deferment-recall/assign-to-executive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: actionModal.requestKind, requestId: actionModal.requestId, hrExecutiveId: selectedExecutive, notes: actionNotes || null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to assign') }
      toast({ title: 'Assigned successfully' })
      setActionModal(null)
      fetchData(true)
    } catch (err: any) {
      toast({ title: 'Assignment failed', description: err.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Filter helpers ─────────────────────────────────────────────────────────

  function filterLeave(list: LeaveRequest[]) {
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter((r) =>
      r.staff?.first_name?.toLowerCase().includes(q) ||
      r.staff?.last_name?.toLowerCase().includes(q) ||
      r.staff?.employee_id?.toLowerCase().includes(q)
    )
  }

  function filterDeferRecall(list: DeferRecallRequest[]) {
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter((r) =>
      r.staff?.first_name?.toLowerCase().includes(q) ||
      r.staff?.last_name?.toLowerCase().includes(q) ||
      r.staff?.employee_id?.toLowerCase().includes(q)
    )
  }

  // ── Metric cards data ──────────────────────────────────────────────────────

  const metrics: MetricCard[] = [
    {
      label: 'Awaiting HOD Approval',
      count: hodPendingRequests.length,
      icon: <Clock className="h-5 w-5" />,
      colour: 'text-amber-700',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      tab: 'hod-pending',
    },
    {
      label: 'Awaiting HR Action',
      count: hrPendingRequests.length,
      icon: <UserCheck className="h-5 w-5" />,
      colour: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      tab: 'hr-pending',
    },
    {
      label: 'Deferments Pending',
      count: defermentRequests.length,
      icon: <CalendarClock className="h-5 w-5" />,
      colour: 'text-violet-700',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      tab: 'deferments',
    },
    {
      label: 'Recalls Pending',
      count: recallRequests.length,
      icon: <RotateCcw className="h-5 w-5" />,
      colour: 'text-rose-700',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      tab: 'recalls',
    },
  ]

  const totalPending = metrics.reduce((a, m) => a + m.count, 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Processing Requests</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Review and action leave, deferment, and recall requests assigned to HR Leave Office
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.tab} className={`border ${m.border} ${m.bg} shadow-none`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 leading-tight">{m.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${m.colour}`}>{m.count}</p>
                </div>
                <div className={`p-2 rounded-lg ${m.bg} border ${m.border} ${m.colour}`}>
                  {m.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPending === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-20 text-slate-400">
            <CheckCircle2 className="h-12 w-12 mb-4 text-emerald-400" />
            <p className="text-base font-semibold text-slate-600">All clear — no pending requests</p>
            <p className="text-sm mt-1">All leave, deferment, and recall requests are processed.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name or staff ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          {/* Tabbed sections */}
          <Tabs defaultValue="hod-pending">
            <TabsList className="flex h-auto w-full flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <TabsTrigger value="hod-pending" className="rounded-lg px-4 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-amber-700">
                Awaiting HOD
                {hodPendingRequests.length > 0 && (
                  <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-amber-100 text-amber-700 border-0">{hodPendingRequests.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="hr-pending" className="rounded-lg px-4 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700">
                Awaiting HR Action
                {hrPendingRequests.length > 0 && (
                  <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-blue-100 text-blue-700 border-0">{hrPendingRequests.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="deferments" className="rounded-lg px-4 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-violet-700">
                Deferments
                {defermentRequests.length > 0 && (
                  <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-violet-100 text-violet-700 border-0">{defermentRequests.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="recalls" className="rounded-lg px-4 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-rose-700">
                Recalls
                {recallRequests.length > 0 && (
                  <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-rose-100 text-rose-700 border-0">{recallRequests.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Awaiting HOD ─────────────────────────────────────────────── */}
            <TabsContent value="hod-pending" className="mt-4">
              {filterLeave(hodPendingRequests).length === 0 ? (
                <EmptyState message="No requests awaiting HOD approval" />
              ) : (
                <div className="space-y-3">
                  {filterLeave(hodPendingRequests).map((req) => (
                    <LeaveRequestRow key={req.id} req={req} status="hod-pending" />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Awaiting HR Action ────────────────────────────────────────── */}
            <TabsContent value="hr-pending" className="mt-4">
              {filterLeave(hrPendingRequests).length === 0 ? (
                <EmptyState message="No requests awaiting HR action" />
              ) : (
                <div className="space-y-3">
                  {filterLeave(hrPendingRequests).map((req) => (
                    <LeaveRequestRow key={req.id} req={req} status="hr-pending" onRefresh={() => fetchData(true)} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Deferments ────────────────────────────────────────────────── */}
            <TabsContent value="deferments" className="mt-4">
              {filterDeferRecall(defermentRequests).length === 0 ? (
                <EmptyState message="No deferment requests pending assignment" />
              ) : (
                <div className="space-y-3">
                  {filterDeferRecall(defermentRequests).map((req) => (
                    <DeferRecallRow key={req.id} req={req} onAssign={() => openAssignModal(req)} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Recalls ───────────────────────────────────────────────────── */}
            <TabsContent value="recalls" className="mt-4">
              {filterDeferRecall(recallRequests).length === 0 ? (
                <EmptyState message="No recall requests pending assignment" />
              ) : (
                <div className="space-y-3">
                  {filterDeferRecall(recallRequests).map((req) => (
                    <DeferRecallRow key={req.id} req={req} onAssign={() => openAssignModal(req)} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Assign to HR Executive Modal */}
      <Dialog open={!!actionModal?.open} onOpenChange={() => setActionModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to HR Executive</DialogTitle>
            <DialogDescription>
              Assign this {actionModal?.requestKind} request from{' '}
              <span className="font-semibold text-slate-800">{actionModal?.staffName}</span> to an HR executive for processing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>HR Executive</Label>
              <Select value={selectedExecutive} onValueChange={setSelectedExecutive}>
                <SelectTrigger>
                  <SelectValue placeholder="Select executive..." />
                </SelectTrigger>
                <SelectContent>
                  {hrExecutives.length === 0 ? (
                    <SelectItem value="_none" disabled>No executives available</SelectItem>
                  ) : (
                    hrExecutives.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} — {e.position}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes for the executive..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionModal(null)}>Cancel</Button>
            <Button onClick={handleAssignSubmit} disabled={submitting || !selectedExecutive}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Leave Request Row ─────────────────────────────────────────────────────────

function LeaveRequestRow({ req, status, onRefresh }: { req: LeaveRequest; status: string; onRefresh?: () => void }) {
  const staffName = req.staff ? `${req.staff.first_name} ${req.staff.last_name}` : 'Unknown Staff'
  const days = daysBetween(req.preferred_start_date, req.preferred_end_date)
  const isHodPending = status === 'hod-pending'

  const statusBadge = isHodPending
    ? { label: 'Awaiting HOD', bg: 'bg-amber-100 text-amber-700 border-amber-200' }
    : { label: 'HOD Approved', bg: 'bg-blue-100 text-blue-700 border-blue-200' }

  return (
    <Card className="border border-slate-200 shadow-none hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <FileText className="h-4 w-4 text-slate-500" />
            </div>
            <div className="flex flex-col gap-1">
              <StaffInfo
                name={staffName}
                employeeId={req.staff?.employee_id}
                position={req.staff?.position}
                department={req.staff?.department?.name}
              />
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {leaveTypeLabel(req.leave_type_key)}
                </Badge>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmt(req.preferred_start_date)} — {fmt(req.preferred_end_date)}
                </span>
                <span className="text-xs font-medium text-slate-700">{days} day{days !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`border text-xs font-medium ${statusBadge.bg}`}>{statusBadge.label}</Badge>
            {!isHodPending && (
              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={onRefresh}>
                <ChevronRight className="h-3.5 w-3.5" />
                View
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Deferment / Recall Row ────────────────────────────────────────────────────

function DeferRecallRow({ req, onAssign }: { req: DeferRecallRequest; onAssign: () => void }) {
  const staffName = req.staff ? `${req.staff.first_name} ${req.staff.last_name}` : 'Unknown Staff'
  const isDeferment = req.type === 'deferment'
  const reason = isDeferment ? req.request_reason : req.recall_reason

  return (
    <Card className="border border-slate-200 shadow-none hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDeferment ? 'bg-violet-50' : 'bg-rose-50'}`}>
              {isDeferment
                ? <CalendarClock className="h-4 w-4 text-violet-600" />
                : <RotateCcw className="h-4 w-4 text-rose-600" />
              }
            </div>
            <div className="flex flex-col gap-1">
              <StaffInfo
                name={staffName}
                employeeId={req.staff?.employee_id}
                position={req.staff?.position}
                department={req.department?.name}
              />
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={`text-xs border ${isDeferment ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}
                >
                  {isDeferment ? 'Deferment' : 'Recall'}
                  {isDeferment && req.deferment_to_year && ` → ${req.deferment_to_year}`}
                </Badge>
                {req.leave?.leave_type && (
                  <span className="text-xs text-slate-500">{leaveTypeLabel(req.leave.leave_type)}</span>
                )}
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Submitted {fmt(req.created_at)}
                </span>
              </div>
              {reason && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-md">
                  Reason: {reason}
                </p>
              )}
            </div>
          </div>
          <Button size="sm" onClick={onAssign} className="shrink-0 gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            Assign to Executive
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
