import jsPDF from "jspdf"
import "canvas"

interface StaffMember {
  name: string
  position: string
  department: string
  employee_id: string
}

interface DefermentMemoData {
  staff: StaffMember
  originalLeaveStart: string
  originalLeaveEnd: string
  deferredStart: string
  deferredEnd: string
  reason: string
  generatedDate: string
  signerName: string
  signerPosition: string
  signatureImageUrl?: string
}

interface RecallMemoData {
  staff: StaffMember
  recallDate: string
  originalLeaveEnd: string
  reason: string
  generatedDate: string
  signerName: string
  signerPosition: string
  signatureImageUrl?: string
}

/**
 * Generate professional deferment memo using same signature system as leave approval memos
 * Uses actual signature images from approval_signature_registry via HR approver profile
 */
export async function generateDefermentMemo(data: DefermentMemoData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  let yPosition = margin

  // Header - Company details
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 6

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("(COCOBOD)", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 6

  doc.setFontSize(8)
  doc.text("Accra, Ghana", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 12

  // Our Ref, Date
  doc.setFontSize(9)
  doc.text(`Our Ref No: COCO/ADMIN/2026/11/001`, margin, yPosition)
  doc.text(`Date: ${data.generatedDate}`, pageWidth - margin - 50, yPosition)
  yPosition += 8

  // Memo title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("LEAVE DEFERMENT MEMORANDUM", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 12

  // TO
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("TO: ", margin, yPosition)
  doc.setFont("helvetica", "normal")
  doc.text("DEPUTY DIRECTOR, FINANCE", margin + 15, yPosition)
  yPosition += 8

  // FROM
  doc.setFont("helvetica", "bold")
  doc.text("FROM: ", margin, yPosition)
  doc.setFont("helvetica", "normal")
  doc.text(data.signerPosition.toUpperCase(), margin + 15, yPosition)
  yPosition += 8

  // SUBJECT
  doc.setFont("helvetica", "bold")
  doc.text("SUBJECT: ", margin, yPosition)
  doc.setFont("helvetica", "normal")
  const subjectLines = doc.splitTextToSize(
    `LEAVE DEFERMENT APPROVAL FOR ${data.staff.name.toUpperCase()}`,
    contentWidth - 25
  )
  doc.text(subjectLines, margin + 20, yPosition)
  yPosition += subjectLines.length * 5 + 4

  // Body text
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  const bodyText = `We hereby inform you that the leave originally scheduled for ${data.originalLeaveStart} to ${data.originalLeaveEnd} for ${data.staff.name} (${data.staff.employee_id}) has been deferred to ${data.deferredStart} to ${data.deferredEnd}.

Reason for deferment: ${data.reason}

Please make necessary adjustments to the leave calendar and payment schedules accordingly.

Thank you for your attention to this matter.`

  const bodyLines = doc.splitTextToSize(bodyText, contentWidth)
  doc.text(bodyLines, margin, yPosition)
  yPosition += bodyLines.length * 5 + 12

  // Signature section
  // Draw line above signature
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, margin + 40, yPosition)
  yPosition += 6

  // Add signature image if available
  if (data.signatureImageUrl) {
    try {
      doc.addImage(data.signatureImageUrl, "PNG", margin, yPosition, 30, 15)
      yPosition += 18
    } catch (error) {
      console.error("[v0] Error adding signature image:", error)
      // Fall back to text signature
      yPosition += 8
    }
  } else {
    yPosition += 8
  }

  // Signer name
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(data.signerName.toUpperCase(), margin, yPosition)
  yPosition += 5

  // Position
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(data.signerPosition.toUpperCase(), margin, yPosition)
  yPosition += 5
  doc.text("FOR: MANAGING DIRECTOR", margin, yPosition)
  yPosition += 10

  // CC list
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.text("cc:", margin, yPosition)
  doc.setFont("helvetica", "normal")
  const ccLines = ["Managing Director", "Deputy Director, HR", "Audit Manager"]
  ccLines.forEach((cc, idx) => {
    doc.text(cc, margin + 8, yPosition + idx * 4)
  })

  return doc
}

/**
 * Generate professional recall memo using same signature system
 */
export async function generateRecallMemo(data: RecallMemoData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  let yPosition = margin

  // Header
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 6

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("(COCOBOD)", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 6

  doc.setFontSize(8)
  doc.text("Accra, Ghana", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 12

  // Our Ref, Date
  doc.setFontSize(9)
  doc.text(`Our Ref No: COCO/ADMIN/2026/11/001`, margin, yPosition)
  doc.text(`Date: ${data.generatedDate}`, pageWidth - margin - 50, yPosition)
  yPosition += 8

  // Memo title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("LEAVE RECALL MEMORANDUM", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 12

  // TO
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("TO: ", margin, yPosition)
  doc.setFont("helvetica", "normal")
  doc.text(data.staff.name.toUpperCase(), margin + 15, yPosition)
  yPosition += 8

  // FROM
  doc.setFont("helvetica", "bold")
  doc.text("FROM: ", margin, yPosition)
  doc.setFont("helvetica", "normal")
  doc.text(data.signerPosition.toUpperCase(), margin + 15, yPosition)
  yPosition += 8

  // SUBJECT
  doc.setFont("helvetica", "bold")
  doc.text("SUBJECT: ", margin, yPosition)
  doc.setFont("helvetica", "normal")
  const subjectLines = doc.splitTextToSize(
    `LEAVE RECALL - URGENT RETURN TO DUTY`,
    contentWidth - 25
  )
  doc.text(subjectLines, margin + 20, yPosition)
  yPosition += subjectLines.length * 5 + 4

  // Body text
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  const bodyText = `You are hereby recalled from your leave of absence, effective immediately. You are required to return to duty on ${data.recallDate}.

This recall is necessary due to: ${data.reason}

Your cooperation in this matter is highly appreciated. Please acknowledge receipt of this memorandum and confirm your return to duty date.`

  const bodyLines = doc.splitTextToSize(bodyText, contentWidth)
  doc.text(bodyLines, margin, yPosition)
  yPosition += bodyLines.length * 5 + 12

  // Signature section
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, margin + 40, yPosition)
  yPosition += 6

  if (data.signatureImageUrl) {
    try {
      doc.addImage(data.signatureImageUrl, "PNG", margin, yPosition, 30, 15)
      yPosition += 18
    } catch (error) {
      console.error("[v0] Error adding signature image:", error)
      yPosition += 8
    }
  } else {
    yPosition += 8
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(data.signerName.toUpperCase(), margin, yPosition)
  yPosition += 5

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(data.signerPosition.toUpperCase(), margin, yPosition)
  yPosition += 5
  doc.text("FOR: MANAGING DIRECTOR", margin, yPosition)

  return doc
}
