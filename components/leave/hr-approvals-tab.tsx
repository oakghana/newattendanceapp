'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Download, Shield, Info, Eye, PenLine, Upload, AlertTriangle,
  Building2, Calendar, Clock,
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
  submitted_at?: string | null
  created_at: string
  user?: {
    id: string
    first_name: string
    last_name: string
    employee_id?: string
    position?: string
    email?: string
    hire_date?: string | null
    date_of_appointment?: string | null
    years_of_service?: number | null
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

const fmtDateLong = (d?: string | null) => {
  if (!d) return 'N/A'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-GH', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** e.g. "23rd July, 2026" */
const fmtDateOrdinal = (d?: string | null) => {
  if (!d) return 'N/A'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  const day = dt.getDate()
  const suffix = day === 1 || day === 21 || day === 31 ? 'st'
    : day === 2 || day === 22 ? 'nd'
    : day === 3 || day === 23 ? 'rd' : 'th'
  const month = dt.toLocaleDateString('en-GH', { month: 'long' })
  return `${day}${suffix} ${month}, ${dt.getFullYear()}`
}

const leaveTypeLabel = (key: string) => {
  const map: Record<string, string> = {
    annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity',
    study: 'Study', compassionate: 'Compassionate', part_leave: 'Part Leave',
    no_pay: 'No Pay', casual: 'Casual',
  }
  return map[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const leaveTypeUpper = (key: string) => leaveTypeLabel(key).toUpperCase()

const calcYearsOfService = (user: LeaveRequest['user']): string => {
  if (!user) return '—'
  if (typeof user.years_of_service === 'number' && user.years_of_service > 0) {
    return `${user.years_of_service} yr${user.years_of_service !== 1 ? 's' : ''}`
  }
  const ref = user.date_of_appointment || user.hire_date
  if (!ref) return '—'
  const start = new Date(ref)
  if (isNaN(start.getTime())) return '—'
  const now = new Date()
  const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  const y = Math.floor(years)
  const m = Math.floor((years - y) * 12)
  if (y === 0) return m > 0 ? `${m} mo` : '< 1 mo'
  return m > 0 ? `${y} yr ${m} mo` : `${y} yr${y !== 1 ? 's' : ''}`
}

/** Build the "QCC/HRD/AL/2026/XXXX" ref number */
const buildRefNo = (req: LeaveRequest) => {
  const year = new Date().getFullYear()
  const shortId = (req.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
  const typeCode = req.leave_type_key === 'annual' ? 'AL'
    : req.leave_type_key === 'sick' ? 'SL'
    : req.leave_type_key === 'maternity' ? 'ML'
    : req.leave_type_key === 'paternity' ? 'PL'
    : 'LL'
  return `QCC/HRD/${typeCode}/${year}/${shortId}`
}

/** Year portion from leave_year_period, e.g. "2025/2026" → "2025" */
const leaveYear = (period?: string | null) => {
  if (!period) return String(new Date().getFullYear() - 1)
  return period.split('/')[0] || period
}

// ── Inline Signature Panel ────────────────────────────────────────────────────

function InlineSignaturePanel({ onSaved }: {
  onSaved: (dataUrl: string | null, text: string | null, mode: string) => void
}) {
  const [mode, setMode] = useState<'type' | 'draw' | 'upload'>('type')
  const [typedText, setTypedText] = useState('')
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const { toast } = useToast()

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null
  const getPos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (canvasRef.current!.width / r.width),
      y: (e.clientY - r.top) * (canvasRef.current!.height / r.height),
    }
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (dataUrl) onSaved(dataUrl, null, 'upload')
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    let dataUrl: string | null = null
    let text: string | null = null
    if (mode === 'type') {
      if (!typedText.trim()) { toast({ title: 'Enter your name', variant: 'destructive' }); return }
      text = typedText.trim()
    } else if (mode === 'draw') {
      dataUrl = canvasRef.current?.toDataURL() ?? null
      if (!dataUrl) { toast({ title: 'Draw your signature first', variant: 'destructive' }); return }
    }
    setSaving(true)
    try {
      await fetch('/api/leave/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_domain: 'leave',
          approval_stage: 'hr_approver',
          signature_mode: mode,
          signature_text: text,
          signature_data_url: dataUrl,
        }),
      })
      toast({ title: 'Signature saved', description: 'Your signature will be used for this and future approvals.' })
      onSaved(dataUrl, text, mode)
    } catch {
      onSaved(dataUrl, text, mode)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">No stored signature found</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Set a signature below to approve memos. It will be saved for future use.
            You can also add a permanent signature in <strong>Profile Settings &rsaquo; Signature</strong>.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {(['type', 'draw', 'upload'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1',
              mode === m
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100',
            ].join(' ')}
          >
            {m === 'type' ? <><PenLine className="h-3 w-3" />Type</>
              : m === 'draw' ? <><PenLine className="h-3 w-3" />Draw</>
              : <><Upload className="h-3 w-3" />Upload</>}
          </button>
        ))}
      </div>
      {mode === 'type' && (
        <input
          type="text"
          value={typedText}
          onChange={e => setTypedText(e.target.value)}
          placeholder="Type your full name as signature"
          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      )}
      {mode === 'draw' && (
        <div className="space-y-1">
          <canvas
            ref={canvasRef}
            width={800} height={100}
            className="w-full border border-amber-300 rounded-lg bg-white touch-none cursor-crosshair"
            style={{ height: 80 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          <button
            onClick={() => {
              const ctx = getCtx()
              if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            }}
            className="text-xs text-amber-700 hover:underline"
          >
            Clear
          </button>
        </div>
      )}
      {mode === 'upload' && (
        <label className="flex items-center gap-2 border-2 border-dashed border-amber-300 rounded-lg p-3 cursor-pointer hover:bg-amber-100 transition-colors">
          <Upload className="h-4 w-4 text-amber-600" />
          <span className="text-xs text-amber-700">Click to upload signature image (PNG/JPG)</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      )}
      {mode !== 'upload' && (
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white h-8 text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Save &amp; Use Signature
        </Button>
      )}
    </div>
  )
}

// ── QCC Memo Preview Modal ────────────────────────────────────────────────────

function QccMemoPreviewModal({
  open,
  onClose,
  req,
  signerName,
  signerPosition,
  signatureDataUrl,
  signatureText,
}: {
  open: boolean
  onClose: () => void
  req: LeaveRequest
  signerName: string
  signerPosition: string
  signatureDataUrl?: string | null
  signatureText?: string | null
}) {
  const staffName = req.user
    ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim()
    : 'Unknown Staff'
  const staffSerial = req.user?.employee_id || '—'
  const position = req.user?.position || ''
  const dept = req.user?.departments?.name || ''
  const leaveType = leaveTypeUpper(req.leave_type_key)
  const yearLabel = leaveYear(req.leave_year_period)

  const startDate = req.adjusted_start_date || req.preferred_start_date
  const endDate = req.adjusted_end_date || req.preferred_end_date
  const grantedDays = req.adjusted_days ?? req.requested_days
  const travelDays = req.travelling_days_added ?? 0
  const entitledDays = req.original_requested_days ?? (grantedDays - travelDays)
  const entitledLabel = travelDays > 0
    ? `${entitledDays} plus ${travelDays} travelling day${travelDays !== 1 ? 's' : ''}`
    : String(entitledDays)

  // Return to work = day after end date
  const endDt = endDate ? new Date(endDate) : null
  let resumeDate = 'N/A'
  if (endDt && !isNaN(endDt.getTime())) {
    endDt.setDate(endDt.getDate() + 1)
    resumeDate = fmtDateOrdinal(endDt.toISOString())
  }

  const remarks = travelDays > 0
    ? `${travelDays} travelling day(s) added`
    : req.adjustment_reason || '—'

  const refNo = buildRefNo(req)
  const today = fmtDateOrdinal(new Date().toISOString())
  const serial = `${staffSerial.replace(/\s/g, '')}`.toUpperCase() || 'S/N'

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 bg-white">
        {/* Chrome top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div>
            <p className="text-sm font-semibold text-slate-800">Memo Preview</p>
            <p className="text-xs text-slate-500">Official QCC leave advice — review before approving</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">&times;</button>
        </div>

        {/* ── The Memo Document ─────────────────────────────────────────── */}
        <div className="px-8 py-6 font-serif text-[13px] text-slate-900 leading-[1.55] bg-white">

          {/* Header row: org text LEFT, logo RIGHT */}
          <div className="flex items-start justify-between mb-1">
            <div className="space-y-[2px]">
              <p className="font-bold text-[15px] tracking-wide">QUALITY CONTROL COMPANY LTD.</p>
              <p className="text-[12px]">(COCOBOD)</p>
              <p className="text-[12px]">P.O. Box M54</p>
              <p className="text-[12px]">Accra</p>
              <p className="text-[12px]">Ghana</p>
            </div>
            {/* Logo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/qcc-logo.png"
              alt="QCC Logo"
              className="w-20 h-20 object-contain"
            />
          </div>

          {/* Ref + Date row */}
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
            <p><span className="font-bold">Our Ref No: </span>{refNo}</p>
            <p><span className="font-bold">Date: </span>{today}</p>
          </div>
          <div className="mt-1 text-[12px]">
            <p><span className="font-bold">Your Ref No: </span>____________________________</p>
          </div>

          {/* Thin rule */}
          <div className="border-t border-slate-300 my-3" />

          {/* Addressee */}
          <div className="space-y-[2px] text-[13px]">
            <p className="font-bold uppercase">{staffName}&nbsp;&nbsp;(S/NO.: &nbsp;{serial})</p>
            <p className="uppercase">{position}</p>
            <p className="uppercase">{dept}</p>
          </div>

          {/* THRO */}
          <div className="mt-3 text-[12px]">
            <p className="font-bold">THRO: {dept ? `${dept} HEAD` : 'DEPARTMENT HEAD'}</p>
            <p className="ml-6 font-bold uppercase">QUALITY CONTROL COMPANY LIMITED</p>
            <p className="ml-6 uppercase">{dept}</p>
          </div>

          {/* Subject */}
          <div className="mt-4">
            <p className="font-bold underline text-[13px] uppercase">
              {leaveType} LEAVE ADVICE FOR {yearLabel}
            </p>
          </div>

          {/* Body paragraph */}
          <div className="mt-4 text-[13px] space-y-3">
            <p>
              In accordance with COCOBOD&apos;s vacation leave policy, we wish to inform you that approval has been
              granted for you to proceed on your {leaveTypeLabel(req.leave_type_key).toLowerCase()} leave in respect of
              the year January to December {yearLabel}.
            </p>
            <p>Your leave details are shown below.</p>
          </div>

          {/* Leave details table */}
          <div className="mt-4 overflow-hidden rounded border border-slate-300 text-[12px]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="px-3 py-2 text-left font-bold border-r border-slate-300 w-[22%]">
                    Number of Days<br />Entitled
                  </th>
                  <th className="px-3 py-2 text-left font-bold border-r border-slate-300 w-[18%]">
                    Number of Days<br />Granted
                  </th>
                  <th className="px-3 py-2 text-left font-bold border-r border-slate-300 w-[18%]">From</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-slate-300 w-[18%]">To</th>
                  <th className="px-3 py-2 text-left font-bold w-[24%]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="px-3 py-2 border-r border-slate-200">{entitledLabel}</td>
                  <td className="px-3 py-2 border-r border-slate-200 font-semibold">{grantedDays}</td>
                  <td className="px-3 py-2 border-r border-slate-200">{fmtDateLong(startDate)}</td>
                  <td className="px-3 py-2 border-r border-slate-200">{fmtDateLong(endDate)}</td>
                  <td className="px-3 py-2">{remarks}</td>
                </tr>
                {/* Totals row */}
                <tr className="bg-slate-50">
                  <td className="px-3 py-1.5 border-r border-slate-200 font-bold text-right" colSpan={1}>&nbsp;</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 font-bold">{grantedDays}</td>
                  <td colSpan={3} className="px-3 py-1.5 text-slate-400 italic text-[11px]" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Resume duty */}
          <div className="mt-4 text-[13px]">
            <p>You are to resume duty on <span className="font-bold">{resumeDate}</span>.</p>
          </div>

          {/* Closing */}
          <div className="mt-3 text-[13px]">
            <p>We wish you a pleasant and relaxing vacation.</p>
          </div>

          {/* Signature block */}
          <div className="mt-8 space-y-1">
            {/* Signature image or typed cursive */}
            <div className="h-14 flex items-end">
              {signatureDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureDataUrl}
                  alt="HR Signature"
                  className="max-h-12 max-w-[200px] object-contain"
                />
              ) : signatureText ? (
                <p className="font-[cursive] text-2xl text-[#1a3c5e] leading-none">{signatureText}</p>
              ) : (
                <div className="w-48 border-b-2 border-dashed border-slate-300 flex items-end pb-1">
                  <span className="text-[11px] text-slate-400 italic">Signature pending</span>
                </div>
              )}
            </div>
            {/* Signature line */}
            <div className="w-64 border-b border-slate-700" />
            <p className="font-bold uppercase text-[13px] mt-1">{signerName}</p>
            <p className="text-[12px] uppercase">{signerPosition}</p>
            <p className="text-[12px]">FOR: MANAGING DIRECTOR</p>
          </div>

          {/* CC */}
          <div className="mt-6 border-t border-slate-300 pt-3 text-[12px]">
            <p>
              <span className="font-bold">cc: </span>
              Managing Director, Deputy Managing Director, HR Head, Accounts Manager
            </p>
          </div>

          {/* Footer */}
          <div className="mt-4 border-t border-slate-300 pt-2 text-[11px] text-slate-500 text-center">
            Tel: +233-571-461-114&nbsp;&nbsp;|&nbsp;&nbsp;+233-571-461-113&nbsp;&nbsp;|&nbsp;&nbsp;
            Fax: GA-105-8378&nbsp;&nbsp;|&nbsp;&nbsp;Email: info@qccgh.com&nbsp;&nbsp;|&nbsp;&nbsp;www.qccgh.com
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 pt-2 flex justify-end border-t border-slate-100 bg-slate-50">
          <Button size="sm" variant="outline" onClick={onClose} className="text-sm">Close Preview</Button>
        </div>
      </DialogContent>
    </Dialog>
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
  hasStoredSignature,
  inlineSig,
  onInlineSigSaved,
  signerName,
  signerPosition,
}: {
  req: LeaveRequest
  expanded: boolean
  onToggle: () => void
  onApprove: (note: string, subject: string, body: string) => void
  onReject: (note: string) => void
  processing: boolean
  hasStoredSignature: boolean
  inlineSig: { dataUrl: string | null; text: string | null; mode: string } | null
  onInlineSigSaved: (dataUrl: string | null, text: string | null, mode: string) => void
  signerName: string
  signerPosition: string
}) {
  const [note, setNote] = useState('')
  const [subject, setSubject] = useState(req.memo_draft_subject || '')
  const [body, setBody] = useState(req.memo_draft_body || '')
  const [previewOpen, setPreviewOpen] = useState(false)

  const staffName = req.user
    ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim()
    : 'Unknown Staff'
  const dept = req.user?.departments?.name || ''
  const position = req.user?.position || ''
  const leaveType = leaveTypeLabel(req.leave_type_key)
  const yearsOfService = calcYearsOfService(req.user)

  const startDate = req.adjusted_start_date || req.preferred_start_date
  const endDate = req.adjusted_end_date || req.preferred_end_date
  const days = req.adjusted_days ?? req.requested_days
  const origDays = req.original_requested_days ?? req.requested_days
  const travelDays = req.travelling_days_added ?? 0
  const wasAdjusted = travelDays > 0 || (req.adjusted_days && req.adjusted_days !== origDays)
  const yearPeriod = req.leave_year_period || '—'

  // Effective sig: stored profile sig OR inline sig for this session
  const sigReady = hasStoredSignature || (inlineSig && (inlineSig.dataUrl || inlineSig.text))
  const previewSigDataUrl = inlineSig?.dataUrl || null
  const previewSigText = inlineSig?.text || null

  return (
    <>
      <Card className="overflow-hidden border border-slate-200 hover:border-orange-300 transition-colors">
        {/* Card header – always visible */}
        <button className="w-full text-left px-5 pt-4 pb-3" onClick={onToggle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-base text-slate-800 uppercase tracking-wide">{staffName}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <span className="text-xs text-slate-500">{dept}{position ? ` · ${position}` : ''} · {leaveType}</span>
                {yearsOfService !== '—' && (
                  <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                    <Clock className="h-3 w-3" />{yearsOfService} service
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className="bg-blue-100 text-blue-800 border-0 text-xs font-medium whitespace-nowrap">
                <Shield className="h-3 w-3 mr-1" />
                HR Office Reviewed &mdash; Awaiting HR Approval
              </Badge>
              {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
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
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className={`text-sm font-bold ${highlight ? 'text-orange-600' : 'text-slate-700'}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* HR Office adjustment banner */}
          {wasAdjusted && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">HR Office adjustment: </span>
                {travelDays > 0 && <span>{travelDays} travelling day(s) added ({origDays}d &rarr; {days}d)</span>}
                {req.adjustment_reason && !travelDays && <span>{req.adjustment_reason}</span>}
              </div>
            </div>
          )}
        </button>

        {/* Expanded action panel */}
        {expanded && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 space-y-4">
            {/* Inline signature if none stored */}
            {!hasStoredSignature && !inlineSig && (
              <InlineSignaturePanel onSaved={onInlineSigSaved} />
            )}
            {!hasStoredSignature && inlineSig && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Signature set for this session.
                <button onClick={() => onInlineSigSaved(null, null, '')} className="ml-auto underline text-green-700">Change</button>
              </div>
            )}

            {/* Staff detail strip */}
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-white border border-slate-200 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Department</p>
                <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-400" />{dept || '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Submitted</p>
                <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />{fmtDate(req.submitted_at || req.created_at)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Years of Service</p>
                <p className="text-xs font-medium text-indigo-700 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-indigo-400" />{yearsOfService}
                </p>
              </div>
            </div>

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
                className="text-sm h-28 resize-none"
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
              {/* Preview button */}
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 text-slate-600 hover:bg-slate-100 mr-auto gap-1"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="h-3 w-3" />
                Preview Memo
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 gap-1"
                disabled={processing}
                onClick={() => onReject(note)}
              >
                {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                Reject
              </Button>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white gap-1"
                disabled={processing || !sigReady}
                title={!sigReady ? 'Set a signature above before approving' : undefined}
                onClick={() => onApprove(note, subject, body)}
              >
                {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                Approve &amp; Issue Memo
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* QCC Memo preview modal */}
      <QccMemoPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        req={req}
        signerName={signerName}
        signerPosition={signerPosition}
        signatureDataUrl={previewSigDataUrl}
        signatureText={previewSigText}
      />
    </>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export function HrApprovalsTab() {
  const { toast } = useToast()

  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [hasStoredSignature, setHasStoredSignature] = useState(true)
  const [inlineSig, setInlineSig] = useState<{ dataUrl: string | null; text: string | null; mode: string } | null>(null)
  const [signerName, setSignerName] = useState('HR Executive')
  const [signerPosition, setSignerPosition] = useState('HR MANAGER')

  const [deptFilter, setDeptFilter] = useState('all')
  const [locFilter, setLocFilter] = useState('all')

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leave/planning/hr-approve')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const pending = (data.requests || []).filter(
        (r: LeaveRequest) => r.status === 'hr_office_forwarded'
      )
      setRequests(pending)
      if (typeof data.has_stored_signature === 'boolean') {
        setHasStoredSignature(data.has_stored_signature)
      }
      if (data.signer_name) setSignerName(data.signer_name)
      if (data.signer_position) setSignerPosition(data.signer_position)
    } catch (err) {
      console.error('[v0] HrApprovalsTab fetch error:', err)
      toast({ title: 'Error', description: 'Failed to load HR approval requests', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchRequests() }, [fetchRequests])

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
          hr_signature_mode: inlineSig?.mode || undefined,
          hr_signature_text: inlineSig?.text || undefined,
          hr_signature_data_url: inlineSig?.dataUrl || undefined,
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
        body: JSON.stringify({ leave_plan_request_id: reqId, action: 'reject', note }),
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

  // ── Filtered ──────────────────────────────────────────────────────────────
  const departments = Array.from(
    new Set(requests.map(r => r.user?.departments?.name).filter(Boolean) as string[])
  ).sort()

  const filtered = requests.filter(r => {
    if (deptFilter !== 'all' && (r.user?.departments?.name || '') !== deptFilter) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
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
              Requests forwarded by the HR Leave Office will appear here once reviewed.
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
              hasStoredSignature={hasStoredSignature}
              inlineSig={inlineSig}
              onInlineSigSaved={(dataUrl, text, mode) => {
                if (!dataUrl && !text) { setInlineSig(null); return }
                setInlineSig({ dataUrl, text, mode })
              }}
              signerName={signerName}
              signerPosition={signerPosition}
            />
          ))}
        </div>
      )}
    </div>
  )
}
