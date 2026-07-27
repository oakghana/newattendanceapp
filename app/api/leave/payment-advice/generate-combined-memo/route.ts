import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"

/**
 * POST /api/leave/payment-advice/generate-combined-memo
 * Generates a combined payment advice memo PDF with all staff categories
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { staffList, month, monthLabel } = body

    if (!staffList || !Array.isArray(staffList) || staffList.length === 0) {
      return NextResponse.json({ error: "Invalid staff list" }, { status: 400 })
    }

    if (!month || !monthLabel) {
      return NextResponse.json(
        { error: "Month and monthLabel are required" },
        { status: 400 }
      )
    }

    // Create PDF
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    })

    const margin = 15
    const pageWidth = doc.internal.pageSize.getWidth()
    const contentWidth = pageWidth - 2 * margin
    let y = margin

    // Header
    doc.setFontSize(11)
    doc.setFont(undefined, "bold")
    doc.text("QUALITY CONTROL COMPANY LTD.", margin, y)
    y += 5
    doc.setFont(undefined, "normal")
    doc.setFontSize(10)
    doc.text("(COCOBOD)", margin, y)
    y += 4
    doc.text("P. O. BOX M54", margin, y)
    y += 4
    doc.text("ACCRA", margin, y)

    // Memorandum label (right-aligned)
    doc.setFontSize(12)
    doc.setFont(undefined, "bold")
    doc.text("MEMORANDUM", pageWidth - margin - 40, margin + 5)

    // Reference and Date
    y += 10
    const today = new Date()
    const dateStr = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })

    const monthDate = new Date(`${month}-01`)
    const year = monthDate.getFullYear()
    const monthNum = String(monthDate.getMonth() + 1).padStart(2, "0")
    const totalStaff = String(staffList.length).padStart(3, "0")
    const refNo = `QCC/HR/PA/${year}/${monthNum}/CMB/${totalStaff}`

    doc.setFontSize(9)
    doc.setFont(undefined, "normal")
    doc.text(`REF. NO: ${refNo}`, margin, y)
    doc.text(`DATE: ${dateStr}`, pageWidth - margin - 40, y)

    // Horizontal line
    y += 8
    doc.setDrawColor(0)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // TO / FROM / SUBJECT with proper alignment
    const labelColumnX = margin
    const labelColumnWidth = 20
    const valueColumnX = margin + labelColumnWidth
    const valueColumnWidth = contentWidth - labelColumnWidth

    doc.setFont(undefined, "bold")
    doc.setFontSize(9)

    // TO
    doc.text("TO:", labelColumnX, y, { align: "left" })
    doc.setFont(undefined, "normal")
    const toLines = doc.splitTextToSize("DEPUTY DIRECTOR, FINANCE", valueColumnWidth)
    doc.text(toLines, valueColumnX, y)
    y += toLines.length * 4 + 3

    // FROM
    doc.setFont(undefined, "bold")
    doc.text("FROM:", labelColumnX, y, { align: "left" })
    doc.setFont(undefined, "normal")
    const fromLines = doc.splitTextToSize("HUMAN RESOURCE MANAGER", valueColumnWidth)
    doc.text(fromLines, valueColumnX, y)
    y += fromLines.length * 4 + 3

    // SUBJECT
    doc.setFont(undefined, "bold")
    doc.text("SUBJECT:", labelColumnX, y, { align: "left" })
    doc.setFont(undefined, "normal")
    const subjectText = `PAYMENT OF LEAVE ALLOWANCE (ALL STAFF CATEGORIES) – ${monthLabel.toUpperCase()}`
    const subjectLines = doc.splitTextToSize(subjectText, valueColumnWidth)
    doc.text(subjectLines, valueColumnX, y)
    y += subjectLines.length * 4 + 6

    // Body text
    const bodyText = `We wish to inform you that the staff members listed in the attached document are scheduled to proceed on annual vacation leave in ${monthLabel}.`
    const bodyLines = doc.splitTextToSize(bodyText, contentWidth)
    doc.setFont(undefined, "normal")
    doc.setFontSize(9)
    doc.text(bodyLines, margin, y)
    y += bodyLines.length * 4 + 6

    // Table header
    const tableStartY = y
    const col1X = margin
    const col2X = margin + 8
    const col3X = margin + 40
    const col4X = margin + 60
    const col5X = margin + 95
    const col6X = margin + 140

    doc.setFont(undefined, "bold")
    doc.setFontSize(8)
    doc.setFillColor(139, 109, 69) // Brown color
    doc.setTextColor(255, 255, 255) // White text
    
    const tableHeight = 5
    doc.rect(col1X, y - 3, col2X - col1X, tableHeight, "F")
    doc.rect(col2X, y - 3, col3X - col2X, tableHeight, "F")
    doc.rect(col3X, y - 3, col4X - col3X, tableHeight, "F")
    doc.rect(col4X, y - 3, col5X - col4X, tableHeight, "F")
    doc.rect(col5X, y - 3, col6X - col5X, tableHeight, "F")
    doc.rect(col6X, y - 3, pageWidth - margin - col6X, tableHeight, "F")

    doc.text("NO", col1X + 1, y)
    doc.text("NAME", col2X + 1, y)
    doc.text("S/NO", col3X + 1, y)
    doc.text("RANK", col4X + 1, y)
    doc.text("STATION", col5X + 1, y)
    doc.text("LEAVE DATE", col6X + 1, y)

    y += tableHeight + 2

    // Table rows
    doc.setFont(undefined, "normal")
    doc.setTextColor(0, 0, 0)

    let rowNum = 1
    staffList.forEach((staff: any) => {
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage()
        y = margin
      }

      const startDate = new Date(staff.start_date)
      const dateFormatted = startDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })

      doc.text(String(rowNum), col1X + 1, y)
      doc.text(staff.full_name || "N/A", col2X + 1, y)
      doc.text(staff.employee_id || "N/A", col3X + 1, y)
      doc.text(staff.position?.substring(0, 15) || "N/A", col4X + 1, y)
      doc.text(staff.department_name?.substring(0, 15) || "N/A", col5X + 1, y)
      doc.text(dateFormatted, col6X + 1, y)

      y += 5
      rowNum++
    })

    // Footer
    y += 3
    doc.setFont(undefined, "normal")
    doc.setFontSize(8)
    const footerText1 = "We, therefore, kindly request you to process and pay the staff leave allowance accordingly."
    const footerLines1 = doc.splitTextToSize(footerText1, contentWidth)
    doc.text(footerLines1, margin, y)
    y += footerLines1.length * 3 + 2

    doc.text("We count on your co-operation.", margin, y)
    y += 6

    doc.setFont(undefined, "bold")
    doc.text("HUMAN RESOURCE MANAGER", margin, y)
    y += 4
    doc.setFont(undefined, "normal")
    doc.text("FOR: MANAGING DIRECTOR", margin, y)

    // Generate filename
    const filename = `payment-advice-${monthLabel.replace(/\s+/g, "-")}-combined.pdf`

    // Return PDF as blob
    const pdfBlob = doc.output("blob")
    const buffer = Buffer.from(await pdfBlob.arrayBuffer())

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("[v0] Combined memo generation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate combined memo" },
      { status: 500 }
    )
  }
}
