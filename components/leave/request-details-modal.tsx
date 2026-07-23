'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Calendar, AlertCircle, User, CheckCircle2 } from 'lucide-react'

export interface RequestDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  filter: 'pending' | 'approved' | 'payment-pending' | 'payment-approved' | 'hod-pending'
}

interface LeaveRequest {
  id: string
  staff_name?: string
  staff_id?: string
  leave_type?: string
  leave_type_key?: string
  start_date?: string
  end_date?: string
  preferred_start_date?: string
  preferred_end_date?: string
  adjusted_start_date?: string | null
  adjusted_end_date?: string | null
  requested_days?: number
  adjusted_days?: number | null
  travelling_days_added?: number | null
  leave_year_period?: string | null
  status?: string
  hod_review_status?: string
  hod_decision?: string
  daysPending?: number
  submitted_at?: string | null
  created_at?: string
  hr_approved_at?: string | null
  hr_approved_by?: string | null
  hr_approver_name?: string | null
  hr_approver_position?: string | null
  hr_approver_signature_data_url?: string | null
  hr_signature_data_url?: string | null
  hr_signature_text?: string | null
  memo_draft_subject?: string | null
  user_profiles?: {
    employee_id?: string
    department_name?: string
    departments?: { name?: string }
    full_name?: string
    first_name?: string
    position?: string
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "23rd July, 2026" */
function fmtOrdinal(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  const day = dt.getDate()
  const s = day === 1 || day === 21 || day === 31 ? 'st'
    : day === 2 || day === 22 ? 'nd'
    : day === 3 || day === 23 ? 'rd' : 'th'
  return `${day}${s} ${dt.toLocaleDateString('en-GH', { month: 'long' })}, ${dt.getFullYear()}`
}

/** Day after endDate */
function resumeDate(end?: string | null): string {
  if (!end) return '—'
  const dt = new Date(end)
  if (isNaN(dt.getTime())) return '—'
  dt.setDate(dt.getDate() + 1)
  return dt.toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function leaveTypeLabel(key?: string): string {
  if (!key) return 'Annual'
  const map: Record<string, string> = {
    annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity',
    study: 'Study', compassionate: 'Compassionate', part_leave: 'Part Leave',
    no_pay: 'No Pay', casual: 'Casual',
  }
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function shortId(id?: string | null): string {
  if (!id) return '—'
  return id.replace(/-/g, '').substring(0, 8).toUpperCase()
}

// ── QCC Memo Card ─────────────────────────────────────────────────────────────

function QccMemoCard({ req }: { req: LeaveRequest }) {
  const staffName = req.user_profiles?.full_name || req.staff_name || 'STAFF NAME'
  const serial = req.user_profiles?.employee_id || req.staff_id || shortId(req.id)
  const position = req.user_profiles?.position || '—'
  const dept = req.user_profiles?.department_name || '—'

  const startDate = req.adjusted_start_date || req.start_date || req.preferred_start_date
  const endDate = req.adjusted_end_date || req.end_date || req.preferred_end_date
  const grantedDays = req.adjusted_days ?? req.requested_days ?? 0
  const travelDays = req.travelling_days_added ?? 0
  const baseDays = grantedDays - travelDays
  const entitledLabel = travelDays > 0
    ? `${baseDays} plus ${travelDays} travelling day${travelDays !== 1 ? 's' : ''}`
    : `${grantedDays}`
  const remarks = travelDays > 0 ? `${travelDays} travelling day(s) added` : '—'

  const leaveType = leaveTypeLabel(req.leave_type_key || req.leave_type)
  const yearLabel = req.leave_year_period
    ? req.leave_year_period.replace('/', '–')
    : new Date(startDate || req.created_at || '').getFullYear().toString()
  const refNo = `QCC/HRD/${leaveType.toUpperCase().substring(0, 2)}L/${new Date(req.hr_approved_at || req.created_at || '').getFullYear()}/${shortId(req.id)}`
  const approvedDate = fmtOrdinal(req.hr_approved_at || req.created_at)

  const signerName = req.hr_approver_name || '—'
  const signerPosition = req.hr_approver_position || 'HR MANAGER'
  const sigDataUrl = req.hr_approver_signature_data_url || req.hr_signature_data_url || null
  const sigText = req.hr_signature_text || null

  return (
    /* Paper-style card: no border, just a soft shadow so it looks like a printed page */
    <div className="bg-white shadow-md rounded overflow-hidden mb-6 font-sans text-[12.5px] text-slate-900 leading-[1.65]">

      {/* ── Letterhead ──────────────────────────────────────────────── */}
      <div className="px-10 pt-7 pb-0 flex items-start gap-4">
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/qcc-logo.png"
          alt="QCC Logo"
          className="w-[60px] h-[60px] object-contain shrink-0"
        />
        {/* Org name centred */}
        <div className="flex-1 text-center pt-1">
          <p className="font-bold text-[15px] tracking-widest">QUALITY CONTROL COMPANY LTD.</p>
          <p className="text-[11px] tracking-wider text-slate-700">(COCOBOD)</p>
        </div>
        {/* Address right */}
        <div className="text-right text-[10.5px] text-slate-600 shrink-0 pt-1 min-w-[90px]">
          <p>P.O. Box M54</p>
          <p>Accra</p>
          <p>Ghana</p>
        </div>
      </div>

      {/* Solid green accent bar — full width, no margin */}
      <div className="mx-10 mt-3 h-[4px] bg-[#1a6e1a]" />

      {/* Ref + Date — green text, matching PDF */}
      <div className="px-10 mt-3 flex justify-between text-[11px] text-[#1a6e1a]">
        <div className="space-y-[3px]">
          <p><span className="font-medium">Our Ref No:&nbsp;</span>{refNo}</p>
          <p><span className="font-medium">Your Ref No:&nbsp;</span><span className="border-b border-[#1a6e1a] inline-block w-36">&nbsp;</span></p>
        </div>
        <p className="text-slate-700 text-[11px]">Date: {approvedDate}</p>
      </div>

      {/* Thin rule */}
      <div className="mx-10 mt-3 border-t border-slate-200" />

      {/* Addressee */}
      <div className="px-10 mt-3 space-y-[2px]">
        <p className="font-bold uppercase text-[13px]">{staffName}&nbsp;&nbsp;(S/NO.:&nbsp;&nbsp;{serial})</p>
        <p className="uppercase text-[11.5px] text-[#1a6e1a]">{position}</p>
        <p className="uppercase text-[11.5px] text-[#1a6e1a]">{dept}</p>
      </div>

      {/* THRO */}
      <div className="px-10 mt-4 text-[11.5px]">
        <p>
          <span className="font-bold">THRO:&nbsp;&nbsp;</span>
          <span className="text-[#1a6e1a] font-medium uppercase">{dept ? `THE ${dept} HEAD` : 'THE DEPARTMENT HEAD'}</span>
        </p>
        <p className="ml-[3.25rem] text-[#1a6e1a] font-medium uppercase">QUALITY CONTROL COMPANY LIMITED</p>
        <p className="ml-[3.25rem] text-[#1a6e1a] uppercase">{dept}</p>
      </div>

      {/* Subject — bold underline, no colour (matches PDF black text) */}
      <div className="px-10 mt-5">
        <p className="font-bold underline text-[13px] uppercase">
          {leaveType} LEAVE
        </p>
      </div>

      {/* Body */}
      <div className="px-10 mt-4 text-[12px] leading-relaxed">
        <p>
          We acknowledge receipt of your letter dated {fmtOrdinal(req.submitted_at || req.created_at)}{' '}
          in relation to the above-mentioned subject and wish to inform you that Management has given
          approval for you to proceed on {grantedDays} working days{' '}
          {leaveType.toLowerCase()} leave with effect from {fmtOrdinal(startDate)} to {fmtOrdinal(endDate)}.
        </p>
      </div>

      {/* Leave details table — plain grid, no coloured header */}
      <div className="px-10 mt-5">
        <table className="w-full border-collapse text-[11.5px] border border-slate-300">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 bg-slate-50 leading-tight w-[22%]">
                Number of Days<br />Entitled
              </th>
              <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 bg-slate-50 leading-tight w-[18%]">
                Number of Days<br />Granted
              </th>
              <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 bg-slate-50 w-[18%]">From</th>
              <th className="px-3 py-2 text-left font-semibold border-r border-slate-300 bg-slate-50 w-[18%]">To</th>
              <th className="px-3 py-2 text-left font-semibold bg-slate-50">Remarks</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-2 border-r border-slate-200">{entitledLabel}</td>
              <td className="px-3 py-2 border-r border-slate-200">{grantedDays}</td>
              <td className="px-3 py-2 border-r border-slate-200">{fmtOrdinal(startDate)}</td>
              <td className="px-3 py-2 border-r border-slate-200">{fmtOrdinal(endDate)}</td>
              <td className="px-3 py-2 text-slate-500">{remarks}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 border-r border-slate-200" />
              <td className="px-3 py-1.5 border-r border-slate-200 font-semibold">{grantedDays}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Resume + closing */}
      <div className="px-10 mt-5 text-[12px] space-y-2">
        <p>You are expected to resume duty on <span className="font-semibold">{resumeDate(endDate)}</span>.</p>
        <p>You can count on our co-operation.</p>
      </div>

      {/* Signature block */}
      <div className="px-10 mt-10 mb-2">
        {/* Signature image */}
        {(sigDataUrl || sigText) && (
          <div className="min-h-[44px] flex items-end mb-1">
            {sigDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sigDataUrl} alt="Signature" className="max-h-11 max-w-[160px] object-contain" />
            ) : (
              <p className="font-[cursive] text-2xl italic text-slate-700 leading-none">{sigText}</p>
            )}
          </div>
        )}
        {/* Underline */}
        <div className="w-[240px] border-b border-slate-700 mb-2" />
        <p className="font-bold uppercase text-[12.5px]">{signerName}</p>
        <p className="text-[11.5px] uppercase text-[#1a6e1a] font-medium">{signerPosition}</p>
        <p className="text-[11.5px]">FOR: MANAGING DIRECTOR</p>
      </div>

      {/* CC */}
      <div className="px-10 mt-7 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
        <p>
          <span className="font-bold text-slate-800">cc:&nbsp;&nbsp;</span>
          Managing Director
        </p>
        <p className="ml-[3.25rem]">Deputy Managing Director</p>
        <p className="ml-[3.25rem]">HR Leave Office</p>
        <p className="ml-[3.25rem]">File</p>
      </div>

      {/* Footer bar */}
      <div className="mx-10 mt-5 mb-5 border-t border-slate-300 pt-2 text-[10px] text-slate-400 text-center">
        Tel: +233-571-461-114&nbsp;&nbsp;|&nbsp;&nbsp;+233-571-461-113&nbsp;&nbsp;|&nbsp;&nbsp;Fax: GA-005-8378&nbsp;&nbsp;|&nbsp;&nbsp;Email: info@qccgh.com&nbsp;&nbsp;|&nbsp;&nbsp;www.qccgh.com
      </div>
    </div>
  )
}

// ── Simple request card (non-approved filters) ─────────────────────────────

function RequestCard({ req, idx }: { req: LeaveRequest; idx: number }) {
  const getAgingBadgeColor = (daysPending?: number) => {
    if (!daysPending) return 'bg-gray-100 text-gray-800'
    if (daysPending > 7) return 'bg-red-100 text-red-800'
    if (daysPending > 3) return 'bg-amber-100 text-amber-800'
    return 'bg-green-100 text-green-800'
  }

  const staffName = req.staff_name || req.user_profiles?.full_name || req.user_profiles?.first_name || 'N/A'

  return (
    <Card key={req.id || idx} className="border hover:border-primary/50 transition-colors">
      <CardContent className="pt-4 pb-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{staffName}</p>
              <p className="text-xs text-muted-foreground">
                {req.user_profiles?.employee_id || req.staff_id || 'Staff'} • {req.user_profiles?.department_name || '—'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {req.daysPending !== undefined && (
                <Badge className={getAgingBadgeColor(req.daysPending)}>
                  {req.daysPending}d pending
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {leaveTypeLabel(req.leave_type_key || req.leave_type)}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{req.start_date ? new Date(req.start_date).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{req.end_date ? new Date(req.end_date).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>

          {req.status && (
            <Badge variant="outline" className="text-xs">{req.status}</Badge>
          )}

          {req.hod_review_status && req.hod_review_status !== 'pending' && (
            <div className="flex items-center gap-2 text-xs bg-muted/50 p-2 rounded">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-muted-foreground">HOD Review: {req.hod_review_status}</span>
            </div>
          )}

          {req.hr_approver_name && (
            <div className="flex items-center gap-2 text-xs bg-green-50 p-2 rounded border border-green-100">
              <User className="h-4 w-4 text-green-600" />
              <span className="text-green-700">Approved by: <span className="font-medium">{req.hr_approver_name}</span></span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function RequestDetailsModal({ open, onOpenChange, title, filter }: RequestDetailsModalProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const fetchRequests = async () => {
      setLoading(true)
      setError(null)
      try {
        const APPROVED_STATUSES = ['approved', 'hr_approved', 'hod_approved', 'finalized', 'completed']
        const HOD_PENDING_STATUSES = ['pending_hod_review', 'hod_review', 'pending_hod', 'submitted']

        let results: LeaveRequest[] = []

        if (filter === 'payment-pending') {
          const res = await fetch('/api/leave/payment-advice/pending-approval')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.memos) ? d.memos : Array.isArray(d) ? d : []
        } else if (filter === 'payment-approved') {
          const res = await fetch('/api/leave/payment-advice/approved-memos')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.memos) ? d.memos : Array.isArray(d) ? d : []
        } else if (filter === 'pending') {
          const res = await fetch('/api/leave/hr-staff-pending-requests')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.requests) ? d.requests
            : Array.isArray(d.data) ? d.data
            : Array.isArray(d) ? d : []
        } else if (filter === 'approved') {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          const all: any[] = Array.isArray(d.data) ? d.data
            : Array.isArray(d.records) ? d.records
            : Array.isArray(d.requests) ? d.requests
            : Array.isArray(d) ? d : []
          results = all.filter((r: any) => APPROVED_STATUSES.includes(r.status))
        } else if (filter === 'hod-pending') {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          const all: any[] = Array.isArray(d.data) ? d.data
            : Array.isArray(d.records) ? d.records
            : Array.isArray(d.requests) ? d.requests
            : Array.isArray(d) ? d : []
          const hodRes = await fetch('/api/leave/hod-pending-requests')
          const hodData = hodRes.ok ? await hodRes.json() : {}
          const hodRequests: any[] = Array.isArray(hodData.requests) ? hodData.requests : []
          const fromStatus = all.filter((r: any) => HOD_PENDING_STATUSES.includes(r.status))
          const merged = [...fromStatus]
          hodRequests.forEach((hr: any) => {
            if (!merged.find(m => m.id === hr.id)) merged.push(hr)
          })
          results = merged
        } else {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.data) ? d.data
            : Array.isArray(d.records) ? d.records
            : Array.isArray(d.requests) ? d.requests
            : Array.isArray(d) ? d : []
        }

        const mapped = results.map((req: any) => ({
          ...req,
          staff_name: req.staff_name || req.user_profiles?.full_name || req.user_profiles?.first_name || 'N/A',
          staff_id: req.staff_id || req.user_profiles?.employee_id || 'N/A',
        }))

        setRequests(Array.isArray(mapped) ? mapped : [])
      } catch (err) {
        console.error('[v0] Fetch requests error:', err)
        setError(`Failed to load: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [open, filter])

  const isApprovedView = filter === 'approved'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isApprovedView ? 'max-w-3xl' : 'max-w-2xl'} max-h-[88vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isApprovedView && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            {title}
          </DialogTitle>
          {isApprovedView && (
            <p className="text-xs text-muted-foreground pt-0.5">
              Official QCC/COCOBOD leave advice memos
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
        )}

        {error && (
          <div className="py-4 px-4 bg-red-50 border border-red-200 rounded-lg text-red-800 flex gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">No requests found</div>
        )}

        <div className={`${isApprovedView ? 'space-y-0 pt-2' : 'space-y-3'}`}>
          {requests.map((req, idx) =>
            isApprovedView
              ? <QccMemoCard key={req.id || idx} req={req} />
              : <RequestCard key={req.id || idx} req={req} idx={idx} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
