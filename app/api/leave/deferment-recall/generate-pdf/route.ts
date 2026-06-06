import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"
import autoTable from 'jspdf-autotable'

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()

    const body = await request.json()
    const { memo_id, memo_type } = body // 'deferment' or 'recall'

    if (!memo_id || !memo_type) {
      return NextResponse.json(
        { error: "Missing required fields: memo_id, memo_type" },
        { status: 400 }
      )
    }

    let memoData: any = null
    let requestData: any = null
    let staffData: any = null

    if (memo_type === 'deferment') {
      const { data: memo } = await admin
        .from("deferment_memos")
        .select(`
          *,
          staff:user_profiles!deferment_memos_staff_id_fkey(
            first_name, last_name, employee_id, position, department_id,
            departments(name)
          ),
          deferment_request:leave_deferment_requests(
            id, reason, requested_deferment_year, requested_deferment_period
          )
        `)
        .eq("id", memo_id)
        .single()

      memoData = memo
    } else if (memo_type === 'recall') {
      const { data: memo } = await admin
        .from("recall_memos")
        .select(`
          *,
          staff:user_profiles!recall_memos_staff_id_fkey(
            first_name, last_name, employee_id, position, department_id,
            departments(name)
          ),
          recall_request:leave_recall_requests(
            id, recall_reason, recall_date
          )
        `)
        .eq("id", memo_id)
        .single()

      memoData = memo
    } else {
      return NextResponse.json(
        { error: "Invalid memo_type. Must be 'deferment' or 'recall'" },
        { status: 400 }
      )
    }

    if (!memoData) {
      return NextResponse.json({ error: "Memo not found" }, { status: 404 })
    }

    // Create PDF
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let yPosition = 20

    // Header
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text(memo_type === 'deferment' ? 'LEAVE DEFERMENT MEMO' : 'LEAVE RECALL MEMO', pageWidth / 2, yPosition, { align: 'center' })

    yPosition += 15

    // Organization details
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('MINISTRY/OFFICE OF HUMAN RESOURCES', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 5
    doc.text('REPUBLIC OF GHANA', pageWidth / 2, yPosition, { align: 'center' })

    yPosition += 15

    // Memo details table
    const memoDetails: string[][] = [
      ['MEMO ID:', memoData.id.substring(0, 8).toUpperCase()],
      ['DATE:', new Date().toLocaleDateString('en-GB')],
      ['TO:', memoData.staff?.first_name && memoData.staff?.last_name 
        ? `${memoData.staff.first_name} ${memoData.staff.last_name}`
        : 'Staff Member']
    ]

    doc.setFontSize(9)
    let leftX = 20
    let rightX = 110
    let detailY = yPosition
    memoDetails.forEach((row, idx) => {
      doc.text(row[0], leftX, detailY)
      doc.text(row[1], rightX, detailY)
      detailY += 6
    })

    yPosition = detailY + 10

    // Staff Information Section
    doc.setFont(undefined, 'bold')
    doc.text('STAFF INFORMATION', 20, yPosition)
    yPosition += 8

    doc.setFont(undefined, 'normal')
    const staffInfo = [
      ['Staff Name:', `${memoData.staff?.first_name} ${memoData.staff?.last_name}`],
      ['Employee ID:', memoData.staff?.employee_id || 'N/A'],
      ['Position:', memoData.staff?.position || 'N/A'],
      ['Department:', memoData.staff?.departments?.name || 'N/A']
    ]

    staffInfo.forEach(([label, value]) => {
      doc.setFont(undefined, 'bold')
      doc.text(label, 20, yPosition)
      doc.setFont(undefined, 'normal')
      doc.text(value, 60, yPosition)
      yPosition += 6
    })

    yPosition += 5

    // Leave Information
    doc.setFont(undefined, 'bold')
    doc.text('LEAVE INFORMATION', 20, yPosition)
    yPosition += 8

    doc.setFont(undefined, 'normal')
    const leaveInfo = memo_type === 'deferment' 
      ? [
          ['Leave Type:', memoData.memo_body?.leave_type || 'Annual Leave'],
          ['Original Period:', `${new Date(memoData.memo_body?.original_start_date).toLocaleDateString('en-GB')} to ${new Date(memoData.memo_body?.original_end_date).toLocaleDateString('en-GB')}`],
          ['Requested Days:', memoData.memo_body?.requested_days || 'N/A'],
          ['Defer To Year:', memoData.deferment_request?.requested_deferment_year || 'N/A'],
          ['Reason:', memoData.deferment_request?.reason || 'Not provided']
        ]
      : [
          ['Leave Type:', memoData.memo_body?.leave_type || 'Annual Leave'],
          ['Leave Period:', `${new Date(memoData.memo_body?.original_start_date).toLocaleDateString('en-GB')} to ${new Date(memoData.memo_body?.original_end_date).toLocaleDateString('en-GB')}`],
          ['Recall Date:', new Date(memoData.recall_request?.recall_date).toLocaleDateString('en-GB')],
          ['Reason:', memoData.recall_request?.recall_reason || 'Not provided']
        ]

    leaveInfo.forEach(([label, value]) => {
      if (yPosition > pageHeight - 40) {
        doc.addPage()
        yPosition = 20
      }
      doc.setFont(undefined, 'bold')
      doc.text(label, 20, yPosition)
      doc.setFont(undefined, 'normal')
      
      // Word wrap for long values
      const wrapped = doc.splitTextToSize(value, 100)
      doc.text(wrapped, 60, yPosition)
      yPosition += 6 * wrapped.length
    })

    yPosition += 10

    // Decision Section
    doc.setFont(undefined, 'bold')
    doc.text('APPROVAL DECISION', 20, yPosition)
    yPosition += 8

    doc.setFont(undefined, 'normal')
    const statusText = memoData.status === 'approved' 
      ? 'This leave request has been APPROVED.'
      : memoData.status === 'rejected'
      ? 'This leave request has been REJECTED.'
      : 'This leave request is PENDING approval.'

    const statusColor = memoData.status === 'approved' 
      ? [34, 139, 34]  // Green
      : memoData.status === 'rejected'
      ? [220, 20, 60]  // Red
      : [255, 165, 0]  // Orange

    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
    doc.setFont(undefined, 'bold')
    doc.text(statusText, 20, yPosition)
    doc.setTextColor(0, 0, 0)

    yPosition += 10

    // Approval Notes
    if (memoData.memo_body?.approval_notes) {
      doc.setFont(undefined, 'bold')
      doc.text('APPROVAL NOTES:', 20, yPosition)
      yPosition += 6
      doc.setFont(undefined, 'normal')
      const notesWrapped = doc.splitTextToSize(memoData.memo_body.approval_notes, 170)
      doc.text(notesWrapped, 20, yPosition)
      yPosition += 6 * notesWrapped.length + 5
    }

    // Signature Section
    if (yPosition > pageHeight - 40) {
      doc.addPage()
      yPosition = 20
    }

    yPosition += 10
    doc.setFont(undefined, 'bold')
    doc.text('SIGNED BY:', 20, yPosition)
    yPosition += 8

    doc.setFont(undefined, 'normal')
    doc.text(`Name: ${memoData.signer_name || 'HR Executive'}`, 20, yPosition)
    yPosition += 6
    doc.text(`Position: ${memoData.signer_position || 'N/A'}`, 20, yPosition)
    yPosition += 6
    doc.text(`Date: ${new Date(memoData.generated_at).toLocaleDateString('en-GB')}`, 20, yPosition)

    // Signature line
    yPosition += 15
    doc.setDrawColor(0, 0, 0)
    doc.line(20, yPosition, 60, yPosition)
    yPosition += 3
    doc.setFontSize(8)
    doc.text('Signature', 20, yPosition)

    // Footer
    yPosition = pageHeight - 15
    doc.setFontSize(8)
    doc.setFont(undefined, 'normal')
    doc.text(`Document ID: ${memoData.id}`, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 4
    doc.text(`Generated on: ${new Date().toLocaleString('en-GB')}`, pageWidth / 2, yPosition, { align: 'center' })

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    const filename = `${memo_type}-memo-${memoData.id.substring(0, 8)}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length
      }
    })
  } catch (error) {
    console.error("[v0] Error generating PDF:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 }
    )
  }
}
