'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Calendar, AlertCircle, User, CheckCircle2, Download, FileText, LayoutList } from 'lucide-react'

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
  entitlement_days?: number | null
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
  memo_draft_body?: string | null
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

function fmtShort(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
}

function nextWorkday(end?: string | null): string {
  if (!end) return '—'
  const dt = new Date(end)
  if (isNaN(dt.getTime())) return '—'
  dt.setDate(dt.getDate() + 1)
  if (dt.getDay() === 6) dt.setDate(dt.getDate() + 2)
  if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1)
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

function buildRefNo(req: LeaveRequest): string {
  const lt = (req.leave_type_key || 'AN').toUpperCase().substring(0, 2)
  const year = new Date(req.hr_approved_at || req.created_at || '').getFullYear()
  return `QCC/HRD/${lt}L/${year}/${shortId(req.id)}`
}

function buildYearLabel(req: LeaveRequest): string {
  if (req.leave_year_period) return req.leave_year_period.replace('/', '–')
  const start = req.adjusted_start_date || req.start_date || req.preferred_start_date
  return start ? new Date(start).getFullYear().toString() : new Date().getFullYear().toString()
}

// ── PDF Download for a single approved leave ──────────────────────────────────

async function downloadSingleMemo(req: LeaveRequest) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const cw = pageWidth - 2 * margin

  // Load logo
  let logoDataUrl: string | null = null
  try {
    const r = await fetch('/logos/qcc-logo.png')
    if (r.ok) {
      const ab = await (await r.blob()).arrayBuffer()
      const ua = new Uint8Array(ab)
      let bin = ''; ua.forEach(b => { bin += String.fromCharCode(b) })
      logoDataUrl = `data:image/png;base64,${btoa(bin)}`
    }
  } catch { /* skip */ }

  // ── Letterhead: logo left, org centre, address right ─────────────────────
  const logoSize = 24
  const logoY = 13
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', margin, logoY, logoSize, logoSize)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text('QUALITY CONTROL COMPANY LTD.', pageWidth / 2, 19, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('(COCOBOD)', pageWidth / 2, 25, { align: 'center' })

  doc.setFontSize(8.5)
  doc.text('P.O. Box M54', pageWidth - margin, 15, { align: 'right' })
  doc.text('Accra', pageWidth - margin, 20, { align: 'right' })
  doc.text('Ghana', pageWidth - margin, 25, { align: 'right' })

  // Green accent bar
  let y = logoY + logoSize + 3
  doc.setFillColor(26, 110, 26)
  doc.rect(margin, y, cw, 1.5, 'F')
  y += 6

  // Ref + Date (green ref, black date)
  const refNo = buildRefNo(req)
  const approvedDate = fmtOrdinal(req.hr_approved_at || req.created_at)
  doc.setFontSize(9); doc.setTextColor(26, 110, 26)
  doc.text(`Our Ref No:  ${refNo}`, margin, y)
  doc.setTextColor(0)
  doc.text(`Date:  ${approvedDate}`, pageWidth - margin, y, { align: 'right' })
  y += 5
  doc.setTextColor(26, 110, 26)
  doc.text('Your Ref No:  ____________________________', margin, y)
  doc.setTextColor(0)
  y += 5
  doc.setDrawColor(180); doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Addressee
  const staffName = req.user_profiles?.full_name || req.staff_name || 'STAFF MEMBER'
  const serial = req.user_profiles?.employee_id || req.staff_id || shortId(req.id)
  const position = req.user_profiles?.position || ''
  const dept = req.user_profiles?.department_name || ''

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0)
  doc.text(`${staffName.toUpperCase()}  (S/NO.:  ${serial})`, margin, y)
  y += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(26, 110, 26)
  if (position) { doc.text(position.toUpperCase(), margin, y); y += 4.5 }
  if (dept) { doc.text(dept.toUpperCase(), margin, y); y += 4.5 }
  doc.setTextColor(0)
  y += 3

  // THRO
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0)
  doc.text('THRO:', margin, y)
  doc.setTextColor(26, 110, 26)
  doc.text(`  ${dept ? `THE ${dept.toUpperCase()} HEAD` : 'THE DEPARTMENT HEAD'}`, margin + 14, y)
  y += 4.5
  doc.text('QUALITY CONTROL COMPANY LIMITED', margin + 14, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.text(dept.toUpperCase(), margin + 14, y)
  doc.setTextColor(0)
  y += 8

  // Subject (bold underline, black)
  const leaveType = leaveTypeLabel(req.leave_type_key || req.leave_type)
  const yearLabel = buildYearLabel(req)
  const subject = `${leaveType.toUpperCase()} LEAVE ADVICE FOR ${yearLabel}`
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(subject, margin, y)
  const sw = doc.getTextWidth(subject)
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.line(margin, y + 1, margin + sw, y + 1)
  y += 9

  // Body — official QCC wording
  const startDate = req.adjusted_start_date || req.start_date || req.preferred_start_date
  const endDate = req.adjusted_end_date || req.end_date || req.preferred_end_date
  const grantedDays = req.adjusted_days ?? req.requested_days ?? 0
  const body = `In accordance with COCOBOD's vacation leave policy, we wish to inform you that approval has been granted for you to proceed on your ${leaveType.toLowerCase()} leave in respect of the year January to December ${yearLabel}.`
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  const bodyLines = doc.splitTextToSize(body, cw)
  bodyLines.forEach((l: string) => { doc.text(l, margin, y); y += 5 })
  y += 4

  // Leave table
  const travelDays = req.travelling_days_added ?? 0
  const baseDays = grantedDays - travelDays
  const entitledLabel = travelDays > 0
    ? `${baseDays} plus ${travelDays} travelling day${travelDays !== 1 ? 's' : ''}`
    : `${req.entitlement_days ?? grantedDays}`
  const remarks = travelDays > 0 ? `${travelDays} travelling day(s) added` : ''

  autoTable(doc, {
    startY: y,
    head: [['Number of Days\nEntitled', 'Number of Days\nGranted', 'From', 'To', 'Remarks']],
    body: [
      [entitledLabel, String(grantedDays), fmtOrdinal(startDate), fmtOrdinal(endDate), remarks],
      ['', String(grantedDays), '', '', ''],
    ],
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, halign: 'left', cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.3 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // Resume duty — official wording
  const resumeDt = nextWorkday(endDate)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  doc.text(`You are to resume duty on ${resumeDt}.`, margin, y)
  y += 8

  // Closing — official wording
  doc.text('We wish you a pleasant and relaxing vacation.', margin, y)
  y += 14

  // Signature block
  const sigDataUrl = req.hr_approver_signature_data_url || req.hr_signature_data_url || null
  const sigText = req.hr_signature_text || null
  const signerName = req.hr_approver_name || '—'
  const signerPos = req.hr_approver_position || 'HR MANAGER'

  if (sigDataUrl) {
    try {
      if (sigDataUrl.startsWith('data:image/')) {
        const m = sigDataUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
        if (m) {
          const it = m[1].toUpperCase() === 'JPEG' ? 'JPEG' : 'PNG'
          doc.addImage(sigDataUrl, it, margin, y - 4, 44, 16)
          y += 12
        }
      }
    } catch { /* skip */ }
  } else if (sigText) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(14)
    doc.text(sigText, margin, y); y += 8
    doc.setFont('helvetica', 'normal')
  }

  doc.setDrawColor(0); doc.setLineWidth(0.4)
  doc.line(margin, y, margin + 70, y)
  y += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text(signerName.toUpperCase(), margin, y)
  y += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(26, 110, 26)
  doc.text(signerPos.toUpperCase(), margin, y)
  doc.setTextColor(0)
  y += 5
  doc.text('FOR: MANAGING DIRECTOR', margin, y)
  y += 10

  // CC
  if (y > pageHeight - margin - 25) { doc.addPage(); y = margin }
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('cc:', margin, y)
  doc.setFont('helvetica', 'normal')
  const ccItems = ['Managing Director', 'Deputy Managing Director', 'HR Leave Office', 'File']
  ccItems.forEach((item, i) => { doc.text(item, margin + 12, y + i * 4.5) })
  y += ccItems.length * 4.5

  // Footer
  const fy = pageHeight - 10
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(margin, fy - 4, pageWidth - margin, fy - 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
  doc.text(
    'Tel: +233-571-461-114  |  +233-571-461-113  |  Fax: GA-105-8378  |  Email: info@qccgh.com  |  www.qccgh.com',
    pageWidth / 2, fy, { align: 'center' }
  )

  const fname = `Leave_Memo_${staffName.replace(/\s+/g, '_').toUpperCase()}_${Date.now()}.pdf`
  doc.save(fname)
}

// ── Compact list row (approved view) ─────────────────────────────────────────

function ApprovedRow({ req }: { req: LeaveRequest }) {
  const staffName = req.user_profiles?.full_name || req.staff_name || 'N/A'
  const dept = req.user_profiles?.department_name || '—'
  const leaveType = leaveTypeLabel(req.leave_type_key || req.leave_type)
  const startDate = req.adjusted_start_date || req.start_date || req.preferred_start_date
  const endDate = req.adjusted_end_date || req.end_date || req.preferred_end_date
  const approver = req.hr_approver_name || '—'

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors text-[12.5px]">
      <td className="py-2.5 px-3 font-medium text-slate-900">{staffName}</td>
      <td className="py-2.5 px-3 text-slate-600 hidden md:table-cell">{dept}</td>
      <td className="py-2.5 px-3">
        <Badge variant="secondary" className="text-[11px] font-normal">{leaveType}</Badge>
      </td>
      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{fmtShort(startDate)}</td>
      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap hidden sm:table-cell">{fmtShort(endDate)}</td>
      <td className="py-2.5 px-3 text-slate-600 hidden lg:table-cell text-[11.5px]">{approver}</td>
    </tr>
  )
}

// ── Full memo preview card ────────────────────────────────────────────────────

function QccMemoCard({ req }: { req: LeaveRequest }) {
  const [downloading, setDownloading] = useState(false)
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
    : `${req.entitlement_days ?? grantedDays}`
  const remarks = travelDays > 0 ? `${travelDays} travelling day(s) added` : '—'

  const leaveType = leaveTypeLabel(req.leave_type_key || req.leave_type)
  const yearLabel = buildYearLabel(req)
  const refNo = buildRefNo(req)
  const approvedDate = fmtOrdinal(req.hr_approved_at || req.created_at)

  const signerName = req.hr_approver_name || '—'
  const signerPosition = req.hr_approver_position || 'HR MANAGER'
  const sigDataUrl = req.hr_approver_signature_data_url || req.hr_signature_data_url || null
  const sigText = req.hr_signature_text || null

  const handleDownload = async () => {
    setDownloading(true)
    try { await downloadSingleMemo(req) } finally { setDownloading(false) }
  }

  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded overflow-hidden mb-6 font-sans text-[12.5px] text-slate-900 leading-[1.65]">

      {/* Download button row */}
      <div className="flex justify-end px-6 py-2 border-b border-slate-100 bg-slate-50">
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-[12px] border-[#1a6e1a] text-[#1a6e1a] hover:bg-green-50"
          onClick={handleDownload}
          disabled={downloading}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {downloading ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {/* Letterhead */}
      <div className="px-10 pt-6 pb-0 flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/qcc-logo.png" alt="QCC Logo" className="w-[60px] h-[60px] object-contain shrink-0" />
        <div className="flex-1 text-center pt-1">
          <p className="font-bold text-[15px] tracking-widest">QUALITY CONTROL COMPANY LTD.</p>
          <p className="text-[11px] tracking-wider text-slate-700">(COCOBOD)</p>
        </div>
        <div className="text-right text-[10.5px] text-slate-600 shrink-0 pt-1 min-w-[80px]">
          <p>P.O. Box M54</p><p>Accra</p><p>Ghana</p>
        </div>
      </div>

      {/* Green accent bar */}
      <div className="mx-10 mt-3 h-[4px] bg-[#1a6e1a]" />

      {/* Ref + Date */}
      <div className="px-10 mt-3 flex justify-between text-[11px]">
        <div className="space-y-[3px] text-[#1a6e1a]">
          <p><span className="font-medium">Our Ref No:&nbsp;</span>{refNo}</p>
          <p><span className="font-medium">Your Ref No:&nbsp;</span><span className="border-b border-[#1a6e1a] inline-block w-32">&nbsp;</span></p>
        </div>
        <p className="text-slate-700">Date: {approvedDate}</p>
      </div>

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
          <span className="text-[#1a6e1a] font-medium uppercase">{dept !== '—' ? `THE ${dept} HEAD` : 'THE DEPARTMENT HEAD'}</span>
        </p>
        <p className="ml-[3.5rem] text-[#1a6e1a] font-medium">QUALITY CONTROL COMPANY LIMITED</p>
        <p className="ml-[3.5rem] text-[#1a6e1a] uppercase">{dept}</p>
      </div>

      {/* Subject */}
      <div className="px-10 mt-5">
        <p className="font-bold underline text-[13px] uppercase">
          {leaveType} LEAVE ADVICE FOR {yearLabel}
        </p>
      </div>

      {/* Body — official QCC wording */}
      <div className="px-10 mt-4 text-[12px] leading-relaxed">
        <p>
          In accordance with COCOBOD&apos;s vacation leave policy, we wish to inform you that approval has
          been granted for you to proceed on your {leaveType.toLowerCase()} leave in respect of the year
          January to December {yearLabel}.
        </p>
        <p className="mt-3">Your leave details are shown below.</p>
      </div>

      {/* Leave details table */}
      <div className="px-10 mt-4">
        <table className="w-full border-collapse text-[11.5px] border border-slate-300">
          <thead>
            <tr className="border-b border-slate-300">
              {['Number of Days Entitled', 'Number of Days Granted', 'From', 'To', 'Remarks'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold border-r last:border-r-0 border-slate-300 bg-slate-50 leading-tight">
                  {h}
                </th>
              ))}
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

      {/* Resume + closing — official wording */}
      <div className="px-10 mt-5 text-[12px] space-y-3">
        <p>You are to resume duty on <span className="font-semibold">{nextWorkday(endDate)}</span>.</p>
        <p>We wish you a pleasant and relaxing vacation.</p>
      </div>

      {/* Signature block */}
      <div className="px-10 mt-10 mb-2">
        {(sigDataUrl || sigText) && (
          <div className="min-h-[44px] flex items-end mb-1">
            {sigDataUrl
              ? <img src={sigDataUrl} alt="Signature" className="max-h-11 max-w-[160px] object-contain" /> // eslint-disable-line @next/next/no-img-element
              : <p className="font-[cursive] text-2xl italic text-slate-700 leading-none">{sigText}</p>}
          </div>
        )}
        <div className="w-[240px] border-b border-slate-700 mb-2" />
        <p className="font-bold uppercase text-[12.5px]">{signerName}</p>
        <p className="text-[11.5px] uppercase text-[#1a6e1a] font-medium">{signerPosition}</p>
        <p className="text-[11.5px]">FOR: MANAGING DIRECTOR</p>
      </div>

      {/* CC */}
      <div className="px-10 mt-7 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
        <div className="flex gap-2">
          <span className="font-bold text-slate-800">cc:</span>
          <div>
            <p>Managing Director</p>
            <p>Deputy Managing Director</p>
            <p>HR Leave Office</p>
            <p>File</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mx-10 mt-5 mb-5 border-t border-slate-300 pt-2 text-[10px] text-slate-400 text-center">
        Tel: +233-571-461-114&nbsp;&nbsp;|&nbsp;&nbsp;+233-571-461-113&nbsp;&nbsp;|&nbsp;&nbsp;Fax: GA-105-8378&nbsp;&nbsp;|&nbsp;&nbsp;Email: info@qccgh.com&nbsp;&nbsp;|&nbsp;&nbsp;www.qccgh.com
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
                <Badge className={getAgingBadgeColor(req.daysPending)}>{req.daysPending}d pending</Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {leaveTypeLabel(req.leave_type_key || req.leave_type)}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{req.start_date ? fmtShort(req.start_date) : 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{req.end_date ? fmtShort(req.end_date) : 'N/A'}</span>
            </div>
          </div>
          {req.status && <Badge variant="outline" className="text-xs">{req.status}</Badge>}
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
  // For approved view: 'list' = compact table, 'memo' = full QCC memo per entry
  const [viewMode, setViewMode] = useState<'list' | 'memo'>('list')
  const [selectedReq, setSelectedReq] = useState<LeaveRequest | null>(null)

  useEffect(() => {
    if (!open) return
    const fetchRequests = async () => {
      setLoading(true); setError(null)
      try {
        const APPROVED_STATUSES = ['approved', 'hr_approved', 'hod_approved', 'finalized', 'completed', 'memo_issued']
        const HOD_PENDING_STATUSES = ['pending_hod_review', 'hod_review', 'pending_hod', 'submitted', 'hr_office_reviewed', 'pending_hr_approval']
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
          results = Array.isArray(d.requests) ? d.requests : Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : []
        } else if (filter === 'approved') {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          const all: any[] = Array.isArray(d.data) ? d.data : Array.isArray(d.records) ? d.records : Array.isArray(d.requests) ? d.requests : Array.isArray(d) ? d : []
          results = all.filter((r: any) => APPROVED_STATUSES.includes(String(r.status || '').toLowerCase()))
        } else if (filter === 'hod-pending') {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          const all: any[] = Array.isArray(d.data) ? d.data : Array.isArray(d.records) ? d.records : Array.isArray(d.requests) ? d.requests : Array.isArray(d) ? d : []
          const hodRes = await fetch('/api/leave/hod-pending-requests')
          const hodData = hodRes.ok ? await hodRes.json() : {}
          const hodRequests: any[] = Array.isArray(hodData.requests) ? hodData.requests : []
          const fromStatus = all.filter((r: any) => HOD_PENDING_STATUSES.includes(String(r.status || '').toLowerCase()))
          const merged = [...fromStatus]
          hodRequests.forEach((hr: any) => { if (!merged.find(m => m.id === hr.id)) merged.push(hr) })
          results = merged
        } else {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.data) ? d.data : Array.isArray(d.records) ? d.records : Array.isArray(d.requests) ? d.requests : Array.isArray(d) ? d : []
        }

        setRequests(results.map((req: any) => ({
          ...req,
          staff_name: req.staff_name || req.user_profiles?.full_name || req.user_profiles?.first_name || 'N/A',
          staff_id: req.staff_id || req.user_profiles?.employee_id || 'N/A',
        })))
      } catch (err) {
        setError(`Failed to load: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }
    fetchRequests()
  }, [open, filter])

  const isApprovedView = filter === 'approved'

  // If a single memo is selected for full view
  if (selectedReq) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Leave Advice Memo
              </DialogTitle>
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setSelectedReq(null)}>
                Back to list
              </Button>
            </div>
          </DialogHeader>
          <QccMemoCard req={selectedReq} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isApprovedView ? 'max-w-4xl' : 'max-w-2xl'} max-h-[88vh] overflow-y-auto`}>
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="flex items-center gap-2">
              {isApprovedView && <CheckCircle2 className="w-5 h-5 text-green-600" />}
              {title}
              {requests.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-1">({requests.length})</span>
              )}
            </DialogTitle>
            {isApprovedView && !loading && requests.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList className="w-3.5 h-3.5 mr-1" />
                  List
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'memo' ? 'default' : 'ghost'}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setViewMode('memo')}
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  Memos
                </Button>
              </div>
            )}
          </div>
          {isApprovedView && (
            <p className="text-xs text-muted-foreground pt-0.5">Official QCC/COCOBOD leave advice memos</p>
          )}
        </DialogHeader>

        {loading && <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>}

        {error && (
          <div className="py-4 px-4 bg-red-50 border border-red-200 rounded-lg text-red-800 flex gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">No requests found</div>
        )}

        {/* Approved list view — compact table */}
        {isApprovedView && !loading && requests.length > 0 && viewMode === 'list' && (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11.5px] text-slate-500 font-medium">
                  <th className="py-2.5 px-3">Staff Name</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Department</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Start</th>
                  <th className="py-2.5 px-3 hidden sm:table-cell">End</th>
                  <th className="py-2.5 px-3 hidden lg:table-cell">Approved By</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req, idx) => (
                  <ApprovedRow key={req.id || idx} req={req} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Approved memo view — full QCC letters */}
        {isApprovedView && !loading && requests.length > 0 && viewMode === 'memo' && (
          <div className="space-y-0 pt-2">
            {requests.map((req, idx) => <QccMemoCard key={req.id || idx} req={req} />)}
          </div>
        )}

        {/* Non-approved filters */}
        {!isApprovedView && !loading && (
          <div className="space-y-3">
            {requests.map((req, idx) => <RequestCard key={req.id || idx} req={req} idx={idx} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
