// jsPDF and jspdf-autotable are loaded dynamically inside each function
// to avoid SSR crashes (jsPDF accesses `window` at module initialisation time).
import { calculateAnnualLeaveMemoDates } from "./annual-leave-calculator"
import { resolveEntitlementFromProfile } from "./annual-leave-entitlement"

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
    approved_days?: number
    entitlement_days?: number
    adjusted_entitlement_days?: number
  outstanding_entitlement_days?: number
  outstanding_leave_days?: number
  adjusted_used_days?: number

    outstanding_used_days?: number
    used_this_period?: number
    prior_leave_days_deducted?: number
    travelling_days_added?: number
    leave_period_start?: string
    leave_period_end?: string
    staff_category?: string
    rank?: string
    date_of_appointment?: string
    years_of_service?: number
  }>
  signatory: {
    name: string
    title: string
    signature_image_url?: string // Signer's saved signature image URL from approval_signature_registry
  }
  ccList?: string[]
    adjustment_reason?: string
    leave_type_key?: string
    memoType: "payment" | "deferment" | "general"
}

export function buildMemoRemarks({
  savedReason,
  calculatedRemarks,
}: {
  savedReason?: string | null
  calculatedRemarks: string[]
}): string {
  const reason = String(savedReason || "").trim()
  // Reasons are explanatory text only. When HR supplies one, print it once;
  // never append the generated calculation a second time.
  return reason
    ? reason
    : calculatedRemarks.length > 0
      ? calculatedRemarks.join("; ")
      : "—"
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
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  const autoTable = autoTableMod.default
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - 2 * margin

  // ── Determine memo format ──────────────────────────────────────────────────
  const isPaymentMemo = memoData.memoType === "payment"

  // ── Body helpers ────────────────────────────────────────────────────────────
  const renderParagraphs = (paras: string[]) => {
    paras.forEach(p => {
      if (yPos > pageHeight - margin - 50) { doc.addPage(); yPos = margin }
      const lines = doc.splitTextToSize(p, contentWidth)
      lines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 5 })
      yPos += 2
    })
  }

  const isIndividualLeaveMemo = !memoData.staffList || (memoData.staffList.length === 0)

  let yPos: number

  if (isPaymentMemo) {
    // ══════════════════════════════════════════════════════════════════════════
    // PAYMENT ADVICE — MEMORANDUM FORMAT (Image 4 style)
    // Left: Company block | Right: MEMORANDUM + DATE
    // Then REF. NO, horizontal rule, TO/FROM/SUBJECT, body, TABLE, closing
    // ══════════════════════════════════════════════════════════════════════════

    // Company name block — top left
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("QUALITY CONTROL COMPANY LTD.", margin, 18)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.text("(COCOBOD)", margin, 24)
    doc.text("P. O. BOX M54", margin, 30)
    doc.text("ACCRA", margin, 36)

    // MEMORANDUM — top right with vertical left border bar
    const memoLabelX = pageWidth / 2 + 5
    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.text("MEMORANDUM", memoLabelX, 20)

    // Vertical bar to left of MEMORANDUM label
    doc.setDrawColor(0)
    doc.setLineWidth(1.5)
    doc.line(memoLabelX - 4, 12, memoLabelX - 4, 38)

    // DATE below MEMORANDUM
    const today = fmtDateOrdinal(new Date().toISOString())
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(`DATE:  ${memoData.date || today}`, memoLabelX, 30)

    yPos = 44

    // REF. NO line
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(`REF. NO:  ${memoData.refNo || "QCC/HR/PA/" + new Date().getFullYear() + "/"}`, margin, yPos)
    doc.setFont("helvetica", "normal")
    yPos += 6

    // Horizontal rule — thick black
    doc.setDrawColor(0)
    doc.setLineWidth(0.8)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 8

    // TO: / FROM: / SUBJECT: — tabular, bold labels
    const labelX = margin
    const valueX = margin + 22

    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("TO:", labelX, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(memoData.to.toUpperCase(), valueX, yPos)
    yPos += 7

    doc.setFont("helvetica", "bold")
    doc.text("FROM:", labelX, yPos)
    doc.setFont("helvetica", "normal")
    doc.text((memoData.from || "").toUpperCase(), valueX, yPos)
    yPos += 7

    doc.setFont("helvetica", "bold")
    doc.text("SUBJECT:", labelX, yPos)
    doc.setFont("helvetica", "normal")
    const subjectVal = memoData.subject.toUpperCase()
    const subjectLines2 = doc.splitTextToSize(subjectVal, contentWidth - 25)
    subjectLines2.forEach((line: string, i: number) => {
      doc.text(line, valueX, yPos + i * 5.5)
    })
    yPos += subjectLines2.length * 5.5 + 4

    // Body paragraphs — strip "We count on your co-operation." to place it after the table
    const allParas = memoData.body
      .split(/\n{2,}/)
      .map((p: string) => p.replace(/\n/g, " ").trim())
      .filter(Boolean)
    // Exclude closing markers (they go after the table)
    const closingKeywords = ["We count on your co-operation", "We, therefore, kindly request"]
    const bodyParas = allParas.filter((p: string) => !closingKeywords.some(k => p.includes(k)))
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    renderParagraphs(bodyParas)
    yPos += 2

  } else {
    // ══════════════════════════════════════════════════════════════════════════
    // LEAVE ADVICE / DEFERMENT — Original QCC letterhead format
    // ══════════════════════════════════════════════════════════════════════════

    // Load QCC Logo
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

    const logoSize = 24
    const logoX = margin
    const logoY = 13
    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize)

    // Org name centred
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, 19, { align: "center" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text("(COCOBOD)", pageWidth / 2, 25, { align: "center" })

    // Address right
    doc.setFontSize(8.5)
    doc.text("P.O. Box M54", pageWidth - margin, 15, { align: "right" })
    doc.text("Accra", pageWidth - margin, 20, { align: "right" })
    doc.text("Ghana", pageWidth - margin, 25, { align: "right" })

    yPos = logoY + logoSize + 3

    // Green accent bar
    doc.setFillColor(26, 110, 26)
    doc.rect(margin, yPos, contentWidth, 1.5, "F")
    yPos += 6

    // Ref + Date block — green text
    doc.setFontSize(9)
    doc.setTextColor(26, 110, 26)
    const todayStr = fmtDateOrdinal(new Date().toISOString())
    doc.text(`Our Ref No:  ${memoData.refNo || "QCC/HRD/AL/" + new Date().getFullYear() + "/"}`, margin, yPos)
    doc.setTextColor(0)
    doc.text(`Date:  ${memoData.date || todayStr}`, pageWidth - margin, yPos, { align: "right" })
    yPos += 5

    // Thin rule
    yPos += 5
    doc.setDrawColor(180)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 6

    // TO: / FROM: labels
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text("TO:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(memoData.to.toUpperCase(), margin + 15, yPos)
    yPos += 6

    doc.setFont("helvetica", "bold")
    doc.setTextColor(0)
    doc.text("FROM:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(26, 110, 26)
    if (memoData.from) {
      const fromLines = doc.splitTextToSize(memoData.from.toUpperCase(), contentWidth - 20)
      fromLines.forEach((line: string) => { doc.text(line, margin + 15, yPos); yPos += 4.5 })
    }
    doc.setTextColor(0)
    yPos += 3

    // THRO block — only for individual leave advice memos
    if (memoData.memoType === "general" && isIndividualLeaveMemo) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(0)
      doc.text("THRO:", margin, yPos)
      doc.setTextColor(26, 110, 26)
      doc.text("  THE DEPARTMENT HEAD", margin + 14, yPos)
      yPos += 4.5
      doc.text("QUALITY CONTROL COMPANY LIMITED", margin + 14, yPos)
      yPos += 4.5
      doc.setFont("helvetica", "normal")
      doc.text((memoData.from || "").toUpperCase(), margin + 14, yPos)
      doc.setTextColor(0)
      yPos += 8
    }

    // Subject (bold + underline)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    const subjectText = memoData.subject.toUpperCase()
    const subjectLines = doc.splitTextToSize(subjectText, contentWidth)
    subjectLines.forEach((line: string, i: number) => {
      doc.text(line, margin, yPos)
      const textW = doc.getTextWidth(line)
      doc.setDrawColor(0)
      doc.setLineWidth(0.3)
      doc.line(margin, yPos + 1, margin + textW, yPos + 1)
      yPos += i < subjectLines.length - 1 ? 6 : 8
    })

    // Body paragraphs
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)

    if (isIndividualLeaveMemo) {
      const subjectUpper = (memoData.subject || "").toUpperCase()
      const leaveTypeMatch = subjectUpper.match(/^(.+?)\s+LEAVE ADVICE/)
      const yearMatch = subjectUpper.match(/FOR\s+(.+)$/)
      const leaveTypeName = leaveTypeMatch ? leaveTypeMatch[1].toLowerCase() : "annual"
      const yearLabel = yearMatch ? yearMatch[1] : new Date().getFullYear().toString()
      const openingBody = `In accordance with COCOBOD's vacation leave policy, we wish to inform you that approval has been granted for you to proceed on your ${leaveTypeName} leave in respect of the year January to December ${yearLabel}.`
      const lines = doc.splitTextToSize(openingBody, contentWidth)
      lines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 5 })
      yPos += 4
      doc.text("Your leave details are shown below.", margin, yPos)
      yPos += 8
    } else {
      const paragraphs = memoData.body
        .split(/\n{2,}/)
        .map((p: string) => p.replace(/\n/g, " ").trim())
        .filter(Boolean)
      const closingMarkers = ["We wish you", "pleasant", "relaxing vacation", "resume duty"]
      const closingIdx = paragraphs.findIndex((p: string) => closingMarkers.some(m => p.includes(m)))
      const openingOnly = closingIdx >= 0 ? paragraphs.slice(0, closingIdx) : paragraphs
      renderParagraphs(openingOnly)
      yPos += 2
    }
  }

  // ── Leave details table ────────────────────────────────────────────────────
  if (memoData.staffList && memoData.staffList.length > 0 && !hasAttachment) {
    // Individual staff leave table (payment/group memos)
    // Columns: NO, NAME, S/NO, RANK, STATION, LEAVE DATE — matches official QCC payment advice format
    const tableData = memoData.staffList.map(staff => [
      String(staff.no),
      staff.name,
      staff.employeeId,
      (staff as any).rank || (staff as any).position || staff.department || "",
      (staff as any).station || (staff as any).location_name || (staff as any).assigned_location_name || (staff as any).location || "",
      staff.leaveDate,
    ])
    autoTable(doc, {
      startY: yPos,
      head: [["NO", "NAME", "S/NO", "RANK", "STATION", "LEAVE DATE"]],
      body: tableData,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8, halign: "left", cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.3 },
      headStyles: { fillColor: [60, 40, 10], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 8 },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "center", cellWidth: 22 },
        5: { halign: "center", cellWidth: 22 },
      },
    })
    yPos = (doc as any).lastAutoTable.finalY + 6
  } else if (!hasAttachment) {
    // ── Individual annual leave table (QCC format) ─────��───────────────────
    // Parse days/dates from body or memoData fields
    // Table: Entitled | Granted | From | To | Remarks
    const tableHeaders = [
      ["Number of Days\nEntitled", "Number of Days\nGranted", "From", "To", "Remarks"]
    ]

    // Get days from staffList if available (preferred), otherwise parse from body
    const firstStaff = memoData.staffList?.[0]
    const approvedDays = Number(firstStaff?.approved_days ?? 0)
    const publicHolidayDays = Number(firstStaff?.holiday_days_deducted ?? 0)
    const enjoyedDays = Number(firstStaff?.prior_leave_days_deducted ?? 0)
    const travellingDays = Number(firstStaff?.travelling_days_added ?? 0)
    const outstandingLeaveDays = Math.max(0, Number(firstStaff?.outstanding_leave_days ?? 0))
    const storedEntitlementDays = Number(
      firstStaff?.adjusted_entitlement_days
        ?? firstStaff?.outstanding_entitlement_days
        ?? firstStaff?.entitlement_days
        ?? approvedDays,
    )
    const adjustedUsedDays = Number(
      firstStaff?.adjusted_used_days
        ?? firstStaff?.outstanding_used_days
        ?? firstStaff?.used_this_period
        ?? 0,
    )
    const resolvedEntitlement = resolveEntitlementFromProfile({
      staff_category: firstStaff?.staff_category,
      position: firstStaff?.position,
      rank: firstStaff?.rank,
      date_of_appointment: firstStaff?.date_of_appointment,
      years_of_service: firstStaff?.years_of_service,
    })
    const hasAdjustedEntitlement = firstStaff?.adjusted_entitlement_days != null
      || firstStaff?.outstanding_entitlement_days != null
      || firstStaff?.entitlement_days != null
    const isAnnualLeave = String(memoData.leave_type_key || "").toLowerCase() === "annual"
    const entitlementDays = isAnnualLeave
      ? hasAdjustedEntitlement
        ? storedEntitlementDays
        : resolvedEntitlement.annualLeaveDays + outstandingLeaveDays
      : storedEntitlementDays
    const annualMemoDates = calculateAnnualLeaveMemoDates({
      startDate: firstStaff?.leave_period_start || new Date(),
      entitlementDays,
      grantedDays: approvedDays,
      daysAlreadyEnjoyed: adjustedUsedDays > 0 ? adjustedUsedDays : enjoyedDays || null,
      travellingDays,
    })
    const annualDaysRemaining = Math.max(0, annualMemoDates.entitlementDays - annualMemoDates.daysAlreadyEnjoyed)
    const totalGrantedDays = annualMemoDates.grantedDays

    const entitled = entitlementDays > 0
      ? [
          `${entitlementDays} day${entitlementDays !== 1 ? "s" : ""}`,
          travellingDays > 0 ? `${travellingDays} travelling day${travellingDays !== 1 ? "s" : ""}` : "",
        ].filter(Boolean).join(" plus ")
      : "—"
    const granted = totalGrantedDays > 0
      ? travellingDays > 0
        ? `${totalGrantedDays} (${annualDaysRemaining} annual leave days plus ${travellingDays} travelling days)`
        : String(totalGrantedDays)
      : "—"

    // Try to extract from/to dates from staffList if available
    let fromDate = "—"
    let toDate = "—"
    if (firstStaff?.leave_period_start) {
      const startDate = new Date(firstStaff.leave_period_start)
      fromDate = fmtDateLongPdf(firstStaff.leave_period_start)
    }
    if (firstStaff?.leave_period_end) {
      if (isAnnualLeave && firstStaff.leave_period_start) {
        // Annual leave uses the same inclusive calculation and totals as every memo route.
        toDate = fmtDateLongPdf(annualMemoDates.endDate)
      } else {
        toDate = fmtDateLongPdf(firstStaff.leave_period_end)
      }
    }
    
    // Fallback: Try to extract from/to from templateData hints in body
    if (fromDate === "—") {
      const fromMatch = memoData.body.match(/(?:from|start)\s+(\d{1,2}[a-z]{0,2}\s+\w+\s+\d{4})/i)
      fromDate = fromMatch ? fromMatch[1] : "—"
    }
    if (toDate === "—") {
      const toMatch = memoData.body.match(/(?:to|end|until)\s+(\d{1,2}[a-z]{0,2}\s+\w+\s+\d{4})/i)
      toDate = toMatch ? toMatch[1] : "—"
    }

    const calculatedRemarks = [
      outstandingLeaveDays > 0 ? `${outstandingLeaveDays} outstanding leave day${outstandingLeaveDays !== 1 ? "s" : ""} added to entitlement` : "",
      enjoyedDays > 0 ? `${enjoyedDays} day(s) given/already enjoyed deducted` : "",
      travellingDays > 0 ? `${travellingDays} travelling day${travellingDays !== 1 ? "s" : ""} added` : "",
    ].filter(Boolean)
    const savedReason = String((memoData as any).adjustment_reason || "").trim()
    const remarks = buildMemoRemarks({
      savedReason,
      calculatedRemarks,
    })

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

  // ── Post-table closing ────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)

  if (isPaymentMemo) {
    // Payment memos: request paragraph then closing — both come AFTER the table
    const isSingleStaff = (memoData.staffList?.length ?? 0) === 1
    const requestText = isSingleStaff
      ? "We, therefore, kindly request you to process and pay the staff leave allowance accordingly."
      : "We, therefore, kindly request you to process and pay their leave allowance accordingly."
    const requestLines = doc.splitTextToSize(requestText, contentWidth)
    requestLines.forEach((line: string) => { doc.text(line, margin, yPos); yPos += 5 })
    yPos += 3
    doc.text("We count on your co-operation.", margin, yPos)
    yPos += 6
  } else if (isIndividualLeaveMemo) {
    // Individual leave advice — resume date + QCC closing wording
    const resumeMatch = memoData.body.match(/resume(?:\s+duty)?(?:\s+on)?\s+([A-Za-z]+day,\s+[\w\s,]+\d{4})/i)
      || memoData.body.match(/return to work on\s+([A-Za-z]+day,\s+[\w\s,]+\d{4})/i)
    const resumeText = resumeMatch ? resumeMatch[1].trim() : null
    if (resumeText) {
      doc.text(`You are to resume duty on ${resumeText}.`, margin, yPos)
      yPos += 8
    }
    doc.text("We wish you a pleasant and relaxing vacation.", margin, yPos)
    yPos += 6
  } else {
    // Other group memos — use parsed closing from body
    const paragraphs = memoData.body.split(/\n{2,}/).map((p: string) => p.replace(/\n/g, " ").trim()).filter(Boolean)
    const closingMarkers = ["We wish you", "pleasant", "relaxing vacation", "resume duty"]
    const closingIdx = paragraphs.findIndex((p: string) => closingMarkers.some((m: string) => p.includes(m)))
    const closingOnly = closingIdx >= 0 ? paragraphs.slice(closingIdx) : []
    renderParagraphs(closingOnly)
  }

  // ── Signature block ────────────────────────────────────────────────────────
  if (yPos > pageHeight - margin - 44) { doc.addPage(); yPos = margin }
  yPos += 6

  // Signature image (data URL)
  if (memoData.signatory.signature_image_url) {
    try {
      const sigUrl = memoData.signatory.signature_image_url
      console.log("[v0] Processing signature URL:", sigUrl?.substring(0, 50) + (sigUrl?.length > 50 ? "..." : ""))
      
      if (sigUrl.startsWith("data:image/")) {
        // Data URL format (base64 embedded)
        console.log("[v0] Processing data URL signature")
        const b64Match = sigUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
        if (b64Match && b64Match[2]) {
          const imageType = b64Match[1].toUpperCase() === "JPEG" ? "JPEG" : "PNG"
          console.log("[v0] Adding data URL image:", imageType)
          doc.addImage(sigUrl, imageType, margin, yPos - 4, 44, 16)
          yPos += 14
          console.log("[v0] Signature image added successfully")
        } else {
          console.warn("[v0] Failed to parse data URL format")
        }
      } else if (sigUrl.startsWith("http://") || sigUrl.startsWith("https://")) {
        // HTTP URL - fetch and convert
        console.log("[v0] Fetching signature from HTTP URL:", sigUrl.substring(0, 100))
        try {
          // Try fetching with different strategies
          let response = null
          try {
            response = await fetch(sigUrl, { 
              headers: { Accept: "image/*" },
              mode: "cors",
              credentials: "include"
            })
          } catch (e1) {
            console.warn("[v0] CORS fetch failed, trying without credentials:", e1)
            response = await fetch(sigUrl, { 
              headers: { Accept: "image/*" },
              mode: "cors"
            })
          }
          
          if (!response.ok) {
            console.warn("[v0] Failed to fetch signature:", response.status, response.statusText)
          } else {
            const blob = await response.blob()
            console.log("[v0] Signature blob received:", {
              size: blob.size,
              type: blob.type
            })
            
            if (blob.size > 0) {
              try {
                const arrayBuffer = await blob.arrayBuffer()
                const uint8Array = new Uint8Array(arrayBuffer)
                
                // Convert to binary string
                let binaryString = ""
                for (let i = 0; i < uint8Array.length; i++) {
                  binaryString += String.fromCharCode(uint8Array[i])
                }
                
                // Convert to base64
                const base64 = btoa(binaryString)
                const contentType = response.headers.get("content-type") || blob.type || "image/png"
                const imageType = (contentType.includes("jpeg") || contentType.includes("jpg")) ? "JPEG" : "PNG"
                
                console.log("[v0] Converting signature:", {
                  base64Length: base64.length,
                  imageType,
                  contentType
                })
                
                // Create data URL and add to PDF
                const dataUrl = `data:${contentType};base64,${base64}`
                console.log("[v0] Adding signature image to PDF at position:", { x: margin, y: yPos - 4, width: 44, height: 16 })
                
                try {
                  doc.addImage(dataUrl, imageType, margin, yPos - 4, 44, 16)
                  yPos += 14
                  console.log("[v0] Signature image added successfully to PDF")
                } catch (addImageErr) {
                  console.warn("[v0] jsPDF addImage failed:", addImageErr)
                  // Still continue - signature just won't show
                }
              } catch (convErr) {
                console.warn("[v0] Error converting signature blob to image:", convErr)
              }
            } else {
              console.warn("[v0] Signature blob is empty (0 bytes)")
            }
          }
        } catch (fetchErr) {
          console.warn("[v0] Error fetching signature image:", fetchErr instanceof Error ? fetchErr.message : fetchErr)
        }
      } else {
        console.warn("[v0] Signature URL format not recognized:", sigUrl?.substring(0, 50))
      }
    } catch (sigErr) {
      console.warn("[v0] Error processing signature:", sigErr)
    }
  } else {
    console.warn("[v0] No signature URL provided for signatory")
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

  // ── CC list ────────────────────────────────────────────��───────────────────
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
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  const autoTable = autoTableMod.default
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
