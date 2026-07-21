'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2, CheckCircle, XCircle, Clock, FileText, ChevronDown, ChevronUp,
  Download, Eye, AlertCircle, CalendarClock, RotateCcw
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  first_name: string
  last_name: string
  employee_id: string
  position: string
  departments?: { name: string }
}

interface DefermentRequest {
  id: string
  user_id: string
  reason: string
  requested_deferment_year?: number
  requested_deferment_period?: string
  deferment_start_date?: string
  deferment_end_date?: string
  status: string
  hr_office_decision?: string
  hod_decision?: string
  created_at: string
  user_profiles?: UserProfile
  leave_plan_requests?: {
    id: string
    leave_type_key?: string
    preferred_start_date?: string
    preferred_end_date?: string
    requested_days?: number
  }
}

interface RecallRequest {
  id: string
  staff_user_id: string
  recall_reason: string
  recall_date?: string
  status: string
  hr_decision?: string
  created_at: string
  user_profiles?: UserProfile
  leave_plan_requests?: {
    id: string
    leave_type_key?: string
    preferred_start_date?: string
    preferred_end_date?: string
  }
}

interface PaymentMemo {
  id: string
  staff_id: string
  status: string
  memo_body: string | Record<string, any>
  created_at: string
  signed_at?: string
  signer_name?: string
  signer_position?: string
  staff_category?: string
  leave_month?: string
}

