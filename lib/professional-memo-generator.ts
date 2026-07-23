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
    signature_image_url?: string // Signer's saved signature image URL from approval_signature_registry
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

/** Format a date as "23rd July, 2026" */
function fmtDateOrdinal(d: string | null | undefined): string {
  if (!d) return "N/A"
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  const day = dt.getDate()
  const suffix =
    day === 1 || day === 21 || day === 31 ? "st"
    : day === 2 || day === 22 ? "nd"
    : day === 3 || day === 23 ? "rd"
    : "th"
  const month = dt.toLocaleDateString("en-GH", { month: "long" })
  return `${day}${suffix} ${month}, ${dt.getFullYear()}`
}

/** Format a date as "20th July, 2026" (long form for table) */
function fmtDateLongPdf(d: string | null | undefined): string {
  return fmtDateOrdinal(d)
}

/**
 * Generate the main memo following official QCC/COCOBOD leave advice format.
 * Layout mirrors the PDF: letterhead (org left, logo right), ref+date block,
 * addressee, THRO, subject underlined, body paragraph, leave table,
 * resume date, closing, signature block, CC, footer.
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

  // ── Load QCC Logo ──────────────────────────────────────────────────────────
  let logoDataUrl: string | null = null
  try {
    const logoResponse = await fetch("/logos/qcc-logo.png")
    if (logoResponse.ok) {
      const logoBlob = await logoResponse.blob()
      const arrayBuffer = await logoBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      let binary = ""
      for (let i = 0; i < uint8Array.length; i++) binary += String.fromCharCode(uint8Array[i])
      logoDataUrl = `data:image/png;base64,${btoa(binary)}`
    }
  } catch {
    // logo optional
  }

  // ── Header: Org text LEFT, Logo RIGHT ─────────────────────────────────────
  const logoSize = 28 // mm square
  const logoX = pageWidth - margin - logoSize
  const logoY = 12

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("QUALITY CONTROL COMPANY LTD.", margin, 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("(COCOBOD)", margin, 24)
  doc.text("P.O. Box M54", margin, 29)
  doc.text("Accra", margin, 34)
  doc.text("Ghana", margin, 39)

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize)
  }

  let yPos = Math.max(44, logoY + logoSize + 2)

  // ── Ref + Date block ───────────────────────────────────────────────────────
  doc.setFontSize(9)
  const today = fmtDateOrdinal(new Date().toISOString())
  doc.text(`Our Ref No:  ${memoData.refNo || "QCC/HRD/AL/" + new Date().getFullYear() + "/"}`, margin, yPos)
  doc.text(`Date:  ${memoData.date || today}`, pageWidth - margin, yPos, { align: "right" })
  yPos += 5
  doc.text("Your Ref No:  ____________________________", margin, yPos)

  // Thin rule
  yPos += 5
  doc.setDrawColor(150)
  doc.setLineWidth(0.3)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 6

  // ── Addressee block ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  // "to" field should contain "STAFFNAME  (S/NO.:  SERIALNO)"
  doc.text(memoData.to.toUpperCase(), margin, yPos)
  yPos += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  // "from" acts as position / department line in the QCC format
  if (memoData.from) {
    const fromLines = doc.splitTextToSize(memoData.from.toUpperCase(), contentWidth)
    fromLines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 4.5 })
  }
  yPos += 3

  // ── THRO block ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("THRO: ARCHIVE HEAD", margin, yPos)
  yPos += 4.5
  doc.text("QUALITY CONTROL COMPANY LIMITED", margin + 12, yPos)
  yPos += 4.5
  doc.setFont("helvetica", "normal")
  doc.text((memoData.from || "").toUpperCase(), margin + 12, yPos)
  yPos += 8

  // ── Subject (bold + underline) ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  const subjectText = memoData.subject.toUpperCase()
  const subjectLines = doc.splitTextToSize(subjectText, contentWidth)
  subjectLines.forEach((line: string, i: number) => {
    doc.text(line, margin, yPos)
    // underline
    const textW = doc.getTextWidth(line)
    doc.setDrawColor(0)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos + 1, margin + textW, yPos + 1)
    yPos += i < subjectLines.length - 1 ? 6 : 8
  })

  // ── Body paragraphs ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)

  // Split body into paragraphs by double newline
  const paragraphs = memoData.body
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, " ").trim())
    .filter(Boolean)

  // Determine which paragraphs are "opening" (before table) vs "closing" (after)
  // Convention: last paragraph is closing ("We wish you a pleasant...")
  const closingMarkers = ["We wish you", "pleasant", "relaxing vacation", "resume duty"]
  const closingIdx = paragraphs.findIndex(p => closingMarkers.some(m => p.includes(m)))
  const openingParagraphs = closingIdx >= 0 ? paragraphs.slice(0, closingIdx) : paragraphs
  const closingParagraphs = closingIdx >= 0 ? paragraphs.slice(closingIdx) : []

  // Resume date paragraph
  const resumeMarkers = ["resume duty", "resume on", "return to work"]
  const resumeIdx = paragraphs.findIndex(p => resumeMarkers.some(m => p.toLowerCase().includes(m)))
  const openingOnly = resumeIdx >= 0
    ? paragraphs.slice(0, Math.min(closingIdx >= 0 ? closingIdx : Infinity, resumeIdx))
    : openingParagraphs
  const resumeParagraph = resumeIdx >= 0 ? paragraphs[resumeIdx] : null
  const closingOnly = closingIdx >= 0 && closingIdx !== resumeIdx
    ? paragraphs.filter((_, i) => i !== resumeIdx && i >= closingIdx)
    : closingParagraphs.filter((_, i) => i !== resumeIdx - (closingIdx >= 0 ? closingIdx : 0))

  const renderParagraphs = (paras: string[]) => {
    paras.forEach(p => {
      if (yPos > pageHeight - margin - 50) { doc.addPage(); yPos = margin }
      const lines = doc.splitTextToSize(p, contentWidth)
      lines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 5 })
      yPos += 2
    })
  }

  renderParagraphs(openingOnly)
  yPos += 2

  // ── Leave details table ────────────────────────────────────────────────────
  if (memoData.staffList && memoData.staffList.length > 0 && !hasAttachment) {
    // Individual staff leave table (payment/group memos)
    const tableData = memoData.staffList.map(staff => [
      String(staff.no),
      staff.name,
      staff.employeeId,
      staff.position,
      staff.department,
      staff.leaveDate,
    ])
    autoTable(doc, {
      startY: yPos,
      head: [["NO", "NAME", "S/NO", "POSITION", "DEPARTMENT", "LEAVE DATE"]],
      body: tableData,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8.5, halign: "left", cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.3 },
      headStyles: { fillColor: [60, 40, 10], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 8 },
      columnStyles: { 0: { halign: "center" }, 2: { halign: "center" }, 5: { halign: "center" } },
    })
    yPos = (doc as any).lastAutoTable.finalY + 6
  } else if (!hasAttachment) {
    // ── Individual annual leave table (QCC format) ─────────────────────────
    // Parse days/dates from body or memoData fields
    // Table: Entitled | Granted | From | To | Remarks
    const tableHeaders = [
      ["Number of Days\nEntitled", "Number of Days\nGranted", "From", "To", "Remarks"]
    ]

    // Try to extract values — best effort from memo body
    const entitledMatch = memoData.body.match(/(\d+)(?:\s+plus\s+(\d+)\s+travel[a-z]* days?)?/i)
    const entitled = entitledMatch ? entitledMatch[1] + (entitledMatch[2] ? ` plus ${entitledMatch[2]} travelling days` : "") : "—"
    const grantedMatch = memoData.body.match(/\bgranted.*?(\d+)\b/i)
    const granted = grantedMatch ? grantedMatch[1] : "—"

    // Try to extract from/to from templateData hints in body
    const fromMatch = memoData.body.match(/(?:from|start)\s+(\d{1,2}[a-z]{0,2}\s+\w+\s+\d{4})/i)
    const toMatch = memoData.body.match(/(?:to|end|until)\s+(\d{1,2}[a-z]{0,2}\s+\w+\s+\d{4})/i)
    const fromDate = fromMatch ? fromMatch[1] : "—"
    const toDate = toMatch ? toMatch[1] : "—"

    const travelMatch = memoData.body.match(/(\d+)\s+travel[a-z]* day/i)
    const remarks = travelMatch ? `${travelMatch[1]} travelling day(s) added` : "—"

    autoTable(doc, {
      startY: yPos,
      head: tableHeaders,
      body: [
        [entitled, granted, fromDate, toDate, remarks],
        ["", granted, "", "", ""],
      ],
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8.5, halign: "left", cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.3 },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", fontSize: 8, lineColor: [180, 180, 180] },
      bodyStyles: { valign: "middle" },
    })
    yPos = (doc as any).lastAutoTable.finalY + 6
  }

  if (hasAttachment && memoData.staffList) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    const attachNote = `Please find attached a list of ${memoData.staffList.length} staff members.`
    const aLines = doc.splitTextToSize(attachNote, contentWidth)
    aLines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 5 })
    yPos += 2
  }

  // ── Resume date paragraph ──────────────────────────────────────────────────
  if (resumeParagraph) {
    if (yPos > pageHeight - margin - 50) { doc.addPage(); yPos = margin }
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    const rLines = doc.splitTextToSize(resumeParagraph, contentWidth)
    rLines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 5 })
    yPos += 2
  }

  // ── Closing paragraph ──────────────────────────────────────────────────────
  renderParagraphs(closingOnly)

  // ── Signature block ────────────────────────────────────────────────────────
  if (yPos > pageHeight - margin - 44) { doc.addPage(); yPos = margin }
  yPos += 6

  // Signature image (data URL)
  if (memoData.signatory.signature_image_url) {
    try {
      const sigUrl = memoData.signatory.signature_image_url
      if (sigUrl.startsWith("data:image/")) {
        const b64Match = sigUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
        if (b64Match) {
          const imageType = b64Match[1].toUpperCase() === "JPEG" ? "JPEG" : "PNG"
          doc.addImage(sigUrl, imageType, margin, yPos - 4, 44, 16)
          yPos += 14
        }
      } else if (sigUrl.startsWith("http")) {
        try {
          const sr = await fetch(sigUrl, { headers: { Accept: "image/*" } })
          if (sr.ok) {
            const sb = await sr.blob()
            const ab = await sb.arrayBuffer()
            const ua = new Uint8Array(ab)
            let bin = ""; for (let i = 0; i < ua.length; i++) bin += String.fromCharCode(ua[i])
            const b64 = btoa(bin)
            const ct = sr.headers.get("content-type") || "image/png"
            const it = ct.includes("jpeg") || ct.includes("jpg") ? "JPEG" : "PNG"
            doc.addImage(`data:${ct};base64,${b64}`, it, margin, yPos - 4, 44, 16)
            yPos += 14
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Signature underline
  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.line(margin, yPos, margin + 70, yPos)
  yPos += 5

  // Signer name + title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.text(memoData.signatory.name.toUpperCase(), margin, yPos)
  yPos += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(memoData.signatory.title.toUpperCase(), margin, yPos)
  yPos += 5
  doc.text("FOR: MANAGING DIRECTOR", margin, yPos)

  // ── CC list ────────────────────────────────────────────────────────────────
  if (memoData.ccList && memoData.ccList.length > 0) {
    yPos += 10
    if (yPos > pageHeight - margin - 20) { doc.addPage(); yPos = margin }
    doc.setDrawColor(150)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 5
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("cc:", margin, yPos)
    doc.setFont("helvetica", "normal")
    const ccText = memoData.ccList.join(", ")
    const ccLines = doc.splitTextToSize(ccText, contentWidth - 12)
    ccLines.forEach((line: string, i: number) => {
      doc.text(line, margin + 12, yPos + i * 4.5)
    })
    yPos += ccLines.length * 4.5
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = pageHeight - 10
  doc.setDrawColor(150)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(120)
  doc.text(
    "Tel: +233-571-461-114  |  +233-571-461-113  |  Fax: GA-105-8378  |  Email: info@qccgh.com  |  www.qccgh.com",
    pageWidth / 2,
    footerY,
    { align: "center" }
  )
  doc.setTextColor(0)

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
