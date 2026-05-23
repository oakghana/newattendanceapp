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
  signatory: {
    name: string
    title: string
  }
  ccList?: string[]
  memoType: "payment" | "deferment" | "general"
}

export interface GeneratedMemo {
  mainPdf: Blob
  attachmentPdf?: Blob
  staffCount?: number
  hasAttachment?: boolean
}

/**
 * Generate professional memo PDF with QCC logo
 * If staff list > 6, creates main memo + separate attachment PDF
 * If staff list <= 6, includes staff in memo table
 */
export async function generateProfessionalMemoPDF(
  memoData: MemoData,
  fileName: string
): Promise<GeneratedMemo> {
  const staffCount = memoData.staffList?.length ?? 0
  const hasAttachment = staffCount > 6
  
  // Generate main memo
  const mainPdf = await generateMainMemo(memoData, fileName, hasAttachment)
  
  // Generate attachment if needed
  let attachmentPdf: Blob | undefined
  if (hasAttachment && memoData.staffList) {
    attachmentPdf = await generateStaffAttachment(memoData.staffList, fileName)
  }
  
  return {
    mainPdf,
    attachmentPdf,
    staffCount,
    hasAttachment,
  }
}

/**
 * Generate the main memo (with inline staff table if <= 6 staff)
 */
async function generateMainMemo(
  memoData: MemoData,
  fileName: string,
  hasAttachment: boolean
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

  // Divider
  doc.setDrawColor(0)
  doc.line(15, 67, pageWidth - 15, 67)

  // REF NO and DATE in two columns
  let yPos = 75
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("REF. NO:", margin, yPos)
  doc.text(memoData.refNo || "QCC/", margin + 40, yPos)
  doc.text("DATE:", pageWidth / 2, yPos)
  doc.text(memoData.date, pageWidth / 2 + 20, yPos)

  yPos += 10

  // Divider
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 8

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
  
  let bodyText = memoData.body
  // If staff > 6, add attachment note
  if (hasAttachment && memoData.staffList) {
    bodyText += `\n\nPlease find attached a list of ${memoData.staffList.length} staff members scheduled for leave.`
  }
  
  const bodyLines = doc.splitTextToSize(bodyText, contentWidth)
  bodyLines.forEach((line: string) => {
    if (yPos > pageHeight - margin - 30) {
      doc.addPage()
      yPos = margin
    }
    doc.text(line, margin, yPos)
    yPos += 5
  })

  // Staff list table if provided AND <= 6 staff
  if (memoData.staffList && memoData.staffList.length > 0 && !hasAttachment) {
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

  // Signature block - using dynamic signatory
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(memoData.signatory.name, margin, yPos)
  yPos += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(memoData.signatory.title, margin, yPos)
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

  return doc.output("blob")
}

/**
 * Generate staff attachment PDF with full list
 */
async function generateStaffAttachment(
  staffList: Array<{
    no: number
    name: string
    employeeId: string
    position: string
    department: string
    leaveDate: string
  }>,
  fileName: string
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15

  // Header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("QUALITY CONTROL COMPANY LIMITED", pageWidth / 2, 20, { align: "center" })
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("STAFF ON LEAVE - ATTACHMENT", pageWidth / 2, 30, { align: "center" })

  // Create table with all staff
  const tableData = staffList.map((staff) => [
    String(staff.no),
    staff.name,
    staff.employeeId,
    staff.position,
    staff.department,
    staff.leaveDate,
  ])

  autoTable(doc, {
    startY: 40,
    head: [["N", "NAME", "S/NO", "POSITION", "DEPARTMENT", "LEAVE DATE"]],
    body: tableData,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 9, halign: "left" },
    columnStyles: {
      0: { halign: "center" }, // N
      2: { halign: "center" }, // S/NO
      5: { halign: "center" }, // LEAVE DATE
    },
    headStyles: { fillColor: [79, 39, 15], textColor: [255, 255, 255], fontStyle: "bold" },
    didDrawPage: (data: any) => {
      // Add page numbers
      const pageCount = doc.internal.pages.length
      const pageSize = doc.internal.pageSize
      const pageHeight = pageSize.getHeight()
      const pageWidth = pageSize.getWidth()
      
      for (let i = 1; i < pageCount; i++) {
        doc.setPage(i)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(
          `Page ${i} of ${pageCount - 1}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        )
      }
    },
  })

  return doc.output("blob")
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
 * Download PDF memo(s) - handles both main memo and optional attachment
 */
export async function downloadMemoPDF(
  memoResult: GeneratedMemo | Blob,
  fileName: string
) {
  // Handle both old Blob format and new GeneratedMemo format
  const isGeneratedMemo = memoResult instanceof Object && "mainPdf" in memoResult

  if (isGeneratedMemo) {
    const memo = memoResult as GeneratedMemo
    
    // Download main memo
    const url = URL.createObjectURL(memo.mainPdf)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName.replace(".pdf", "-memo.pdf")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // Download attachment if exists
    if (memo.attachmentPdf && memo.hasAttachment) {
      // Small delay before downloading attachment
      await new Promise((resolve) => setTimeout(resolve, 500))
      
      const attachUrl = URL.createObjectURL(memo.attachmentPdf)
      const attachLink = document.createElement("a")
      attachLink.href = attachUrl
      attachLink.download = fileName.replace(".pdf", "-attachment.pdf")
      document.body.appendChild(attachLink)
      attachLink.click()
      document.body.removeChild(attachLink)
      URL.revokeObjectURL(attachUrl)
    }
  } else {
    // Legacy format - just download blob
    const url = URL.createObjectURL(memoResult as Blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
