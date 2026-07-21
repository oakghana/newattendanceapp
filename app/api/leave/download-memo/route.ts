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

    // Generate PDF using jsPDF
    const pdf = new jsPDF()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    let yPosition = 20

    // Title
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.text('LEAVE APPROVAL MEMO', pageWidth / 2, yPosition, { align: 'center' } as any)
    
    yPosition += 15

    // Divider line
    pdf.setDrawColor(100)
    pdf.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 10

    // Staff Information Section
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('STAFF INFORMATION', 20, yPosition)
    yPosition += 8

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(`Name: ${staffName}`, 25, yPosition)
    yPosition += 7
    pdf.text(`Employee ID: ${employeeId}`, 25, yPosition)
    yPosition += 7
    pdf.text(`Department: ${department}`, 25, yPosition)
    yPosition += 12

    // Leave Details Section
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('LEAVE DETAILS', 20, yPosition)
    yPosition += 8

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(`Leave Type: ${leaveType}`, 25, yPosition)
    yPosition += 7
    pdf.text(`Start Date: ${startDate}`, 25, yPosition)
    yPosition += 7
    pdf.text(`End Date: ${endDate}`, 25, yPosition)
    yPosition += 7
    pdf.text(`Duration: ${daysRequested} day${daysRequested !== 1 ? 's' : ''}`, 25, yPosition)
    yPosition += 12

    // Approval Section
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('APPROVAL INFORMATION', 20, yPosition)
    yPosition += 8

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(`Approved By: ${signerName}`, 25, yPosition)
    yPosition += 7
    pdf.text(`Approval Date: ${memoDate}`, 25, yPosition)
    yPosition += 7
    pdf.setTextColor(0, 128, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Status: HR APPROVED & SIGNED', 25, yPosition)
    
    yPosition = pageHeight - 30
    pdf.setDrawColor(100)
    pdf.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 8

    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const generatedDate = new Date().toLocaleString('en-GB')
    pdf.text(`Generated on: ${generatedDate}`, pageWidth / 2, yPosition, { align: 'center' } as any)

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
