import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { jsPDF } from 'jspdf'
import fs from 'fs'
import path from 'path'

// ── helpers ────────────────────────────────────────────────────────────────

const APPROVED_STATUSES = [
  'approved', 'hr_approved', 'hod_approved', 'finalized', 'completed', 'memo_issued',
]

function fmtLong(raw: string | null | undefined): string {
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtOrdinal(raw: string | null | undefined): string {
  if (!raw) return '—'
  const d = new Date(raw)
  const day = d.getDate()
  const suffix = ['th', 'st', 'nd', 'rd'][((day % 100 - 20 + 80) % 80 < 4 ? (day % 100 - 20 + 80) % 80 : day % 10 < 4 ? day % 10 : 0)] || 'th'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^(\d+)/, `${day}${suffix}`)
}

function fmtShort(raw: string | null | undefined): string {
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function computeResumeDate(endRaw: string): string {
  const d = new Date(endRaw)
  d.setDate(d.getDate() + 1)
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function leaveTypeLabel(key: string): string {
  return (key || 'annual')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ── route ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const requestId = request.nextUrl.searchParams.get('request_id')
    if (!requestId) {
      return NextResponse.json({ error: 'request_id parameter required' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Full fetch — all columns needed for the official memo
    const { data: req, error: reqErr } = await admin
      .from('leave_plan_requests')
      .select(`
        id, user_id, leave_type_key, status,
        preferred_start_date, preferred_end_date,
        adjusted_start_date, adjusted_end_date,
        requested_days, adjusted_days, entitlement_days,
        travelling_days_added, leave_year_period,
        hr_approver_id, hr_approver_name,
        hr_approved_at, hr_signature_data_url, hr_signature_text,
        submitted_at, created_at,
        memo_subject, memo_body,
        memo_draft_subject, memo_draft_body
      `)
      .eq('id', requestId)
      .single()

    if (reqErr || !req) {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    if (!APPROVED_STATUSES.includes(String(req.status || '').toLowerCase())) {
      return NextResponse.json({ error: 'Leave request is not approved' }, { status: 403 })
    }

    // ── Staff profile ────────────────────────────────────────────────────────
    const { data: staff } = await admin
      .from('user_profiles')
      .select('first_name, last_name, employee_id, department_id, position')
      .eq('id', req.user_id)
      .single()

    // ── Unified management for staff category label ──────────────────────────
    const { data: staffMgmt } = await admin
      .from('unified_user_management')
      .select('full_name, employee_id, department_name, position')
      .eq('user_id', req.user_id)
      .single()

    // ── Department ────────────────────────────────────────────────────────────
    let departmentName = staffMgmt?.department_name || 'N/A'
    const deptId = staff?.department_id
    if (deptId && departmentName === 'N/A') {
      const { data: dept } = await admin
        .from('departments')
        .select('name')
        .eq('id', deptId)
        .single()
      if (dept) departmentName = dept.name || 'N/A'
    }

    // ── HR Approver ───────────────────────────────────────────────────────────
    let signerName = req.hr_approver_name || ''
    let signerPosition = ''
    // Resolution order:
    // 1. hr_signature_data_url on the request row (captured at approval time)
    // 2. user_profiles.signature_data_url (current profile signature)
    // 3. approval_signature_registry (registry fallback)
    let signerSigDataUrl: string | null = req.hr_signature_data_url || null

    if (req.hr_approver_id) {
      const { data: hrProfile } = await admin
        .from('user_profiles')
        .select('first_name, last_name, position, signature_data_url')
        .eq('id', req.hr_approver_id)
        .single()
      if (hrProfile) {
        signerName = `${hrProfile.first_name || ''} ${hrProfile.last_name || ''}`.trim() || signerName
        signerPosition = hrProfile.position || ''
        // Only use profile signature as fallback if row-level sig is absent
        if (!signerSigDataUrl) signerSigDataUrl = hrProfile.signature_data_url || null
      }

      // Fallback: approval_signature_registry
      if (!signerSigDataUrl) {
        const { data: regSig } = await admin
          .from('approval_signature_registry')
          .select('signature_data_url')
          .eq('user_id', req.hr_approver_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (regSig?.signature_data_url) signerSigDataUrl = regSig.signature_data_url
      }
    }
    if (!signerName) signerName = 'HR EXECUTIVE'
    if (!signerPosition) signerPosition = 'HUMAN RESOURCE MANAGER'

    // ── Memo record (optional) ────────────────────────────────────────────────
    const { data: memo } = await admin
      .from('leave_payment_memos')
      .select('signer_name, signer_position, signature_data_url, leave_period_start, leave_period_end, approved_days, created_at')
      .eq('leave_plan_request_id', requestId)
      .single()

    if (memo?.signer_name && !req.hr_approver_id) signerName = memo.signer_name
    if (memo?.signer_position && !signerPosition) signerPosition = memo.signer_position
    if (memo?.signature_data_url && !signerSigDataUrl) signerSigDataUrl = memo.signature_data_url

    // ── Computed values ───────────────────────────────────────────────────────
    const staffFullName = staffMgmt?.full_name ||
      (staff ? `${staff.first_name || ''} ${staff.last_name || ''}`.trim() : 'Unknown')
    const employeeId = staffMgmt?.employee_id || staff?.employee_id || 'N/A'
    const position = staffMgmt?.position || staff?.position || ''

    const startRaw = req.adjusted_start_date || req.preferred_start_date
    const endRaw = req.adjusted_end_date || req.preferred_end_date
    const grantedDays = req.adjusted_days || req.requested_days || 0
    const entitledDays = req.entitlement_days || grantedDays
    const travelDays = req.travelling_days_added || 0
    const entitledLabel = travelDays > 0
      ? `${entitledDays - travelDays} plus ${travelDays} travelling day${travelDays !== 1 ? 's' : ''}`
      : String(entitledDays)
    const remarks = travelDays > 0
      ? `${travelDays} travelling day${travelDays !== 1 ? 's' : ''} added`
      : ''

    const leaveTypeKey = String(req.leave_type_key || 'annual').toLowerCase()
    const leaveTypeName = leaveTypeLabel(leaveTypeKey)
    const yearLabel = req.leave_year_period || String(new Date(startRaw || req.created_at).getFullYear())
    
    // Generate subject line: Annual leave uses "ADVICE FOR YYYY/YYYY", non-annual uses "RE: APPLICATION FOR..."
    let subjectLine: string
    if (leaveTypeKey === 'annual') {
      subjectLine = `${leaveTypeName.toUpperCase()} LEAVE ADVICE FOR ${yearLabel}`
    } else {
      // Non-annual leave: "RE: APPLICATION FOR [X DAYS] [LEAVE TYPE] LEAVE"
      const daysText = grantedDays > 0 ? `${grantedDays.toLocaleString()} DAY${grantedDays !== 1 ? 'S' : ''} ` : ''
      subjectLine = `RE: APPLICATION FOR ${daysText}${leaveTypeName.toUpperCase()} LEAVE`
    }

    const letterDate = req.hr_approved_at || memo?.created_at || new Date().toISOString()
    const refSuffix = requestId.split('-').pop()?.toUpperCase().slice(0, 6) || 'MEMO'
    const refNumber = `QCC/HRD/ANL/${yearLabel}/${refSuffix}`

    // ── Serialized staff date label for the serial field ─────────────────────
    const submittedAt = req.submitted_at || req.created_at
    const serialDate = submittedAt
      ? new Date(submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          .replace(/ /g, '').toLowerCase()
      : ''
    const serial = employeeId !== 'N/A' ? employeeId : serialDate

    // ── Logo ──────────────────────────────────────────────────────────────────
    let logoBase64: string | null = null
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logos', 'qcc-logo.png')
      const logoData = fs.readFileSync(logoPath)
      logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`
    } catch {
      try {
        const logoPath2 = path.join(process.cwd(), 'public', 'qcc-logo.png')
        const logoData2 = fs.readFileSync(logoPath2)
        logoBase64 = `data:image/png;base64,${logoData2.toString('base64')}`
      } catch { /* no logo — will skip */ }
    }

    // ── HR Signature image ────────────────────────────────────────────────────
    let sigImageBase64: string | null = null
    if (signerSigDataUrl) {
      sigImageBase64 = signerSigDataUrl // already a data URL from DB
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUILD PDF — Official QCC/COCOBOD format
    // ═══════════════════════════════════════════════════════════════════════
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()   // 210
    const pageH = doc.internal.pageSize.getHeight()  // 297
    const mL = 20  // left margin
    const mR = pageW - 20  // right margin
    const contentW = mR - mL
    let y = 13

    // ── Letterhead ────────────────────────────────────────────────────────────
    const headerTopY = y  // y = 13

    // Org name CENTRED (draw first so logo overlays cleanly)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    doc.text('QUALITY CONTROL COMPANY LTD.', pageW / 2, headerTopY + 7, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('(COCOBOD)', pageW / 2, headerTopY + 14, { align: 'center' })

    // Address RIGHT — black text, not grey
    doc.setFontSize(8.5)
    doc.setTextColor(0, 0, 0)
    doc.text('P.O. Box M54', mR, headerTopY + 5, { align: 'right' })
    doc.text('Accra', mR, headerTopY + 10, { align: 'right' })
    doc.text('Ghana', mR, headerTopY + 15, { align: 'right' })

    // Logo LEFT (drawn last so it sits on top)
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', mL, headerTopY, 22, 22)
      } catch { /* skip logo if format issue */ }
    }

    y = headerTopY + 28

    // Solid green accent bar
    doc.setFillColor(26, 110, 26)
    doc.rect(mL, y, contentW, 1.5, 'F')
    y += 6

    // ── Ref + Date — green text ───────────────────────────────────────────────
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(26, 110, 26)
    doc.text(`Our Ref No:  ${refNumber}`, mL, y)
    doc.setTextColor(0)
    doc.text(`Date:  ${fmtLong(letterDate)}`, mR, y, { align: 'right' })
    y += 5

    // Thin rule
    doc.setDrawColor(200)
    doc.setLineWidth(0.3)
    doc.line(mL, y, mR, y)
    y += 6

    // ── Addressee ────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text(`${staffFullName.toUpperCase()}  (S/NO.:  ${serial})`, mL, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(26, 110, 26)
    if (position) { doc.text(position.toUpperCase(), mL, y); y += 5 }
    doc.text(departmentName.toUpperCase(), mL, y)
    y += 5
    doc.setTextColor(0)
    y += 3

    // ── THRO ─────────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('THRO:', mL, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(26, 110, 26)
    doc.text(`THE ${departmentName.toUpperCase()} HEAD`, mL + 14, y)
    y += 5
    doc.text('QUALITY CONTROL COMPANY LIMITED', mL + 14, y)
    y += 5
    doc.text(departmentName.toUpperCase(), mL + 14, y)
    doc.setTextColor(0)
    y += 10

    // ── Subject — bold + underline ────────────────────────────────────────────
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(subjectLine, mL, y)
    const subW = doc.getTextWidth(subjectLine)
    doc.setDrawColor(0)
    doc.setLineWidth(0.4)
    doc.line(mL, y + 1, mL + subW, y + 1)
    y += 10

    // ── Body — official QCC wording ───────────────────────────────────────────
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0)

    // Different opening for annual vs non-annual leave
    let openingText: string
    if (leaveTypeKey === 'annual') {
      openingText = `In accordance with COCOBOD's vacation leave policy, we wish to inform you that approval has been granted for you to proceed on your ${leaveTypeName.toLowerCase()} leave in respect of the year January to December ${yearLabel}.`
    } else {
      // Non-annual: standard format like the sample memos
      const submitDate = new Date(req.created_at || new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      openingText = `We acknowledge receipt of your letter dated ${submitDate} in relation to the above-mentioned subject and wish to inform you that approval has been granted for you to proceed on ${grantedDays} working day(s) ${leaveTypeName.toLowerCase()} leave with effect from ${fmtOrdinal(startRaw)} to ${fmtOrdinal(endRaw)}.`
    }
    const openingLines = doc.splitTextToSize(openingText, contentW)
    doc.text(openingLines, mL, y)
    y += openingLines.length * 5 + 4

    // ── Leave details: TABLE FORMAT FOR ANNUAL ONLY, SIMPLE FOR OTHERS ────────
    const showTable = leaveTypeKey === "annual"  // ONLY annual leave gets table

    if (showTable) {
    // ── Leave details table (ANNUAL LEAVE ONLY) ──────────────────────────────
    doc.text('Your leave details are shown below.', mL, y)
    y += 8
    
    const tableX = mL
    const colWidths = [40, 35, 35, 35, contentW - 145]
    const rowH = 7
    const headers = ['Number of Days\nEntitled', 'Number of Days\nGranted', 'From', 'To', 'Remarks']
    const values = [entitledLabel, String(grantedDays), fmtShort(startRaw), fmtShort(endRaw), remarks]

    // Header row — re-apply fill colour inside every cell to avoid jsPDF state drift
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setLineWidth(0.3)
    const hdrPadX = 2
    const hdrPadY = 4.5
    const hdrLineH = 4.5
    let cx = tableX
    headers.forEach((h, i) => {
      // Split on explicit \n then also wrap long lines within column width
      const rawLines = h.split('\n')
      const hdrLines: string[] = []
      rawLines.forEach(rl => {
        const wrapped: string[] = doc.splitTextToSize(rl, colWidths[i] - hdrPadX * 2)
        hdrLines.push(...wrapped)
      })
      doc.setFillColor(240, 240, 240)
      doc.setDrawColor(160, 160, 160)
      doc.setTextColor(0, 0, 0)
      doc.rect(cx, y, colWidths[i], rowH * 2, 'FD')
      hdrLines.forEach((ln, li) => {
        doc.text(ln, cx + hdrPadX, y + hdrPadY + li * hdrLineH)
      })
      cx += colWidths[i]
    })
    y += rowH * 2

    // Data row — wrap text inside each cell so nothing overflows
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(0, 0, 0)
    const cellPadX = 2   // horizontal padding inside cell
    const cellPadY = 4.5 // top padding for first text line
    const lineH = 4.5    // line height for wrapped text

    // Pre-wrap all values and measure the tallest cell to set uniform row height
    const wrappedValues = values.map((v, i) =>
      doc.splitTextToSize(String(v), colWidths[i] - cellPadX * 2)
    )
    const maxLines = Math.max(...wrappedValues.map(w => w.length))
    const dataRowH = Math.max(rowH, cellPadY + maxLines * lineH + 2)

    cx = tableX
    wrappedValues.forEach((lines, i) => {
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(160, 160, 160)
      doc.rect(cx, y, colWidths[i], dataRowH, 'FD')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(0, 0, 0)
      lines.forEach((ln: string, li: number) => {
        doc.text(ln, cx + cellPadX, y + cellPadY + li * lineH)
      })
      cx += colWidths[i]
    })
    y += dataRowH

    // Totals row
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    cx = tableX
    colWidths.forEach((w, i) => {
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(160, 160, 160)
      doc.rect(cx, y, w, rowH, 'FD')
      if (i === 1) doc.text(String(grantedDays), cx + 2, y + 5)
      cx += w
    })
    y += rowH + 6
    } else {
      // ── Non-annual leave: no table, details already in opening paragraph ───
    }

    // ── Resume duty — official QCC wording ───────────────────────────────────
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0)
    doc.text(`You are to resume duty on ${computeResumeDate(endRaw)}.`, mL, y)
    y += 8

    // ── Closing ───────────────────────────────────────────────────────────────
    doc.text('We wish you a pleasant and relaxing vacation.', mL, y)
    y += 14

    // ── Signature block ───────────────────────────────────────────────────────
    if (sigImageBase64) {
      try {
        doc.addImage(sigImageBase64, 'PNG', mL, y, 35, 12)
        y += 14
      } catch { y += 0 }
    }
    doc.setDrawColor(80)
    doc.setLineWidth(0.3)
    doc.line(mL, y, mL + 58, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(signerName.toUpperCase(), mL, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(26, 110, 26)
    doc.text(signerPosition.toUpperCase(), mL, y)
    y += 5
    doc.setTextColor(0)
    doc.text('FOR: MANAGING DIRECTOR', mL, y)
    y += 12

    // ── CC ────────────────────────────────────────────────────────────────────
    doc.setFontSize(8.5)
    doc.text('cc:', mL, y)
    const ccItems = ['Managing Director', 'Deputy Managing Director', 'HR Leave Office', 'File']
    ccItems.forEach((item, i) => {
      doc.text(item, mL + 10, y + (i * 5))
    })
    y += ccItems.length * 5 + 4

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = pageH - 14
    doc.setDrawColor(0)
    doc.setLineWidth(0.4)
    doc.line(mL, footerY - 4, mR, footerY - 4)
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text(
      'Tel: +233-571-461-114  |  Fax: GA-005-8378  |  Email: info@qccgh.com  |  www.qccgh.com',
      pageW / 2,
      footerY,
      { align: 'center' },
    )

    // ── Output ────────────────────────────────────────────────────────────────
    const pdfBuffer = Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
    const fileName = `Leave_Memo_${staffFullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[v0] Exception in download-memo API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
