'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Download, Shield, PenLine, Upload, Info,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaveRequest {
  id: string
  user_id: string
  status: string
  leave_type_key: string
  preferred_start_date: string
  preferred_end_date: string
  adjusted_start_date?: string | null
  adjusted_end_date?: string | null
  requested_days: number
  adjusted_days?: number | null
  original_requested_days?: number | null
  reason?: string | null
  adjustment_reason?: string | null
  travelling_days_added?: number | null
  leave_year_period?: string | null
  memo_draft_subject?: string | null
  memo_draft_body?: string | null
  memo_draft_cc?: string | null
  memo_token?: string | null
  hr_approver_name?: string | null
  hr_approved_at?: string | null
  submitted_at?: string | null
  created_at: string
  user?: {
    id: string
    first_name: string
    last_name: string
    employee_id?: string
    position?: string
    email?: string
    departments?: { id: string; name: string; code?: string }
  } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d?: string | null) => {
  if (!d) return 'N/A'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
}

const leaveTypeLabel = (key: string) => {
  const map: Record<string, string> = {
    annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity',
    study: 'Study', compassionate: 'Compassionate', part_leave: 'Part Leave',
    no_pay: 'No Pay', casual: 'Casual',
  }
  return map[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Signature Panel ───────────────────────────────────────────────────────────

function SignaturePanel({
  savedSignature, onSave,
}: {
  savedSignature: string | null
  onSave: (mode: string, text: string, dataUrl: string | null) => void
}) {
  const [mode, setMode] = useState<'type' | 'draw' | 'upload'>('type')
  const [typedText, setTypedText] = useState(savedSignature || '')
  const [collapsed, setCollapsed] = useState(!!savedSignature)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  // ── Native canvas drawing ──────────────────────────────────────────────────
  const getCtx = () => canvasRef.current?.getContext('2d') ?? null
  const getPos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current = true
    const ctx = getCtx(); if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = getCtx(); if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineWidth = 2; ctx.strokeStyle = '#1e3a5f'; ctx.lineCap = 'round'
    ctx.lineTo(x, y); ctx.stroke()
  }
  const onPointerUp = () => { drawing.current = false }

  const handleSave = () => {
    if (mode === 'type') {
      if (!typedText.trim()) return
      onSave('typed', typedText.trim(), null)
    } else if (mode === 'draw') {
      const dataUrl = canvasRef.current?.toDataURL() ?? null
      onSave('draw', '', dataUrl)
    }
    setCollapsed(true)
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-green-100 transition-colors"
      >
        <div>
          <p className="text-xs font-bold text-green-800 tracking-wide uppercase">
            YOUR HR SIGNATURE (APPLIED TO ALL APPROVED MEMOS)
          </p>
          {collapsed && savedSignature && (
            <p className="text-xs text-green-700 mt-0.5">
              Saved &mdash; click to update
            </p>
          )}
          {!collapsed && (
            <p className="text-xs text-green-700 mt-0.5">
              Save it once here and the leave module will reuse it until you replace it.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savedSignature && (
            <Badge className="bg-green-600 text-white text-xs">Saved</Badge>
          )}
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-green-700" />
            : <ChevronUp className="h-4 w-4 text-green-700" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-3 border-t border-green-200">
          {/* Mode tabs */}
          <div className="flex gap-2 pt-3">
            {(['type', 'draw', 'upload'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={[
                  'px-4 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  mode === m
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-green-800 border-green-300 hover:bg-green-100',
                ].join(' ')}
              >
                {m === 'type' ? <><PenLine className="h-3 w-3 inline mr-1" />Type</>
                  : m === 'draw' ? <><PenLine className="h-3 w-3 inline mr-1" />Draw</>
                  : <><Upload className="h-3 w-3 inline mr-1" />Upload</>}
              </button>
            ))}
          </div>

          {mode === 'type' && (
            <input
              type="text"
              value={typedText}
              onChange={e => setTypedText(e.target.value)}
              placeholder="Type your full name as signature"
              className="w-full border border-green-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          )}

          {mode === 'draw' && (
            <canvas
              ref={canvasRef}
              width={600}
              height={120}
              className="w-full border border-green-300 rounded-lg bg-white touch-none cursor-crosshair"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          )}

          {mode === 'upload' && (
            <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center">
              <Upload className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-xs text-green-700">Click to upload signature image</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              Save Signature
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setTypedText(savedSignature || ''); setCollapsed(true) }}
            >
              Reload Saved
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setTypedText(''); if (padRef.current) padRef.current.clear() }}
              className="text-red-500 hover:text-red-700"
            >
              Clear Current
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Request Card ──────────────────────────────────────────────────────────────

function HrApprovalCard({
  req,
  expanded,
  onToggle,
  onApprove,
  onReject,
  processing,
}: {
  req: LeaveRequest
  expanded: boolean
  onToggle: () => void
  onApprove: (note: string, subject: string, body: string) => void
  onReject: (note: string) => void
  processing: boolean
}) {
  const [note, setNote] = useState('')
  const [subject, setSubject] = useState(req.memo_draft_subject || '')
  const [body, setBody] = useState(req.memo_draft_body || '')

  const staffName = req.user
    ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim()
    : 'Unknown Staff'
  const dept = req.user?.departments?.name || ''
  const position = req.user?.position || ''
  const leaveType = leaveTypeLabel(req.leave_type_key)

  const startDate = req.adjusted_start_date || req.preferred_start_date
  const endDate = req.adjusted_end_date || req.preferred_end_date
  const days = req.adjusted_days ?? req.requested_days
  const origDays = req.original_requested_days ?? req.requested_days
  const travelDays = req.travelling_days_added ?? 0
  const wasAdjusted = travelDays > 0 || (req.adjusted_days && req.adjusted_days !== origDays)
  const yearPeriod = req.leave_year_period || '—'

  return (
    <Card className="overflow-hidden border border-slate-200 hover:border-orange-300 transition-colors">
      {/* Card header – always visible */}
      <button
        className="w-full text-left px-5 pt-4 pb-3"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-base text-slate-800 uppercase tracking-wide">{staffName}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {dept}{position ? ` · ${position}` : ''} · {leaveType}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-blue-100 text-blue-800 border-0 text-xs font-medium whitespace-nowrap">
              <Shield className="h-3 w-3 mr-1" />
              HR Office Reviewed &mdash; Awaiting HR Approval
            </Badge>
            {expanded
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </div>

        {/* START / END / DAYS / YEAR tiles */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          {[
            { label: 'START', value: fmtDate(startDate) },
            { label: 'END', value: fmtDate(endDate) },
            { label: 'DAYS', value: String(days), highlight: true },
            { label: 'YEAR', value: yearPeriod },
          ].map(({ label, value, highlight }) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center"
            >
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
              <p className={`text-sm font-bold ${highlight ? 'text-orange-600' : 'text-slate-700'}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* HR Office adjustment banner */}
        {wasAdjusted && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">HR Office adjustment: </span>
              {travelDays > 0 && (
                <span>{travelDays} travelling day(s) added ({origDays}d &rarr; {days}d)</span>
              )}
              {req.adjustment_reason && !travelDays && (
                <span>{req.adjustment_reason}</span>
              )}
            </div>
          </div>
        )}
      </button>

      {/* Expanded action panel */}
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 space-y-4">
          {/* Memo subject */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Memo Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Enter memo subject..."
            />
          </div>

          {/* Memo body */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Memo Body</label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Memo body will be pre-filled from template..."
              className="text-sm h-32 resize-none"
            />
          </div>

          {/* Approval note */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Note <span className="font-normal text-slate-400">(required for rejection)</span>
            </label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note..."
              className="text-sm h-20 resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              disabled={processing}
              onClick={() => onReject(note)}
            >
              {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              Reject
            </Button>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={processing}
              onClick={() => onApprove(note, subject, body)}
            >
              {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
              Approve &amp; Issue Memo
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export function HrApprovalsTab() {
  const { toast } = useToast()

  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)

  // Filters
  const [deptFilter, setDeptFilter] = useState('all')
  const [locFilter, setLocFilter] = useState('all')

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leave/planning/hr-approve')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Only show 'hr_office_forwarded' requests in this tab
      const pending = (data.requests || []).filter(
        (r: LeaveRequest) => r.status === 'hr_office_forwarded'
      )
      setRequests(pending)
    } catch (err) {
      console.error('[v0] HrApprovalsTab fetch error:', err)
      toast({ title: 'Error', description: 'Failed to load HR approval requests', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  // ── Load saved signature from localStorage ─────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('hr_approver_signature_text')
    if (stored) setSavedSignature(stored)
    fetchRequests()
  }, [fetchRequests])

  // ── Save signature ────────────────────────────────────────────────────────
  const handleSaveSignature = async (mode: string, text: string, dataUrl: string | null) => {
    if (mode === 'typed' && text) {
      localStorage.setItem('hr_approver_signature_text', text)
      setSavedSignature(text)
    }
    // Also persist to backend
    try {
      await fetch('/api/leave/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_domain: 'leave',
          approval_stage: 'hr_approver',
          signature_mode: mode,
          signature_text: text || null,
          signature_data_url: dataUrl || null,
        }),
      })
      toast({ title: 'Signature saved', description: 'Your signature will be applied to all approved memos.' })
    } catch {
      // Signature still stored locally; non-fatal
      toast({ title: 'Signature saved locally', description: 'Backend save failed — you can still approve.' })
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  const handleApprove = async (reqId: string, note: string, subject: string, body: string) => {
    try {
      setProcessingId(reqId)
      const res = await fetch('/api/leave/planning/hr-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_plan_request_id: reqId,
          action: 'approve',
          note: note || undefined,
          memo_draft_subject: subject || undefined,
          memo_draft_body: body || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Approval failed')
      toast({ title: 'Leave Approved', description: data.message || 'Memo issued successfully.' })
      setExpandedId(null)
      fetchRequests()
    } catch (err: any) {
      toast({ title: 'Error', description: String(err.message || err), variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleReject = async (reqId: string, note: string) => {
    if (!note.trim()) {
      toast({ title: 'Note required', description: 'Please enter a reason before rejecting.', variant: 'destructive' })
      return
    }
    try {
      setProcessingId(reqId)
      const res = await fetch('/api/leave/planning/hr-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_plan_request_id: reqId,
          action: 'reject',
          note,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Rejection failed')
      toast({ title: 'Leave Rejected', description: data.message || 'Request rejected.' })
      setExpandedId(null)
      fetchRequests()
    } catch (err: any) {
      toast({ title: 'Error', description: String(err.message || err), variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Filtered requests ─────────────────────────────────────────────────────
  const departments = Array.from(
    new Set(requests.map(r => r.user?.departments?.name).filter(Boolean) as string[])
  ).sort()

  const filtered = requests.filter(r => {
    const dept = r.user?.departments?.name || ''
    if (deptFilter !== 'all' && dept !== deptFilter) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Signature panel */}
      <SignaturePanel savedSignature={savedSignature} onSave={handleSaveSignature} />

      {/* Filters + count */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={locFilter} onValueChange={setLocFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
          </SelectContent>
        </Select>

        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="ml-auto h-9 text-sm gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>

        <p className="text-xs text-slate-500 whitespace-nowrap">
          {filtered.length} of {requests.length} shown
        </p>
      </div>

      {/* Request list */}
      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading HR approval requests...
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-400" />
            <p className="text-sm text-slate-500">No pending HR approval requests</p>
            <p className="text-xs text-slate-400">
              Requests forwarded by the HR Leave Office will appear here once the HR Office has reviewed them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <HrApprovalCard
              key={req.id}
              req={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
              onApprove={(note, subject, body) => handleApprove(req.id, note, subject, body)}
              onReject={(note) => handleReject(req.id, note)}
              processing={processingId === req.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
