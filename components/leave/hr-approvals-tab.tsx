'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
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
      // Save to approval_signature_registry (hr-signature-save) AND mirror to user_profiles
      // so that next login the GET handler picks it up from user_profiles directly.
      await Promise.allSettled([
        fetch('/api/user/hr-signature-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signatureDataUrl: dataUrl,
            signature_mode: mode,
            signature_text: text,
          }),
        }),
        fetch('/api/user/signature-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature_data_url: dataUrl,
            signature_mode: mode,
            signature_text: text,
          }),
        }),
      ])
      toast({ title: 'Signature saved', description: 'Your signature has been saved and will be used automatically for all future approvals.' })
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
  storedSignatureDataUrl,
}: {
  open: boolean
  onClose: () => void
  req: LeaveRequest
  signerName: string
  signerPosition: string
  signatureDataUrl?: string | null
  signatureText?: string | null
  storedSignatureDataUrl?: string | null
}) {
  // Resolve the best available signature: inline drawn > stored profile
  const resolvedSigDataUrl = signatureDataUrl || storedSignatureDataUrl || null
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
  const origDaysForModal = req.original_requested_days ?? (grantedDays - travelDays)
  const wasAdjusted = travelDays > 0 || (req.adjusted_days != null && req.adjusted_days !== req.requested_days)
  const entitledDays = origDaysForModal
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
      <DialogContent className="max-w-3xl max-h-[94vh] overflow-y-auto p-0 bg-white">
        {/* Chrome top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          <div>
            <p className="text-sm font-semibold text-slate-800">Memo Preview</p>
            <p className="text-xs text-slate-500">Official QCC/COCOBOD leave advice — review before approving</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none font-light">&times;</button>
        </div>

        {/* ── A4 Document ───────────────────────────────────────────────── */}
        <div className="px-10 py-7 font-sans text-[12.5px] text-slate-900 leading-[1.6] bg-white">

          {/* ── Letterhead ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between">
            {/* Logo left */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/qcc-logo.png"
              alt="QCC Logo"
              className="w-[68px] h-[68px] object-contain"
            />
            {/* Org name centre */}
            <div className="flex-1 text-center px-4 pt-1">
              <p className="font-bold text-[15px] tracking-widest">QUALITY CONTROL COMPANY LTD.</p>
              <p className="text-[12px] tracking-wider">(COCOBOD)</p>
            </div>
            {/* Address right */}
            <div className="text-right text-[11px] text-slate-600 pt-1 min-w-[110px]">
              <p>P.O. Box M54</p>
              <p>Accra</p>
              <p>Ghana</p>
            </div>
          </div>

          {/* Green accent bar */}
          <div className="h-[3px] bg-[#2d7a2d] rounded-full mt-3 mb-3" />

          {/* Ref + Date */}
          <div className="flex justify-between text-[11.5px] text-[#2d7a2d]">
            <div>
              <p><span className="font-semibold">Our Ref No:</span> {refNo}</p>
              <p><span className="font-semibold">Your Ref No:</span> ____________________________</p>
            </div>
            <p className="text-right font-semibold">Date: {today}</p>
          </div>

          {/* Thin rule */}
          <div className="border-t border-slate-200 my-3" />

          {/* Addressee block */}
          <div className="space-y-[3px] text-[12.5px]">
            <p className="font-bold uppercase">{staffName}&nbsp;&nbsp;(S/NO.:&nbsp;&nbsp;{serial})</p>
            <p className="uppercase text-[12px] text-slate-700">{position}</p>
            <p className="uppercase text-[12px] text-slate-700">{dept}</p>
          </div>

          {/* THRO */}
          <div className="mt-3 text-[12px]">
            <p>
              <span className="font-bold">THRO:</span>
              <span className="font-semibold ml-2 uppercase">{dept ? `${dept} HEAD` : 'DEPARTMENT HEAD'}</span>
            </p>
            <p className="ml-12 font-semibold uppercase">QUALITY CONTROL COMPANY LIMITED</p>
            <p className="ml-12 uppercase text-slate-600">{dept}</p>
          </div>

          {/* Subject — bold + underline, green */}
          <div className="mt-5">
            <p className="font-bold underline text-[13px] uppercase text-[#2d7a2d]">
              {leaveType} LEAVE ADVICE FOR {yearLabel}
            </p>
          </div>

          {/* Body */}
          <div className="mt-4 space-y-3 text-[12.5px]">
            <p>
              In accordance with COCOBOD&apos;s vacation leave policy, we wish to inform you that approval has been
              granted for you to proceed on your {leaveTypeLabel(req.leave_type_key).toLowerCase()} leave in respect
              of the year January to December {yearLabel}.
            </p>
            <p>Your leave details are shown below.</p>
          </div>

          {/* Leave details table */}
          <div className="mt-4 border border-slate-300 rounded overflow-hidden text-[12px]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 w-[22%] leading-tight">
                    Number of Days<br />Entitled
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 w-[18%] leading-tight">
                    Number of Days<br />Granted
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 w-[18%]">From</th>
                  <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 w-[18%]">To</th>
                  <th className="px-3 py-2 text-left font-semibold w-[24%]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="px-3 py-2 border-r border-slate-200">{entitledLabel}</td>
                  <td className="px-3 py-2 border-r border-slate-200 font-semibold">{grantedDays}</td>
                  <td className="px-3 py-2 border-r border-slate-200">{fmtDateOrdinal(startDate)}</td>
                  <td className="px-3 py-2 border-r border-slate-200">{fmtDateOrdinal(endDate)}</td>
                  <td className="px-3 py-2 text-slate-600">{remarks}</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1.5 border-r border-slate-200" />
                  <td className="px-3 py-1.5 border-r border-slate-200 font-bold">{grantedDays}</td>
                  <td colSpan={3} className="px-3 py-1.5" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Resume duty */}
          <div className="mt-4 text-[12.5px]">
            <p>You are to resume duty on <span className="font-semibold">{resumeDate}</span>.</p>
            <p className="mt-2">We wish you a pleasant and relaxing vacation.</p>
          </div>

          {/* Adjustment line if applicable */}
          {wasAdjusted && (
            <div className="mt-1 text-[12px] text-slate-600">
              <p>Adjustment Details: {grantedDays} working days approved</p>
            </div>
          )}



          {/* Signature block */}
          <div className="mt-10">
            {/* Signature image or typed name */}
            <div className="min-h-[48px] flex items-end mb-1">
              {resolvedSigDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolvedSigDataUrl}
                  alt="HR Signature"
                  className="max-h-12 max-w-[180px] object-contain"
                />
              ) : signatureText ? (
                <p className="font-[cursive] text-2xl text-[#1a3c5e] leading-none italic">{signatureText}</p>
              ) : (
                <span className="text-[11px] text-slate-400 italic">Signature from profile will appear here</span>
              )}
            </div>
            {/* Underline */}
            <div className="w-[260px] border-b border-slate-700 mb-2" />
            <p className="font-bold uppercase text-[12.5px]">{signerName}</p>
            <p className="text-[12px] uppercase text-[#2d7a2d] font-medium">{signerPosition}</p>
            <p className="text-[12px]">FOR: MANAGING DIRECTOR</p>
          </div>

          {/* CC */}
          <div className="mt-8 border-t border-slate-200 pt-3 text-[11.5px]">
            <p>
              <span className="font-bold">cc:</span>
              <span className="ml-2 text-slate-700">Managing Director, Deputy Managing Director, HR Head, Accounts Manager</span>
            </p>
          </div>

          {/* Footer bar */}
          <div className="mt-4 border-t border-slate-300 pt-2 text-[10.5px] text-slate-500 text-center">
            Tel: +233-571-461-114&nbsp;&nbsp;|&nbsp;&nbsp;+233-571-461-113&nbsp;&nbsp;|&nbsp;&nbsp;
            Fax: GA-105-8378&nbsp;&nbsp;|&nbsp;&nbsp;Email: info@qccgh.com&nbsp;&nbsp;|&nbsp;&nbsp;www.qccgh.com
          </div>
        </div>

        {/* Modal footer */}
        <div className="px-6 pb-5 pt-3 flex justify-end border-t border-slate-100 bg-slate-50 sticky bottom-0">
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
  storedSignatureDataUrl,
  inlineSig,
  onInlineSigSaved,
  signerName,
  signerPosition,
}: {
  req: LeaveRequest
  expanded: boolean
  onToggle: () => void
  onApprove: (note: string, dateOverride?: string | null) => void
  onReject: (note: string) => void
  processing: boolean
  hasStoredSignature: boolean
  storedSignatureDataUrl: string | null
  inlineSig: { dataUrl: string | null; text: string | null; mode: string } | null
  onInlineSigSaved: (dataUrl: string | null, text: string | null, mode: string) => void
  signerName: string
  signerPosition: string
}) {
  const [note, setNote] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  
  // HR executive date override state
  const [overrideMode, setOverrideMode] = useState(false)
  const [hrStartDate, setHrStartDate] = useState(req.adjusted_start_date || req.preferred_start_date || '')
  const [hrEndDate, setHrEndDate] = useState(req.adjusted_end_date || req.preferred_end_date || '')
  const [hrDays, setHrDays] = useState(String(req.adjusted_days ?? req.requested_days))

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

  // Effective sig: stored profile sig (auto-captured) OR inline sig drawn this session
  const sigReady = hasStoredSignature || (inlineSig && (inlineSig.dataUrl || inlineSig.text))
  const previewSigDataUrl = storedSignatureDataUrl || inlineSig?.dataUrl || null
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
                {req.status === 'hr_office_forwarded' ? 'Forwarded by HR Leave Office \u2014 Pending Your Approval' : 'Awaiting HR Leave Office Review'}
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


        </button>

        {/* Already processed indicator */}
        {["hr_approved", "hr_rejected", "cancelled"].includes(req.status) && (
          <div className="px-5 py-3 bg-amber-50 border border-amber-200 rounded-b-lg">
            <div className="flex items-center gap-2 text-xs text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="font-medium">This leave request has already been processed and cannot be modified.</span>
            </div>
            {req.status === "hr_approved" && req.hr_approved_at && (
              <p className="text-xs text-amber-700 mt-1 pl-6">Approved on {fmtDate(req.hr_approved_at)}</p>
            )}
          </div>
        )}

        {/* Expanded action panel */}
        {expanded && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 space-y-4">

            {/* Block processing for already-handled requests */}
            {["hr_approved", "hr_rejected", "cancelled"].includes(req.status) && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-red-800">Request Cannot Be Processed</p>
                <p className="text-xs text-red-700 mt-1">
                  This request is in a terminal state ({req.status.replace(/_/g, ' ')}) and cannot be approved or rejected again.
                </p>
              </div>
            )}

            {/* Signature status */}
            {hasStoredSignature ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                <span>Signature auto-loaded from your profile &mdash; no re-signing required.</span>
              </div>
            ) : !inlineSig ? (
              <InlineSignaturePanel onSaved={onInlineSigSaved} />
            ) : (
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

            {/* HR Executive Date Override */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
              <button
                type="button"
                onClick={() => setOverrideMode(!overrideMode)}
                className="flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 transition-colors"
              >
                <PenLine className="h-4 w-4" />
                {overrideMode ? 'Cancel Date Override' : 'Override Leave Dates (Optional)'}
              </button>
              
              {overrideMode && (
                <div className="space-y-2 bg-white rounded p-3 border border-blue-100">
                  <p className="text-xs text-slate-600 mb-2">
                    If you want to modify the leave dates before final approval, set them here. These dates will be used in the signed memo instead of the HR office dates.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Start Date</label>
                      <input
                        type="date"
                        value={hrStartDate}
                        onChange={(e) => setHrStartDate(e.target.value)}
                        className="w-full h-8 px-2 border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">End Date</label>
                      <input
                        type="date"
                        value={hrEndDate}
                        onChange={(e) => setHrEndDate(e.target.value)}
                        className="w-full h-8 px-2 border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Final Days (Working)</label>
                      <input
                        type="number"
                        min="0"
                        value={hrDays}
                        onChange={(e) => setHrDays(e.target.value)}
                        className="w-full h-8 px-2 border border-slate-300 rounded text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    The working days value you set here will appear as the final approved days in the memo when signed.
                  </p>
                </div>
              )}
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
              {/* View Memo button */}
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 text-slate-600 hover:bg-slate-100 mr-auto gap-1"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="h-3 w-3" />
                View Memo
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 gap-1"
                disabled={processing || ["hr_approved", "hr_rejected", "cancelled"].includes(req.status)}
                title={["hr_approved", "hr_rejected", "cancelled"].includes(req.status) ? 'This request has already been processed' : undefined}
                onClick={() => onReject(note)}
              >
                {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                Reject
              </Button>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white gap-1"
                disabled={processing || !sigReady || ["hr_approved", "hr_rejected", "cancelled"].includes(req.status)}
                title={
                  ["hr_approved", "hr_rejected", "cancelled"].includes(req.status)
                    ? 'This request has already been processed'
                    : !sigReady ? 'Set a signature above before approving' 
                    : undefined
                }
                onClick={() => {
                  // Pass HR executive's override dates if in override mode
                  const dateOverride = overrideMode 
                    ? JSON.stringify({ 
                        hr_approved_start_date: hrStartDate || null,
                        hr_approved_end_date: hrEndDate || null,
                        hr_approved_days: hrDays ? Number(hrDays) : null
                      })
                    : null
                  // TODO: Modify onApprove signature to accept dateOverride
                  onApprove(note, dateOverride)
                }}
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
        storedSignatureDataUrl={storedSignatureDataUrl}
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
  const [storedSignatureDataUrl, setStoredSignatureDataUrl] = useState<string | null>(null)
  const [inlineSig, setInlineSig] = useState<{ dataUrl: string | null; text: string | null; mode: string } | null>(null)
  const [signerName, setSignerName] = useState('HR Executive')
  const [signerPosition, setSignerPosition] = useState('HR MANAGER')

  const [deptFilter, setDeptFilter] = useState('all')
  const [locFilter, setLocFilter] = useState('all')
  const [hrApproveSubTab, setHrApproveSubTab] = useState<'pending' | 'approved' | 'deferments' | 'recalls'>('pending')

  // Approved payment advice memos state
  const [approvedPaymentMemos, setApprovedPaymentMemos] = useState<any[]>([])
  const [loadingApprovedPayment, setLoadingApprovedPayment] = useState(false)
  const [approvedPaymentMonth, setApprovedPaymentMonth] = useState('')
  const [downloadingMemoId, setDownloadingMemoId] = useState<string | null>(null)

  // Deferments and recalls state
  const [deferments, setDeferments] = useState<any[]>([])
  const [recalls, setRecalls] = useState<any[]>([])
  const [loadingDefermentRecall, setLoadingDefermentRecall] = useState(false)

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
      if (data.signer_signature_data_url) setStoredSignatureDataUrl(data.signer_signature_data_url)
    } catch (err) {
      console.error('[v0] HrApprovalsTab fetch error:', err)
      toast({ title: 'Error', description: 'Failed to load HR approval requests', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  // ── Auto-fetch stored signature independently of the requests list ────────
  // This catches signatures stored in approval_signature_registry or user_profiles
  // so the "No stored signature" banner never shows for users who already signed up.
  useEffect(() => {
    async function loadStoredSignature() {
      try {
        const res = await fetch('/api/signature/auto-populate')
        if (!res.ok) return
        const data = await res.json()
        if (data?.hasSignature && data?.signature?.signature_data_url) {
          setStoredSignatureDataUrl(data.signature.signature_data_url)
          setHasStoredSignature(true)
        }
        if (data?.signer?.name) setSignerName(data.signer.name)
        if (data?.signer?.position) setSignerPosition(data.signer.position?.toUpperCase() || 'HR MANAGER')
      } catch {
        // silent — fetchRequests will also attempt to load the signature
      }
    }
    loadStoredSignature()
  }, [])

  // ── Fetch approved payment advice memos ──────────────────────────────────
  const fetchApprovedPaymentMemos = useCallback(async (month?: string) => {
    setLoadingApprovedPayment(true)
    try {
      const url = month
        ? `/api/leave/payment-advice/approved-memos?month=${month}`
        : '/api/leave/payment-advice/approved-memos'
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setApprovedPaymentMemos(data.memos || [])
    } catch (err) {
      console.error('[v0] fetchApprovedPaymentMemos error:', err)
      setApprovedPaymentMemos([])
    } finally {
      setLoadingApprovedPayment(false)
    }
  }, [])

  // Fetch when switching to approved tab or month changes
  useEffect(() => {
    if (hrApproveSubTab === 'approved') {
      fetchApprovedPaymentMemos(approvedPaymentMonth || undefined)
    }
  }, [hrApproveSubTab, approvedPaymentMonth, fetchApprovedPaymentMemos])

  // ── Fetch deferments and recalls ──────────────────────────────────────────
  const fetchDefermentRecallRequests = useCallback(async () => {
    setLoadingDefermentRecall(true)
    try {
      // Fetch deferments and recalls in parallel from the management endpoint
      // For Executive HR, we fetch "pending" status to show requests awaiting their decision
      const [deferRes, recallRes] = await Promise.all([
        fetch('/api/leave/hr-deferment-recall-management?type=deferment&status=pending'),
        fetch('/api/leave/hr-deferment-recall-management?type=recall&status=pending'),
      ])

      if (!deferRes.ok && !recallRes.ok) {
        console.error('[v0] Both deferment and recall fetch failed')
        setDeferments([])
        setRecalls([])
        return
      }

      const deferData = deferRes.ok ? await deferRes.json() : { requests: [] }
      const recallData = recallRes.ok ? await recallRes.json() : { requests: [] }
      
      setDeferments(deferData.requests || [])
      setRecalls(recallData.requests || [])
    } catch (err) {
      console.error('[v0] fetchDefermentRecallRequests error:', err)
      setDeferments([])
      setRecalls([])
    } finally {
      setLoadingDefermentRecall(false)
    }
  }, [])

  // Fetch when switching to deferments or recalls tab
  useEffect(() => {
    if (hrApproveSubTab === 'deferments' || hrApproveSubTab === 'recalls') {
      fetchDefermentRecallRequests()
    }
  }, [hrApproveSubTab, fetchDefermentRecallRequests])

  // ── Download approved payment memo ───────────────────────────────────────
  const handleDownloadMemo = async (memoId: string, staffName: string) => {
    setDownloadingMemoId(memoId)
    try {
      const res = await fetch(`/api/leave/payment-advice/download?memo_id=${memoId}`)
      if (!res.ok) {
        toast({ title: 'Download failed', description: 'Could not download memo', variant: 'destructive' })
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `payment-advice-${staffName.replace(/\s+/g, '-')}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: 'Download failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setDownloadingMemoId(null)
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  const handleApprove = async (reqId: string, note: string, subject: string, body: string, dateOverrideJson?: string | null) => {
    try {
      setProcessingId(reqId)
      const requestBody: any = {
        leave_plan_request_id: reqId,
        action: 'approve',
        note: note || undefined,
        memo_draft_subject: subject || undefined,
        memo_draft_body: body || undefined,
        hr_signature_mode: inlineSig?.mode || undefined,
        hr_signature_text: inlineSig?.text || undefined,
        hr_signature_data_url: inlineSig?.dataUrl || undefined,
      }
      
      // Add HR executive date override if provided
      if (dateOverrideJson) {
        try {
          const override = JSON.parse(dateOverrideJson)
          requestBody.hr_approved_start_date = override.hr_approved_start_date
          requestBody.hr_approved_end_date = override.hr_approved_end_date
          requestBody.hr_approved_days = override.hr_approved_days
        } catch (e) {
          console.error('[v0] Failed to parse dateOverride:', e)
        }
      }
      
      const res = await fetch('/api/leave/planning/hr-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()
      if (!res.ok) {
        // Check for duplicate processing error
        if (data.code === 'ALREADY_PROCESSED' || res.status === 409) {
          toast({
            title: 'Request Already Processed',
            description: 'This leave request has already been processed and cannot be modified again. If you believe this is an error, please contact your HR administrator.',
            variant: 'destructive',
          })
        } else {
          throw new Error(data.error || 'Approval failed')
        }
      } else {
        toast({ title: 'Leave Approved', description: data.message || 'Memo issued successfully.' })
        setExpandedId(null)
        fetchRequests()
      }
    } catch (err: any) {
      let errorMsg = 'Approval failed'
      if (err?.message) {
        errorMsg = err.message
      } else if (typeof err === 'string') {
        errorMsg = err
      } else if (err && typeof err === 'object') {
        errorMsg = JSON.stringify(err)
      }
      console.error('[v0] handleApprove error:', err)
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' })
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
      if (!res.ok) {
        // Check for duplicate processing error
        if (data.code === 'ALREADY_PROCESSED' || res.status === 409) {
          toast({
            title: 'Request Already Processed',
            description: 'This leave request has already been processed and cannot be modified again. If you believe this is an error, please contact your HR administrator.',
            variant: 'destructive',
          })
        } else {
          throw new Error(data.error || 'Rejection failed')
        }
      } else {
        toast({ title: 'Leave Rejected', description: data.message || 'Request rejected.' })
        setExpandedId(null)
        fetchRequests()
      }
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
      {/* Sub-tab navigation for HR Approve */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setHrApproveSubTab('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            hrApproveSubTab === 'pending'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Pending Decisions ({requests.length})
        </button>
        <button
          onClick={() => setHrApproveSubTab('approved')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            hrApproveSubTab === 'approved'
              ? 'border-green-500 text-green-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Approved Request
        </button>
        <button
          onClick={() => setHrApproveSubTab('deferments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            hrApproveSubTab === 'deferments'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Deferments
        </button>
        <button
          onClick={() => setHrApproveSubTab('recalls')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            hrApproveSubTab === 'recalls'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Recalls
        </button>
      </div>

      {/* Filters + count (for pending tab only) */}
      {hrApproveSubTab === 'pending' && (
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
      )}

      {/* Content based on active sub-tab */}
      {hrApproveSubTab === 'pending' && (
      <>
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
                onApprove={(note, dateOverride) => handleApprove(req.id, note, '', '', dateOverride)}
              onReject={(note) => handleReject(req.id, note)}
              processing={processingId === req.id}
              hasStoredSignature={hasStoredSignature}
              storedSignatureDataUrl={storedSignatureDataUrl}
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
      </>
      )}

      {/* Approved Payment Advice tab */}
      {hrApproveSubTab === 'approved' && (
        <div className="space-y-4">
          {/* Month filter */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Calendar className="h-4 w-4 text-slate-500" />
            <label className="text-sm font-medium text-slate-700">Filter by Month:</label>
            <input
              type="month"
              value={approvedPaymentMonth}
              onChange={e => {
                setApprovedPaymentMonth(e.target.value)
              }}
              className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            {approvedPaymentMonth && (
              <button
                onClick={() => setApprovedPaymentMonth('')}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear
              </button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1.5"
              onClick={() => fetchApprovedPaymentMemos(approvedPaymentMonth || undefined)}
            >
              <Eye className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {loadingApprovedPayment ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading approved payment advice memos...
              </CardContent>
            </Card>
          ) : approvedPaymentMemos.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-green-400" />
                <p className="text-sm text-slate-500">No approved payment advice memos found</p>
                <p className="text-xs text-slate-400">
                  {approvedPaymentMonth
                    ? `No approved memos for ${approvedPaymentMonth}.`
                    : 'Approved payment advice memos will appear here once memos are approved.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Staff Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Staff No.</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Subject</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Signer</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Date</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedPaymentMemos.map((memo: any) => (
                        <tr key={memo.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-medium text-slate-900">{memo.staff_name}</td>
                          <td className="py-3 px-4 text-slate-600 text-xs">{memo.staff_number}</td>
                          <td className="py-3 px-4 text-slate-600 text-xs max-w-[200px] truncate" title={memo.memo_subject}>
                            {memo.memo_subject}
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-xs">
                            {memo.signer_name || <span className="text-slate-400 italic">Pending</span>}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              memo.status === 'forwarded_to_accounts' || memo.status === 'acknowledged_by_accounts'
                                ? 'bg-blue-100 text-blue-800'
                                : memo.status === 'reviewed_by_hr' || memo.status === 'signed_by_hr_executive'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {memo.status === 'reviewed_by_hr' ? 'Approved by HR'
                                : memo.status === 'signed_by_hr_executive' ? 'Signed'
                                : memo.status === 'forwarded_to_accounts' ? 'Forwarded to Accounts'
                                : memo.status === 'acknowledged_by_accounts' ? 'Acknowledged'
                                : memo.status?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs">
                            {memo.updated_at
                              ? new Date(memo.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              disabled={downloadingMemoId === memo.id}
                              onClick={() => handleDownloadMemo(memo.id, memo.staff_name)}
                            >
                              {downloadingMemoId === memo.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Download className="h-3 w-3" />}
                              PDF
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">
                  Showing {approvedPaymentMemos.length} approved memo{approvedPaymentMemos.length !== 1 ? 's' : ''}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Deferments tab */}
      {hrApproveSubTab === 'deferments' && (
        <Card>
          <CardContent className="py-8">
            {loadingDefermentRecall ? (
              <div className="flex items-center justify-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading deferment requests...
              </div>
            ) : deferments.length === 0 ? (
              <div className="text-center text-slate-600 py-4">
                <p>No deferment requests pending</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deferments.map((req: any) => {
                  const profile = req.staff || req.leave_plan_requests?.user_profiles
                  const staffName = req.staff_name || 
                    (profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown Staff')
                  const staffId = req.staff_user_id || profile?.employee_id || profile?.id || 'N/A'
                  return (
                    <div key={req.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{staffName}</p>
                          <p className="text-sm text-slate-600">Staff ID: {staffId}</p>
                          <p className="text-sm text-slate-600 mt-1">Reason: {req.request_reason || 'N/A'}</p>
                          <p className="text-sm text-slate-600">Defer to Year: {req.deferment_to_year || 'N/A'}</p>
                          <p className="text-xs text-slate-500 mt-2">Submitted: {fmtDate(req.created_at)}</p>
                        </div>
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          {(req.status || 'pending').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recalls tab */}
      {hrApproveSubTab === 'recalls' && (
        <Card>
          <CardContent className="py-8">
            {loadingDefermentRecall ? (
              <div className="flex items-center justify-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading recall requests...
              </div>
            ) : recalls.length === 0 ? (
              <div className="text-center text-slate-600 py-4">
                <p>No recall requests pending</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recalls.map((req: any) => {
                  const profile = req.staff || req.leave_plan_requests?.user_profiles
                  const staffName = req.staff_name || 
                    (profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown Staff')
                  const staffId = req.staff_user_id || profile?.employee_id || profile?.id || 'N/A'
                  return (
                    <div key={req.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{staffName}</p>
                          <p className="text-sm text-slate-600">Staff ID: {staffId}</p>
                          <p className="text-sm text-slate-600 mt-1">Recall Date: {fmtDate(req.recall_date || req.created_at)}</p>
                          <p className="text-sm text-slate-600">Reason: {req.recall_reason || req.recall_notes || 'N/A'}</p>
                          <p className="text-xs text-slate-500 mt-2">Submitted: {fmtDate(req.created_at)}</p>
                        </div>
                        <Badge variant="outline" className="text-red-600 border-red-300">
                          {(req.status || 'pending').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
