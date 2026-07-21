'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { jsPDF } from 'jspdf'

export async function GET(request: NextRequest) {
  try {
    const requestId = request.nextUrl.searchParams.get('request_id')
    
    if (!requestId) {
      return NextResponse.json({ error: 'request_id parameter required' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Find the leave_plan_request by ID
    const { data: leaveRequest, error: leaveError } = await admin
      .from('leave_plan_requests')
      .select('id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status')
      .eq('id', requestId)
      .single()

    if (leaveError || !leaveRequest) {
      console.error('[v0] Error fetching leave request:', leaveError)
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    // Check if it's HR approved
    if (leaveRequest.status !== 'hr_approved') {
      return NextResponse.json({ error: 'Leave request is not HR approved' }, { status: 403 })
    }

    // Fetch user profile for staff name
    const { data: userProfile, error: userError } = await admin
      .from('user_profiles')
      .select('first_name, last_name, employee_id, department_name')
      .eq('id', leaveRequest.user_id)
      .single()

    if (userError) {
      console.error('[v0] Error fetching user profile:', userError)
    }

    // Fetch the corresponding leave_payment_memos record (optional — we can generate without it)
    const { data: memo, error: memoError } = await admin
      .from('leave_payment_memos')
      .select('*')
      .eq('leave_plan_request_id', requestId)
      .single()

    if (memoError && memoError.code !== 'PGRST116') {
      // If it's a real error (not "no rows"), log it
      console.warn('[v0] Warning fetching leave memo:', memoError)
    }

    // Extract data
    const staffName = userProfile
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
      : 'Unknown'
    const employeeId = userProfile?.employee_id || 'N/A'
    const department = userProfile?.department_name || 'N/A'
    const leaveType = leaveRequest.leave_type_key
      ? leaveRequest.leave_type_key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Leave'
    const startDate = new Date(leaveRequest.preferred_start_date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const endDate = new Date(leaveRequest.preferred_end_date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const daysRequested = leaveRequest.requested_days || 0
    // Use memo data if available, otherwise generate reasonable defaults
    const signerName = memo?.signer_name || 'HR Executive'
    const memoDate = memo?.created_at
      ? new Date(memo.created_at).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })

    // Generate PDF using jsPDF with professional letterhead
    const pdf = new jsPDF()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    let yPosition = 15

    // ── COMPANY LETTERHEAD ──────────────────────────────────────────────
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text('QCC ATTENDANCE MANAGEMENT SYSTEM', pageWidth / 2, yPosition, { align: 'center' } as any)
    yPosition += 6

    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Human Resources Department', pageWidth / 2, yPosition, { align: 'center' } as any)
    yPosition += 1
    pdf.setFontSize(9)
    pdf.text('Electronic Attendance System', pageWidth / 2, yPosition, { align: 'center' } as any)
    yPosition += 8

    // Divider line
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.5)
    pdf.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 8

    // Reference and Date on the right
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    pdf.text(`Date: ${currentDate}`, pageWidth - 20, yPosition, { align: 'right' } as any)
    yPosition += 8

    // ── RECIPIENT AND PURPOSE ──────────────────────────────────────────────
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text('TO:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${staffName} (${employeeId})`, 30, yPosition)
    yPosition += 6
    pdf.text(department || 'N/A', 30, yPosition)
    yPosition += 10

    pdf.setFont('helvetica', 'bold')
    pdf.text('RE:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`LEAVE APPROVAL - ${leaveType} LEAVE`, 30, yPosition)
    yPosition += 10

    // ── BODY TEXT ──────────────────────────────────────────────────────────
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    
    const bodyText = `This is to inform you that your leave request for ${leaveType.toLowerCase()} leave from ${startDate} to ${endDate} (${daysRequested} working day${daysRequested !== 1 ? 's' : ''}) has been approved by the Human Resources Department.`
    const splitBody = pdf.splitTextToSize(bodyText, pageWidth - 40)
    pdf.text(splitBody, 20, yPosition)
    yPosition += splitBody.length * 5 + 5

    const detailsText = `Please note that you are expected to resume duty on the next working day after your leave period ends. Any adjustments or amendments to your leave schedule must be communicated to the HR Department immediately.`
    const splitDetails = pdf.splitTextToSize(detailsText, pageWidth - 40)
    pdf.text(splitDetails, 20, yPosition)
    yPosition += splitDetails.length * 5 + 10

    // ── APPROVAL DETAILS ──────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text('Approved Details:', 20, yPosition)
    yPosition += 5

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Leave Type: ${leaveType}`, 25, yPosition)
    yPosition += 4
    pdf.text(`Period: ${startDate} to ${endDate}`, 25, yPosition)
    yPosition += 4
    pdf.text(`Duration: ${daysRequested} day${daysRequested !== 1 ? 's' : ''}`, 25, yPosition)
    yPosition += 4
    pdf.text(`Approved By: ${signerName}`, 25, yPosition)
    yPosition += 4
    pdf.text(`Approval Date: ${memoDate}`, 25, yPosition)
    yPosition += 10

    // ── SIGNATURE SECTION ──────────────────────────────────────────────────
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('_________________________', 20, yPosition)
    yPosition += 5
    pdf.setFont('helvetica', 'bold')
    pdf.text('HR MANAGER', 20, yPosition)
    yPosition += 4
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${signerName}`, 20, yPosition)
    yPosition += 8

    // ── STATUS BADGE ──────────────────────────────────────────────────────
    pdf.setDrawColor(0, 128, 0)
    pdf.setFillColor(200, 255, 200)
    pdf.rect(20, yPosition, 100, 8, 'FD')
    
    pdf.setTextColor(0, 128, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('✓ HR APPROVED & SIGNED', 22, yPosition + 5.5)

    // Get PDF as buffer
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer') as ArrayBuffer)
    const fileName = `Leave_Memo_${staffName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`

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