interface ApprovedLeave {
  id: string
  leave_plan_request_id: string | null
  staff_name: string
  employee_id: string
  department: string
  leave_type: string
  start_date: string
  end_date: string
  days_requested: number
  status: string
  signed_by: string
  signed_at: string
  approval_date: string
  payment_amount: number | null
  payment_currency: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  const s = (status || '').toLowerCase()
  if (s === 'approved') return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>
  if (s === 'rejected') return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
  return <Badge className="bg-amber-100 text-amber-700 border-0"><Clock className="h-3 w-3 mr-1" />{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'

const fmtLeaveType = (k?: string) =>
  k ? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Annual Leave'

// ── Main Component ─────────────────────────────────────────────────────────────

// Alias for backward compatibility with leave-management-client.tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HRExecutiveApprovalDashboard(_props: any) {
  return <HrExecutiveApprovalDashboard />
}

export function HrExecutiveApprovalDashboard() {
  const { toast } = useToast()

  const [userId, setUserId]       = useState<string | null>(null)
  const [deferments, setDeferments] = useState<DefermentRequest[]>([])
  const [recalls, setRecalls]       = useState<RecallRequest[]>([])
  const [memos, setMemos]           = useState<PaymentMemo[]>([])
  const [approvedLeaves, setApprovedLeaves] = useState<ApprovedLeave[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeSection, setActiveSection] = useState<'pending' | 'memos' | 'approved-leaves'>('pending')
  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [decisionNote, setDecisionNote]   = useState('')
  const [processingId, setProcessingId]   = useState<string | null>(null)

  // ── Fetch session user ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const id = d?.user?.id || d?.id || null
        setUserId(id)
      })
      .catch(() => setUserId(null))
  }, [])

  // ── Fetch deferments / recalls / approved leaves ─────────────────────────
  const fetchData = async () => {
    setLoading(true)
    try {
      const [deferRes, recallRes, memosRes, leavesRes] = await Promise.all([
        fetch('/api/leave/hr-deferment-recall-management?type=deferment&status=all'),
        fetch('/api/leave/hr-deferment-recall-management?type=recall&status=all'),
        fetch('/api/leave/payment-advice/view-all'),
        fetch('/api/leave/approved-leaves'),
      ])

      const [deferData, recallData, memosData, leavesData] = await Promise.all([
        deferRes.ok ? deferRes.json() : { requests: [] },
        recallRes.ok ? recallRes.json() : { requests: [] },
        memosRes.ok ? memosRes.json() : { memos: [] },
        leavesRes.ok ? leavesRes.json() : { data: [] },
      ])

      setDeferments(deferData.requests || [])
      setRecalls(recallData.requests || [])
      setMemos(memosData.memos || [])
      setApprovedLeaves(leavesData.data || [])
    } catch (err) {
      console.error('[v0] HrExecutiveApprovalDashboard fetch error:', err)
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Submit approve/reject decision ─────────────────────────────────────────
  const submitDecision = async (type: 'deferment' | 'recall', id: string, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !decisionNote.trim()) {
      toast({ title: 'Error', description: 'Please provide a rejection reason', variant: 'destructive' })
      return
    }
    try {
      setProcessingId(id)
      const res = await fetch('/api/leave/deferment-recall/hr-executive-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: id,
          request_type: type,
          decision,
          rejection_reason: decision === 'rejected' ? decisionNote : undefined,
          hr_executive_id: userId || '',
          hr_executive_role: 'hr_executive',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${decision}`)
      toast({ title: 'Success', description: data.message || `${type} ${decision}` })
      setDecisionNote('')
      setExpandedId(null)
      fetchData()
    } catch (err: any) {
      console.error(`[v0] ${type} ${decision} error:`, err)
      toast({ title: 'Error', description: err.message || `Failed to ${decision} ${type}`, variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Download approved memo PDF ──────────────────────────────────────────────
  const downloadMemo = async (memoId: string, category: string) => {
    try {
      // Route expects query param named memo_id (not memoId)
      const res = await fetch(`/api/leave/payment-advice/download?memo_id=${memoId}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Download failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payment-advice-${category}-memo.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('[v0] Memo download error:', err)
      toast({ title: 'Error', description: err.message || 'Failed to download memo', variant: 'destructive' })
    }
  }

  // ── Pending deferments / recalls ────────────────────────────────────────────
  const pendingDeferments = deferments.filter(d => !d.hr_office_decision || d.hr_office_decision === 'pending')
  const pendingRecalls    = recalls.filter(r => !r.hr_decision || r.hr_decision === 'pending')
  const approvedMemos     = memos.filter(m => ['approved', 'signed_by_hr_executive', 'reviewed_by_hr', 'finalized'].includes(m.status))

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading HR approval data...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeSection === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('pending')}
          className={activeSection === 'pending' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
        >
          <Clock className="h-4 w-4 mr-1" />
          Pending Decisions ({pendingDeferments.length + pendingRecalls.length})
        </Button>
        <Button
          variant={activeSection === 'approved-leaves' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('approved-leaves')}
          className={activeSection === 'approved-leaves' ? 'bg-teal-500 hover:bg-teal-600 text-white' : ''}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Approved Leaves ({approvedLeaves.length})
        </Button>
        <Button
          variant={activeSection === 'memos' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('memos')}
          className={activeSection === 'memos' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
        >
          <FileText className="h-4 w-4 mr-1" />
          Approved Payment Advice ({approvedMemos.length})
        </Button>
      </div>

      {/* ── PENDING DECISIONS ── */}
      {activeSection === 'pending' && (
        <Tabs defaultValue="deferments">
          <TabsList className="bg-white border border-slate-200 rounded-lg">
            <TabsTrigger value="deferments" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-md text-sm">
              <CalendarClock className="h-4 w-4 mr-1" />
              Deferments ({pendingDeferments.length})
            </TabsTrigger>
            <TabsTrigger value="recalls" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-md text-sm">
              <RotateCcw className="h-4 w-4 mr-1" />
              Recalls ({pendingRecalls.length})
            </TabsTrigger>
          </TabsList>

          {/* Deferments */}
          <TabsContent value="deferments" className="mt-3 space-y-3">
            {pendingDeferments.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-slate-500">No pending deferment requests</CardContent></Card>
            ) : pendingDeferments.map(d => {
              const profile = d.user_profiles || (d.leave_plan_requests as any)?.user_profiles as UserProfile | undefined
              const staffName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown'
              const dept = profile?.departments?.name || ''
              const isExpanded = expandedId === d.id
              return (
                <Card key={d.id} className="border-l-4 border-l-orange-400">
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">{staffName}</CardTitle>
                        <CardDescription className="text-xs">{profile?.position || ''}{dept ? ` — ${dept}` : ''}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(d.status)}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs text-slate-600">
                      <div><span className="font-medium">Leave Type:</span> {fmtLeaveType(d.leave_plan_requests?.leave_type_key)}</div>
                      <div><span className="font-medium">Deferment Period:</span> {fmtDate(d.deferment_start_date)} – {fmtDate(d.deferment_end_date)}</div>
                      <div><span className="font-medium">Submitted:</span> {fmtDate(d.created_at)}</div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0 space-y-3">
                      <div className="p-3 bg-slate-50 rounded text-xs">
                        <span className="font-medium">Reason: </span>{d.reason || 'No reason provided'}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700">Decision Note</label>
                        <Textarea
                          placeholder="Add notes (required for rejection)..."
                          value={decisionNote}
                          onChange={e => setDecisionNote(e.target.value)}
                          className="mt-1 text-sm h-20"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          disabled={!!processingId}
                          onClick={() => submitDecision('deferment', d.id, 'rejected')}
                        >
                          {processingId === d.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                          disabled={!!processingId}
                          onClick={() => submitDecision('deferment', d.id, 'approved')}
                        >
                          {processingId === d.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                          Approve & Generate Memo
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </TabsContent>

          {/* Recalls */}
          <TabsContent value="recalls" className="mt-3 space-y-3">
            {pendingRecalls.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-slate-500">No pending recall requests</CardContent></Card>
            ) : pendingRecalls.map(r => {
              const profile = r.user_profiles || (r.leave_plan_requests as any)?.user_profiles as UserProfile | undefined
              const staffName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown'
              const dept = profile?.departments?.name || ''
              const isExpanded = expandedId === r.id
              return (
                <Card key={r.id} className="border-l-4 border-l-purple-400">
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">{staffName}</CardTitle>
                        <CardDescription className="text-xs">{profile?.position || ''}{dept ? ` — ${dept}` : ''}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(r.status)}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs text-slate-600">
                      <div><span className="font-medium">Leave Type:</span> {fmtLeaveType(r.leave_plan_requests?.leave_type_key)}</div>
                      <div><span className="font-medium">Recall Date:</span> {fmtDate(r.recall_date)}</div>
                      <div><span className="font-medium">Submitted:</span> {fmtDate(r.created_at)}</div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0 space-y-3">
                      <div className="p-3 bg-slate-50 rounded text-xs">
                        <span className="font-medium">Reason: </span>{r.recall_reason || 'No reason provided'}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700">Decision Note</label>
                        <Textarea
                          placeholder="Add notes (required for rejection)..."
                          value={decisionNote}
                          onChange={e => setDecisionNote(e.target.value)}
                          className="mt-1 text-sm h-20"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          disabled={!!processingId}
                          onClick={() => submitDecision('recall', r.id, 'rejected')}
                        >
                          {processingId === r.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                          disabled={!!processingId}
                          onClick={() => submitDecision('recall', r.id, 'approved')}
                        >
                          {processingId === r.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                          Approve & Generate Memo
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </TabsContent>
        </Tabs>
      )}

      {/* ── APPROVED LEAVES ── */}
      {activeSection === 'approved-leaves' && (
        <div className="space-y-3">
          {approvedLeaves.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No approved leave requests yet
              </CardContent>
            </Card>
          ) : approvedLeaves.map(leave => {
              const isExpanded = expandedId === `leave-${leave.id}`
              return (
                <Card key={leave.id} className="border-l-4 border-l-teal-400">
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : `leave-${leave.id}`)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm font-semibold">{leave.staff_name}</CardTitle>
                        <CardDescription className="text-xs">
                          {leave.employee_id !== 'N/A' ? `${leave.employee_id} • ` : ''}{leave.department}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-teal-100 text-teal-700 border-0">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved &amp; Signed
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs text-slate-600">
                      <div><span className="font-medium">Leave Type:</span> {leave.leave_type || 'Annual Leave'}</div>
                      <div><span className="font-medium">Duration:</span> {leave.days_requested} day{leave.days_requested !== 1 ? 's' : ''}</div>
                      <div>
                        <span className="font-medium">Period:</span>{' '}
                        {leave.start_date ? fmtDate(leave.start_date) : 'N/A'} – {leave.end_date ? fmtDate(leave.end_date) : 'N/A'}
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0 border-t pt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2 bg-teal-50 rounded">
                          <span className="font-medium text-slate-600">Signed By:</span>
                          <p className="text-slate-900 font-semibold mt-1">{leave.signed_by}</p>
                        </div>
                        <div className="p-2 bg-teal-50 rounded">
                          <span className="font-medium text-slate-600">Approval Date:</span>
                          <p className="text-slate-900 font-semibold mt-1">{fmtDate(leave.signed_at)}</p>
                        </div>
                        {leave.payment_amount != null && (
                          <div className="p-2 bg-teal-50 rounded">
                            <span className="font-medium text-slate-600">Payment Amount:</span>
                            <p className="text-slate-900 font-semibold mt-1">
                              {leave.payment_currency} {Number(leave.payment_amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        )}
                        <div className="p-2 bg-teal-50 rounded">
                          <span className="font-medium text-slate-600">Memo Created:</span>
                          <p className="text-slate-900 font-semibold mt-1">{fmtDate(leave.approval_date)}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-teal-500 hover:bg-teal-600 text-white"
                        onClick={() => downloadMemo(leave.id, `${leave.staff_name}-leave`)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download Leave Memo PDF
                      </Button>
                    </CardContent>
                  )}
                </Card>
              )
            })}
        </div>
      )}

      {/* ── APPROVED PAYMENT ADVICE ── */}
      {activeSection === 'memos' && (
        <div className="space-y-3">
          {approvedMemos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No approved payment advice yet
              </CardContent>
            </Card>
          ) : approvedMemos.map(memo => {
            let body: any = {}
            try { body = typeof memo.memo_body === 'string' ? JSON.parse(memo.memo_body) : (memo.memo_body || {}) } catch {}
            const category = memo.staff_category || body.staff_category || 'Staff'
            const month = memo.leave_month || body.leave_month || fmtDate(memo.created_at)
            const staffCount = (body.staffList?.length) || 1
            return (
              <Card key={memo.id} className="border-l-4 border-l-emerald-400">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{category} — {month}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {staffCount} staff member{staffCount !== 1 ? 's' : ''} &bull; Signed by {memo.signer_name || 'HR Executive'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(memo.status)}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => downloadMemo(memo.id, `${category}-${month}`)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
