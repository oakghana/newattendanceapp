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
  const margin = 20
  const contentWidth = pageWidth - 2 * margin

  // Company Header - LEFT side
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("QUALITY CONTROL COMPANY LTD.", margin, 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("(COCOBOD)", margin, 24)
  doc.text("P. O. BOX M54", margin, 29)
  doc.text("ACCRA", margin, 34)

  // "MEMORANDUM" - RIGHT side
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("MEMORANDUM", pageWidth - margin, 18, { align: "right" })

  // Add QCC Logo on right side under MEMORANDUM
  try {
    const logoResponse = await fetch("/logos/qcc-logo.png")
    const logoBlob = await logoResponse.blob()
    const logoUrl = URL.createObjectURL(logoBlob)
    const logoSize = 18
    doc.addImage(logoUrl, "PNG", pageWidth - margin - logoSize, 22, logoSize, logoSize)
  } catch (err) {
    console.warn("Could not load logo:", err)
  }

  // DATE under logo on right
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`DATE: ${memoData.date}`, pageWidth - margin, 46, { align: "right" })

  // Vertical divider line in middle
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(pageWidth / 2 + 10, 14, pageWidth / 2 + 10, 38)

  // REF. NO on left
  let yPos = 46
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`REF. NO: ${memoData.refNo || "QCC/"}`, margin, yPos)

  yPos += 8

  // Horizontal divider line
  doc.setDrawColor(0)
  doc.setLineWidth(0.7)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10

  // TO, FROM, SUBJECT
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("TO:", margin, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(memoData.to, margin + 25, yPos)
  yPos += 7

  doc.setFont("helvetica", "bold")
  doc.text("FROM:", margin, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(memoData.from, margin + 25, yPos)
  yPos += 7

  doc.setFont("helvetica", "bold")
  doc.text("SUBJECT:", margin, yPos)
  doc.setFont("helvetica", "normal")
  const subjectLines = doc.splitTextToSize(memoData.subject, contentWidth - 35)
  subjectLines.forEach((line: string, idx: number) => {
    doc.text(line, margin + 30, yPos + idx * 5)
  })
  yPos += subjectLines.length * 5 + 5

  // Divider
  doc.setLineWidth(0.5)
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
  bodyLines.forEach((line: string, idx: number) => {
    if (yPos > pageHeight - margin - 50) {
      doc.addPage()
      yPos = margin
    }
    doc.text(line, margin, yPos)
    yPos += 5
  })

  yPos += 5

  // Staff list table if provided AND <= 6 staff
  if (memoData.staffList && memoData.staffList.length > 0 && !hasAttachment) {
    if (yPos > pageHeight - margin - 80) {
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
      styles: { 
        fontSize: 9, 
        halign: "left",
        cellPadding: 3,
        lineColor: [100, 100, 100],
        lineWidth: 0.5,
      },
      headStyles: { 
        fillColor: [79, 39, 15], // Brown color matching templates
        textColor: [255, 255, 255], 
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { halign: "center" }, // N
        2: { halign: "center" }, // S/NO
        5: { halign: "center" }, // LEAVE DATE
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 10
  }

  // Request and closing text
  if (yPos > pageHeight - margin - 50) {
    doc.addPage()
    yPos = margin
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("We, therefore, kindly request you to pay their leave allowances accordingly.", margin, yPos)
  yPos += 7
  doc.text("We count on your co-operation.", margin, yPos)
  yPos += 15

  // Signature line
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(margin, yPos, margin + 50, yPos)
  yPos += 5

  // Signature block - using dynamic signatory
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(memoData.signatory.name, margin, yPos)
  yPos += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(memoData.signatory.title, margin, yPos)

  // CC list with line separator
  if (memoData.ccList && memoData.ccList.length > 0) {
    yPos += 15
    doc.setDrawColor(0)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("CC:", margin, yPos)
    doc.setFont("helvetica", "normal")
    memoData.ccList.forEach((cc, idx) => {
      doc.text(cc, margin + 20, yPos + (idx * 5))
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
