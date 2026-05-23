import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"

export interface MemoData {
  to: string
  from: string
  subject: string
  date: string
  refNo: string
  body: string
  staffList?: Array<{
    no: number
    name: string
    employeeId: string
    position: string
    department: string
    leaveDate: string
  }>
  signatory: string
  signatoryTitle: string
  ccList?: string[]
  memoType: "payment" | "deferment" | "general"
}

/**
 * Generate professional memo PDF with QCC logo
 */
export async function generateProfessionalMemoPDF(
  memoData: MemoData,
  fileName: string
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  // Add QCC Logo (top center)
  try {
    const logoResponse = await fetch("/logos/qcc-logo.png")
    const logoBlob = await logoResponse.blob()
    const logoUrl = URL.createObjectURL(logoBlob)
    const logoSize = 25
    doc.addImage(logoUrl, "PNG", (pageWidth - logoSize) / 2, 10, logoSize, logoSize)
  } catch (err) {
    console.warn("Could not load logo:", err)
  }

  // Company Header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("QUALITY CONTROL COMPANY LIMITED", pageWidth / 2, 42, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("(GHANA COCOA BOARD)", pageWidth / 2, 47, { align: "center" })
  doc.text("P.O. BOX M54, ACCRA", pageWidth / 2, 51, { align: "center" })

  // Divider line
  doc.setDrawColor(0)
  doc.line(margin, 55, pageWidth - margin, 55)

  // Memo type header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  const memoTypeText = getMemoTypeText(memoData.memoType)
  doc.text(memoTypeText, pageWidth / 2, 62, { align: "center" })

  // REF NO and DATE in two columns
  let yPos = 70
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("REF. NO:", margin, yPos)
  doc.text(memoData.refNo || "QCC/", margin + 40, yPos)
  doc.text("DATE:", pageWidth / 2, yPos)
  doc.text(memoData.date, pageWidth / 2 + 20, yPos)

  // Divider
  doc.line(margin, yPos + 5, pageWidth - margin, yPos + 5)
  yPos += 12

  // TO, FROM, SUBJECT
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("TO:", margin, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(memoData.to, margin + 15, yPos)
  yPos += 7

  doc.setFont("helvetica", "bold")
  doc.text("FROM:", margin, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(memoData.from, margin + 15, yPos)
  yPos += 7

  doc.setFont("helvetica", "bold")
  doc.text("SUBJECT:", margin, yPos)
  doc.setFont("helvetica", "normal")
  const subjectLines = doc.splitTextToSize(memoData.subject, contentWidth - 30)
  subjectLines.forEach((line: string, idx: number) => {
    doc.text(line, margin + 25, yPos + idx * 5)
  })
  yPos += subjectLines.length * 5 + 5

  // Divider
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 8

  // Main body text
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const bodyLines = doc.splitTextToSize(memoData.body, contentWidth)
  bodyLines.forEach((line: string) => {
    if (yPos > pageHeight - margin - 30) {
      doc.addPage()
      yPos = margin
    }
    doc.text(line, margin, yPos)
    yPos += 5
  })

  // Staff list table if provided
  if (memoData.staffList && memoData.staffList.length > 0) {
    yPos += 5

    if (yPos > pageHeight - margin - 60) {
      doc.addPage()
      yPos = margin
    }

    const tableData = memoData.staffList.map((staff) => [
      String(staff.no),
      staff.name,
      staff.employeeId,
      staff.position,
      staff.department,
      staff.leaveDate,
    ])

    autoTable(doc, {
      startY: yPos,
      head: [["N", "NAME", "S/NO", "POSITION", "DEPARTMENT", "LEAVE DATE"]],
      body: tableData,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 9, halign: "center" },
      headStyles: { fillColor: [79, 39, 15], textColor: [255, 255, 255], fontStyle: "bold" },
    })

    yPos = (doc as any).lastAutoTable.finalY + 10
  }

  // Closing statement
  if (yPos > pageHeight - margin - 40) {
    doc.addPage()
    yPos = margin
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const closingText = "We count on your co-operation."
  doc.text(closingText, margin, yPos)
  yPos += 12

  // Signature block
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(memoData.signatory, margin, yPos)
  yPos += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(memoData.signatoryTitle, margin, yPos)
  yPos += 5
  doc.text("FOR: MANAGING DIRECTOR", margin, yPos)

  // CC list
  if (memoData.ccList && memoData.ccList.length > 0) {
    yPos += 8
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("cc:", margin, yPos)
    doc.setFont("helvetica", "normal")
    memoData.ccList.forEach((cc, idx) => {
      doc.text(cc, margin + 5, yPos + (idx + 1) * 4)
    })
  }

  // Save and return blob
  const pdf = doc.output("blob")
  return pdf
}

function getMemoTypeText(memoType: string): string {
  switch (memoType) {
    case "payment":
      return "PAYMENT OF LEAVE ALLOWANCE - MEMO"
    case "deferment":
      return "LEAVE DEFERMENT - MEMO"
    default:
      return "MEMORANDUM"
  }
}

/**
 * Download PDF memo
 */
export async function downloadMemoPDF(pdf: Blob, fileName: string) {
  const url = URL.createObjectURL(pdf)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
