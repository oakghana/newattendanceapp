import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

/**
 * POST: Generate a formal QCC memo PDF for an approved deferment or recall request.
 * Body: { memo_id: string, memo_type: "deferment" | "recall" }
 * Also supports GET with ?recall_id=<id> for direct recall download.
 */
export async function GET(request: NextRequest) {
  try {
    // Support direct recall download via GET ?recall_id=<id>
    const recallId = request.nextUrl.searchParams.get("recall_id")
    if (recallId) {
      return await generateRecallPDF(recallId)
    }
    return NextResponse.json({ error: "recall_id parameter required" }, { status: 400 })
  } catch (error) {
    console.error("[v0] generate-pdf GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { memo_id, memo_type } = body

    if (!memo_id || !memo_type) {
      return NextResponse.json({ error: "Missing required fields: memo_id, memo_type" }, { status: 400 })
    }

    if (memo_type === "deferment") {
      // Delegate to the download-approved handler pattern
      const { NextRequest: NR } = await import("next/server")
      const url = new URL(`/api/leave/deferment-recall/download-approved?memo_id=${memo_id}`, "http://localhost")
      return NextResponse.redirect(url)
    }

    if (memo_type === "recall") {
      return generateRecallPDF(memo_id)
    }

    return NextResponse.json({ error: "Invalid memo_type. Must be 'deferment' or 'recall'" }, { status: 400 })
  } catch (error) {
    console.error("[v0] generate-pdf error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 }
    )
  }
}

async function generateRecallPDF(recallId: string): Promise<NextResponse> {
  const admin = await createAdminClient()

  // Fetch the recall request
  const { data: recall, error: recallErr } = await admin
    .from("leave_recall_requests")
    .select(`
      id, staff_user_id, leave_plan_request_id,
      recall_date, recall_reason, recall_notes,
      hr_decision, hr_reviewed_at, hr_reviewed_by,
      status, created_at
    `)
    .eq("id", recallId)
    .maybeSingle()

  if (recallErr || !recall) {
    return NextResponse.json({ error: "Recall request not found" }, { status: 404 })
  }

  // Fetch staff profile
  const { data: staffProfile } = await admin
    .from("user_profiles")
    .select("first_name, last_name, employee_id, position, department_id")
    .eq("id", recall.staff_user_id)
    .maybeSingle()

  const { data: deptData } = staffProfile?.department_id
    ? await admin.from("departments").select("name").eq("id", staffProfile.department_id).maybeSingle()
    : { data: null }

  // Fetch HR reviewer (signer)
  const { data: signerProfile } = recall.hr_reviewed_by
    ? await admin
        .from("user_profiles")
        .select("first_name, last_name, position, signature_data_url")
        .eq("id", recall.hr_reviewed_by)
        .maybeSingle()
    : { data: null }

  // Fetch original leave plan for context
  const { data: leavePlan } = recall.leave_plan_request_id
    ? await admin
        .from("leave_plan_requests")
        .select("preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, leave_type_key")
        .eq("id", recall.leave_plan_request_id)
        .maybeSingle()
    : { data: null }

  // Helpers
  const safeDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "N/A"
  const safeDateShort = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB") : "N/A"

  const staffName      = staffProfile ? `${staffProfile.first_name || ""} ${staffProfile.last_name || ""}`.trim().toUpperCase() : "STAFF MEMBER"
  const staffEmployeeId = staffProfile?.employee_id || "N/A"
  const staffDept      = deptData?.name || "N/A"
  const staffPosition  = staffProfile?.position || "N/A"

  const signerName     = signerProfile ? `${signerProfile.first_name || ""} ${signerProfile.last_name || ""}`.trim().toUpperCase() : "HR MANAGER"
  const signerPosition = (signerProfile?.position || "HR MANAGER").toUpperCase()

  const reviewYear = recall.hr_reviewed_at ? new Date(recall.hr_reviewed_at).getFullYear() : new Date().getFullYear()
  const shortId    = recallId.replace(/-/g, "").substring(0, 6).toUpperCase()
  const refNo      = `QCC/HR/RCL/${reviewYear}/${shortId}`

  const leaveStart = leavePlan?.adjusted_start_date || leavePlan?.preferred_start_date
  const leaveEnd   = leavePlan?.adjusted_end_date   || leavePlan?.preferred_end_date
  const leavePeriodText = leaveStart ? `${safeDateShort(leaveStart)} to ${safeDateShort(leaveEnd)}` : "As approved"

  const leaveTypeLabel = recall.leave_plan_request_id && leavePlan?.leave_type_key
    ? leavePlan.leave_type_key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : "Annual Leave"

  // ─── PDF Setup ─────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth    = doc.internal.pageSize.getWidth()
  const pageHeight   = doc.internal.pageSize.getHeight()
  const margin       = 20
  const contentWidth = pageWidth - 2 * margin
  let y = 18

  // ─── Letterhead ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, y, { align: "center" })
  y += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.text("(COCOBOD)", pageWidth / 2, y, { align: "center" })
  y += 4.5
  doc.text("P. O. BOX M54, ACCRA", pageWidth / 2, y, { align: "center" })
  y += 8

  // Green rule
  doc.setFillColor(20, 100, 30)
  doc.rect(margin, y, contentWidth, 1.2, "F")
  y += 6

  // Ref + Date row
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(`REF. NO: ${refNo}`, margin, y)
  doc.text(`DATE: ${safeDate(recall.hr_reviewed_at)}`, pageWidth - margin, y, { align: "right" })
  y += 6

  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 7

  // ─── TO / FROM / SUBJECT ───────────────────────────────────────────────────
  const labelW = 22
  const valueX = margin + labelW

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.text("TO:", margin, y)
  doc.setFont("helvetica", "normal")
  doc.text(staffName, valueX, y)
  y += 6

  doc.setFont("helvetica", "bold")
  doc.text("FROM:", margin, y)
  doc.setFont("helvetica", "normal")
  doc.text("HR MANAGER", valueX, y)
  y += 6

  doc.setFont("helvetica", "bold")
  doc.text("SUBJECT:", margin, y)
  doc.setFont("helvetica", "bold")
  const subjectText = `NOTICE OF RECALL FROM LEAVE — ${reviewYear}`
  const subjectLines = doc.splitTextToSize(subjectText, contentWidth - labelW)
  subjectLines.forEach((line: string, i: number) => doc.text(line, valueX, y + i * 5))
  y += subjectLines.length * 5 + 6

  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y - 2, pageWidth - margin, y - 2)

  // ─── Body ──────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.setTextColor(0, 0, 0)

  const para1 = `We refer to your current leave and wish to inform you that Management has found it necessary to recall you from leave effective ${safeDate(recall.recall_date)}.`
  doc.splitTextToSize(para1, contentWidth).forEach((line: string) => { doc.text(line, margin, y); y += 5 })
  y += 3

  const para2 = "We regret any inconvenience this may cause and wish to assure you that the outstanding leave days will be credited back to your leave balance for scheduling at a mutually convenient time."
  doc.splitTextToSize(para2, contentWidth).forEach((line: string) => { doc.text(line, margin, y); y += 5 })
  y += 5

  // ─── Details table ─────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    head: [["DETAILS", ""]],
    body: [
      ["Name of Staff",     staffName],
      ["Employee ID",       staffEmployeeId],
      ["Position",          staffPosition],
      ["Department",        staffDept],
      ["Leave Type",        leaveTypeLabel],
      ["Leave Period",      leavePeriodText],
      ["Recall Date",       safeDate(recall.recall_date)],
      ["Reason for Recall", recall.recall_reason || recall.recall_notes || "Exigencies of service"],
    ],
    headStyles: {
      fillColor: [20, 100, 30],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
    },
    bodyStyles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", fillColor: [245, 248, 245] },
      1: { cellWidth: contentWidth - 50 },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ─── Closing ───────────────────────────────────────────────────────────────
  const closing = "Kindly acknowledge receipt of this letter and report to your duty post on the date indicated above. We count on your understanding and co-operation."
  doc.splitTextToSize(closing, contentWidth).forEach((line: string) => { doc.text(line, margin, y); y += 5 })
  y += 8

  // ─── Signature ─────────────────────────────────────────────────────────────
  if (signerProfile?.signature_data_url) {
    try {
      doc.addImage(signerProfile.signature_data_url, "PNG", margin, y, 38, 15)
      y += 17
    } catch { y += 4 }
  }

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(margin, y, margin + 60, y)
  y += 4

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(signerName, margin, y); y += 4.5
  doc.setFont("helvetica", "normal")
  doc.text(signerPosition, margin, y); y += 4.5
  doc.text("FOR: MANAGING DIRECTOR", margin, y); y += 8

  // ─── CC ────────────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.text("cc:", margin, y)
  doc.setFont("helvetica", "normal")
  const ccText = `Managing Director, Deputy Director HR, HOD — ${staffDept}, Staff File`
  doc.splitTextToSize(ccText, contentWidth - 12).forEach((line: string, i: number) => {
    doc.text(line, margin + 10, y + i * 4)
  })

  // ─── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(130, 130, 130)
  doc.text(
    `Document Ref: ${refNo}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
    pageWidth / 2, pageHeight - 8, { align: "center" }
  )

  const pdfBuffer  = Buffer.from(doc.output("arraybuffer"))
  const fileStaffName = staffName.replace(/\s+/g, "-").toLowerCase()
  const filename   = `recall-notice-${fileStaffName}-${reviewYear}.pdf`

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  })
}
