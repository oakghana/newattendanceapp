import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

/**
 * GET: Download an approved deferment approval letter in professional QCC memo format
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const memoId = request.nextUrl.searchParams.get("memo_id")

    if (!memoId) {
      return NextResponse.json({ error: "memo_id parameter required" }, { status: 400 })
    }

    // Verify caller is authenticated
    const { createClient: createSessionClient } = await import("@/lib/supabase/server")
    const sessionClient = await createSessionClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch the approved deferment record plus the leave plan it references
    const { data: req, error: reqErr } = await admin
      .from("leave_deferment_requests")
      .select(`
        id, user_id, leave_plan_request_id,
        requested_deferment_year, requested_deferment_period,
        deferment_start_date, deferment_end_date,
        rescheduled_start_date, rescheduled_end_date,
        reason, hr_office_decision, hr_office_reviewed_at,
        hr_office_reviewed_by, created_at
      `)
      .eq("id", memoId)
      .eq("hr_office_decision", "approved")
      .maybeSingle()

    if (reqErr || !req) {
      return NextResponse.json({ error: "Deferment approval not found" }, { status: 404 })
    }

    // Fetch staff profile (the person whose leave is deferred)
    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, employee_id, position, department_id")
      .eq("id", req.user_id)
      .maybeSingle()

    // Fetch staff department
    const { data: deptData } = staffProfile?.department_id
      ? await admin.from("departments").select("name").eq("id", staffProfile.department_id).maybeSingle()
      : { data: null }

    // Fetch HR reviewer (signer) profile
    const { data: signerProfile } = req.hr_office_reviewed_by
      ? await admin
          .from("user_profiles")
          .select("first_name, last_name, position, signature_data_url, signature_mode, signature_text")
          .eq("id", req.hr_office_reviewed_by)
          .maybeSingle()
      : { data: null }

    // Fetch HOD profile (for routing reference)
    const { data: hodProfile } = req.hod_reviewed_by
      ? await admin
          .from("user_profiles")
          .select("first_name, last_name, position")
          .eq("id", req.hod_reviewed_by)
          .maybeSingle()
      : { data: null }

    const hodName = hodProfile
      ? `${hodProfile.first_name || ""} ${hodProfile.last_name || ""}`.trim().toUpperCase()
      : null

    // Helpers
    const safeDate = (d?: string | null) =>
      d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "N/A"
    const safeDateShort = (d?: string | null) =>
      d ? new Date(d).toLocaleDateString("en-GB") : "N/A"

    const staffName = staffProfile
      ? `${staffProfile.first_name || ""} ${staffProfile.last_name || ""}`.trim().toUpperCase()
      : "STAFF MEMBER"
    const staffEmployeeId = staffProfile?.employee_id || "N/A"
    const staffDept = deptData?.name || "N/A"
    const staffPosition = staffProfile?.position || "N/A"

    const signerName = signerProfile
      ? `${signerProfile.first_name || ""} ${signerProfile.last_name || ""}`.trim().toUpperCase()
      : "HR MANAGER"
    const signerPosition = (signerProfile?.position || "HR MANAGER").toUpperCase()

    const approvalDate = safeDate(req.hr_office_reviewed_at)
    const requestDate  = safeDateShort(req.created_at)

    // Deferment period (original leave that was deferred)
    const deferStart = safeDateShort(req.deferment_start_date)
    const deferEnd   = safeDateShort(req.deferment_end_date)
    const deferPeriodText =
      req.deferment_start_date && req.deferment_end_date
        ? `${deferStart} to ${deferEnd}`
        : "As approved by HR"

    // Rescheduled period (new dates)
    const reschedText = req.rescheduled_start_date
      ? `${safeDateShort(req.rescheduled_start_date)} to ${safeDateShort(req.rescheduled_end_date)}`
      : req.requested_deferment_period
      ? req.requested_deferment_period
      : req.requested_deferment_year
      ? `Year ${req.requested_deferment_year}`
      : "As mutually agreed"

    // Build deterministic ref no from record id
    const shortId = memoId.replace(/-/g, "").substring(0, 6).toUpperCase()
    const approvalYear = req.hr_office_reviewed_at
      ? new Date(req.hr_office_reviewed_at).getFullYear()
      : new Date().getFullYear()
    const refNo = `QCC/HR/DEF/${approvalYear}/${shortId}`

    // ─── PDF Setup ───────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageWidth  = doc.internal.pageSize.getWidth()
    const margin     = 20
    const contentWidth = pageWidth - 2 * margin
    let y = 18

    // ─── Letterhead ──────────────────────────────────────────────────────────
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
    doc.text(`DATE: ${approvalDate}`, pageWidth - margin, y, { align: "right" })
    y += 6

    // Thin rule
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 7

    // ─── TO / FROM / SUBJECT ────────────────────────────────────────────────
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
    const subjectText = `APPROVAL FOR DEFERMENT / RESCHEDULING OF LEAVE — ${approvalYear}`
    const subjectLines = doc.splitTextToSize(subjectText, contentWidth - labelW)
    subjectLines.forEach((line: string, idx: number) => {
      doc.text(line, valueX, y + idx * 5)
    })
    y += subjectLines.length * 5 + 6

    // Thin rule under header block
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y - 2, pageWidth - margin, y - 2)

    // ─── Body text ──────────────────────────────────────────────────────────
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(0, 0, 0)

    const para1 = `We refer to your request for deferment of leave dated ${requestDate} and are pleased to inform you that Management has given approval for your leave to be rescheduled accordingly.`
    const lines1 = doc.splitTextToSize(para1, contentWidth)
    lines1.forEach((line: string) => { doc.text(line, margin, y); y += 5 })
    y += 3

    const para2 = "The approval is subject to the details set out below. Kindly take note and plan accordingly."
    const lines2 = doc.splitTextToSize(para2, contentWidth)
    lines2.forEach((line: string) => { doc.text(line, margin, y); y += 5 })
    y += 5

    // ─── Details table ───────────────────────────────────────────────────────
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "grid",
      head: [["DETAILS", ""]],
      body: [
        ["Name of Staff", staffName],
        ["Employee ID", staffEmployeeId],
        ["Position", staffPosition],
        ["Department", staffDept],
        ["Original Leave Period", deferPeriodText],
        ["Rescheduled To", reschedText],
        ...(req.reason ? [["Reason for Deferment", req.reason]] : []),
        ["Date of Approval", approvalDate],
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

    // ─── Closing paragraph ──────────────────────────────────────────────────
    const closingPara = "We wish you a pleasant continuation of service and look forward to your return from leave at the rescheduled time."
    const closingLines = doc.splitTextToSize(closingPara, contentWidth)
    closingLines.forEach((line: string) => { doc.text(line, margin, y); y += 5 })
    y += 8

    // ─── Signature block ────────────────────────────────────────────────────
    if (signerProfile?.signature_data_url) {
      try {
        doc.addImage(signerProfile.signature_data_url, "PNG", margin, y, 38, 15)
        y += 17
      } catch {
        y += 4
      }
    }

    // Signature line
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)
    doc.line(margin, y, margin + 60, y)
    y += 4

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text(signerName, margin, y)
    y += 4.5
    doc.setFont("helvetica", "normal")
    doc.text(signerPosition, margin, y)
    y += 4.5
    doc.text("FOR: MANAGING DIRECTOR", margin, y)
    y += 8

    // ─── CC line ────────────────────────────────────────────────────────────
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.text("cc:", margin, y)
    doc.setFont("helvetica", "normal")
    // Build CC list: include HOD name if available
    const ccRecipients = [
      "Managing Director",
      "Deputy Director HR",
      hodName ? `${hodName}, Head of Department (${staffDept})` : `HOD — ${staffDept}`,
      "Staff File"
    ]
    const ccText = ccRecipients.join(", ")
    const ccLines = doc.splitTextToSize(ccText, contentWidth - 12)
    ccLines.forEach((line: string, i: number) => {
      doc.text(line, margin + 10, y + i * 4)
    })

    // ─── Footer ─────────────────────────────────────────────────────────────
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setTextColor(130, 130, 130)
    doc.text(`Document Ref: ${refNo}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`, pageWidth / 2, pageHeight - 8, { align: "center" })

    // Generate and return
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"))
    const fileStaffName = staffName.replace(/\s+/g, "-").toLowerCase()
    const filename = `deferment-approval-${fileStaffName}-${approvalYear}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error("[v0] Deferment download error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 }
    )
  }
}
