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

    // Generate PDF using jsPDF with professional corporate letterhead
    const pdf = new jsPDF()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    let yPosition = 12

    // ── COMPANY LETTERHEAD (Professional) ──────────────────────────────────
    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('QCC ATTENDANCE MANAGEMENT SYSTEM', pageWidth / 2, yPosition, { align: 'center' } as any)
    yPosition += 5

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Human Resources Department', pageWidth / 2, yPosition, { align: 'center' } as any)
    yPosition += 10

    // Thick divider line
    pdf.setDrawColor(0)
    pdf.setLineWidth(1)
    pdf.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 10

    // ── REFERENCE NUMBERS AND DATE ──────────────────────────────────────────
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Our Ref No: MEMO/HR/2026', 20, yPosition)
    pdf.text(`Date: ${memoDate}`, pageWidth - 20, yPosition, { align: 'right' } as any)
    yPosition += 7

    pdf.text('Your Ref No: _______________', 20, yPosition)
    yPosition += 12

    // ── RECIPIENT DETAILS ──────────────────────────────────────────────────
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${staffName.toUpperCase()} (S.NO: ${employeeId})`, 20, yPosition)
    yPosition += 5
    pdf.text(leaveType.toUpperCase() + ' ' + department.toUpperCase(), 20, yPosition)
    yPosition += 5
    pdf.text(department || 'N/A', 20, yPosition)
    yPosition += 12

    // ── TO/FROM/RE SECTION ──────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text('THRO:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    pdf.text('THE HUMAN RESOURCE MANAGER', 28, yPosition)
    yPosition += 5
    pdf.text(`${department || 'THE ORGANIZATION'}`, 28, yPosition)
    yPosition += 12

    // ── LEAVE TYPE HEADING ──────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text(`${leaveType.toUpperCase()} LEAVE`, 20, yPosition)
    yPosition += 12

    // ── BODY TEXT - APPROVAL NOTIFICATION ──────────────────────────────────
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    
    const mainText = `We acknowledge receipt of your leave letter dated ${memoDate} in relation to the above mentioned subject and wish to inform you that Management has given approval for you to proceed on ${daysRequested} working day${daysRequested !== 1 ? 's' : ''} ${leaveType.toLowerCase()} leave with effect from ${startDate} to ${endDate}.`
    const splitMain = pdf.splitTextToSize(mainText, pageWidth - 40)
    pdf.text(splitMain, 20, yPosition)
    yPosition += splitMain.length * 4.5 + 6

    // Resume duty text
    const resumeText = `You are expected to resume duty on the next working day after your leave period ends.`
    const splitResume = pdf.splitTextToSize(resumeText, pageWidth - 40)
    pdf.text(splitResume, 20, yPosition)
    yPosition += splitResume.length * 4.5 + 6

    // Adjustment details
    pdf.text(`Adjustment Details: ${daysRequested} working day${daysRequested !== 1 ? 's' : ''}`, 20, yPosition)
    yPosition += 8

    // Cooperation text
    pdf.text('You can count on our co-operation.', 20, yPosition)
    yPosition += 14

    // ── SIGNATURE SECTION ──────────────────────────────────────────────────
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('_________________________', 20, yPosition)
    yPosition += 10

    pdf.setFont('helvetica', 'bold')
    pdf.text('HR MANAGER', 20, yPosition)
    yPosition += 4
    
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${signerName}`, 20, yPosition)
    yPosition += 8

    // ── APPROVAL STAMP ──────────────────────────────────────────────────────
    pdf.setDrawColor(0, 128, 0)
    pdf.setFillColor(144, 238, 144)
    pdf.rect(20, yPosition, 140, 10, 'FD')
    
    pdf.setTextColor(0, 128, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('✓  H R  A P P R O V E D  &  S I G N E D', 90, yPosition + 6.5, { align: 'center' } as any)

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
