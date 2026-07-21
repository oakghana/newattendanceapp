import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { jsPDF } from 'jspdf'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    const requestId = request.nextUrl.searchParams.get('request_id')

    if (!requestId) {
      return NextResponse.json({ error: 'request_id parameter required' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Fetch leave request
    const { data: leaveRequest, error: leaveError } = await admin
      .from('leave_plan_requests')
      .select('id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status, created_at')
      .eq('id', requestId)
      .single()

    if (leaveError || !leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    if (leaveRequest.status !== 'hr_approved') {
      return NextResponse.json({ error: 'Leave request is not HR approved' }, { status: 403 })
    }

    // Fetch user profile
    const { data: userProfile } = await admin
      .from('user_profiles')
      .select('first_name, last_name, employee_id, department_id, position')
      .eq('id', leaveRequest.user_id)
      .single()

    // Resolve department name
    let departmentName = 'N/A'
    let departmentCode = ''
    if (userProfile?.department_id) {
      const { data: dept } = await admin
        .from('departments')
        .select('name, code')
        .eq('id', userProfile.department_id)
        .single()
      if (dept) {
        departmentName = dept.name || 'N/A'
        departmentCode = dept.code || ''
      }
    }

    // Fetch memo record (optional — graceful fallback)
    const { data: memo } = await admin
      .from('leave_payment_memos')
      .select('signer_name, leave_period_start, leave_period_end, approved_days, created_at')
      .eq('leave_plan_request_id', requestId)
      .single()

    // Build all display values
    const staffName = userProfile
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
      : 'Unknown'
    const employeeId = userProfile?.employee_id || 'N/A'
    const position = userProfile?.position || ''
    const leaveType = leaveRequest.leave_type_key
      ? leaveRequest.leave_type_key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Annual'

    const approvedDays = memo?.approved_days || leaveRequest.requested_days || 0
    const startDateRaw = memo?.leave_period_start || leaveRequest.preferred_start_date
    const endDateRaw = memo?.leave_period_end || leaveRequest.preferred_end_date
    // Resolve signer: use memo signer → look up the HR user who approved → fallback
    let signerName = memo?.signer_name || ''
    if (!signerName) {
      // Try to get the logged-in HR user's name as the signer
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      if (sessionUser) {
        const { data: hrProfile } = await admin
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('id', sessionUser.id)
          .single()
        if (hrProfile) {
          signerName = `${hrProfile.first_name || ''} ${hrProfile.last_name || ''}`.trim()
        }
      }
    }
    if (!signerName) signerName = 'HR Executive'
    const letterDate = memo?.created_at || leaveRequest.created_at || new Date().toISOString()

    const fmtDate = (raw: string) =>
      new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const fmtDateShort = (raw: string) =>
      new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    const startDate = fmtDate(startDateRaw)
    const endDate = fmtDate(endDateRaw)
    const letterDateStr = fmtDate(letterDate)

    // Compute resume duty date (day after end date)
    const resumeDate = new Date(endDateRaw)
    resumeDate.setDate(resumeDate.getDate() + 1)
    // Skip to Monday if it falls on weekend
    if (resumeDate.getDay() === 6) resumeDate.setDate(resumeDate.getDate() + 2)
    if (resumeDate.getDay() === 0) resumeDate.setDate(resumeDate.getDate() + 1)
    const resumeDateStr = resumeDate.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })

    // Generate ref number from request id suffix
    const refSuffix = requestId.split('-').pop()?.toUpperCase().slice(0, 6) || 'MEMO'
    const refNumber = `QCC/HRD/CSL/2026/${refSuffix}`

    // ── BUILD PDF ───────────────────────────────────────────────────────────
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = pdf.internal.pageSize.getWidth()   // 210
    const H = pdf.internal.pageSize.getHeight()  // 297
    const marginL = 20
    const marginR = W - 20
    let y = 15

    // ── HEADER: company name + address block ────────────────────────────────
    // Left: QCC logo
    try {
      const logoPath = path.join(process.cwd(), 'public', 'qcc-logo.png')
      const logoData = fs.readFileSync(logoPath)
      const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`
      // Logo: 22mm wide × 15mm tall, positioned at left margin
      pdf.addImage(logoBase64, 'PNG', marginL, y, 22, 15)
    } catch {
      // Fallback: draw a simple circle placeholder if logo file missing
      pdf.setDrawColor(120)
      pdf.setLineWidth(0.3)
      pdf.circle(marginL + 8, y + 8, 8)
    }

    // Company name (centered, bold)
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text('QUALITY CONTROL COMPANY LTD.', W / 2, y + 4, { align: 'center' } as any)
    pdf.setFontSize(11)
    pdf.text('(COCOBOD)', W / 2, y + 10, { align: 'center' } as any)

    // Right: address
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(80)
    pdf.text('P.O. Box M54', marginR, y + 3, { align: 'right' } as any)
    pdf.text('Accra', marginR, y + 7, { align: 'right' } as any)
    pdf.text('Ghana', marginR, y + 11, { align: 'right' } as any)

    y += 20

    // ── DIVIDER: green top, black bottom ───────────────────────────────────
    pdf.setDrawColor(0, 128, 0)
    pdf.setLineWidth(1.5)
    pdf.line(marginL, y, marginR, y)
    y += 1
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.5)
    pdf.line(marginL, y, marginR, y)
    y += 8

    // ── REF + DATE ROW ──────────────────────────────────────────────────────
    pdf.setTextColor(0, 100, 0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.text(`Our Ref No:  ${refNumber}`, marginL, y)
    pdf.setTextColor(0)
    pdf.text(`Date: ${letterDateStr}`, marginR, y, { align: 'right' } as any)
    y += 5
    pdf.setTextColor(0, 100, 0)
    pdf.text('Your Ref No: _____________________', marginL, y)
    pdf.setTextColor(0)
    y += 10

    // ── RECIPIENT BLOCK ────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text(`${staffName.toUpperCase()}  (S/NO.:  ${employeeId})`, marginL, y)
    y += 5
    pdf.setTextColor(0, 100, 0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.text(position.toUpperCase(), marginL, y)
    y += 5
    pdf.text(departmentName.toUpperCase(), marginL, y)
    y += 9

    // ── THRO SECTION ───────────────────────────────────────────────────────
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.text('THRO:', marginL, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 100, 0)
    pdf.text(`THE ${departmentCode ? departmentCode.toUpperCase() + ' ' : ''}MANAGER`, marginL + 14, y)
    y += 5
    pdf.text('QUALITY CONTROL COMPANY LIMITED', marginL + 14, y)
    y += 5
    pdf.text(departmentName.toUpperCase(), marginL + 14, y)
    y += 12

    // ── LEAVE TYPE HEADING (underlined) ────────────────────────────────────
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    const heading = `${leaveType.toUpperCase()} LEAVE`
    pdf.text(heading, marginL, y)
    const headingW = pdf.getTextWidth(heading)
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(marginL, y + 1, marginL + headingW, y + 1)
    y += 10

    // ── BODY TEXT ───────────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(0)

    const para1 = `We acknowledge receipt of your letter dated ${fmtDateShort(leaveRequest.created_at || startDateRaw)} in relation to the above-mentioned subject and wish to inform you that Management has given approval for you to proceed on ${approvedDays} working day${approvedDays !== 1 ? 's' : ''} ${leaveType.toLowerCase()} leave with effect from ${startDate} to ${endDate}.`
    const split1 = pdf.splitTextToSize(para1, marginR - marginL)
    pdf.text(split1, marginL, y)
    y += split1.length * 5 + 6

    const para2 = `You are expected to resume duty on ${resumeDateStr}.`
    pdf.text(para2, marginL, y)
    y += 8

    pdf.text(`Adjustment Details: ${approvedDays} working day${approvedDays !== 1 ? 's' : ''} approved`, marginL, y)
    y += 8

    pdf.text('You can count on our co-operation.', marginL, y)
    y += 18

    // ── SIGNATURE BLOCK ────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    // Signature line
    pdf.setDrawColor(150)
    pdf.setLineWidth(0.3)
    pdf.line(marginL, y, marginL + 55, y)
    y += 6

    pdf.setFont('helvetica', 'bold')
    pdf.text(signerName.toUpperCase(), marginL, y)
    y += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 100, 0)
    pdf.text('HUMAN RESOURCE MANAGER', marginL, y)
    y += 5
    pdf.text('FOR: MANAGING DIRECTOR', marginL, y)
    y += 14

    // ── CC LIST ────────────────────────────────────────────────────────────
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text('cc:', marginL, y)
    const ccItems = ['Managing Director', 'Deputy Managing Director', 'HR Leave Office', 'File']
    ccItems.forEach((item, i) => {
      pdf.text(item, marginL + 10, y + i * 4.5)
    })
    y += ccItems.length * 4.5 + 6

    // ── FOOTER LINE + CONTACT ───────────────────────────────────────────────
    const footerY = H - 15
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(marginL, footerY - 4, marginR, footerY - 4)
    pdf.setFontSize(7)
    pdf.setTextColor(80)
    pdf.text(
      `Tel: +233-571-461-114  |  Fax: GA-005-8378  |  Email: info@qccgh.com  |  www.qccgh.com`,
      W / 2,
      footerY,
      { align: 'center' } as any
    )

    // ── OUTPUT ─────────────────────────────────────────────────────────────
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer') as ArrayBuffer)
    const fileName = `Leave_Memo_${staffName.replace(/\s+/g, '_')}_${Date.now()}.pdf`

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
