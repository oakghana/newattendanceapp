import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"

/**
 * GET: Download an approved deferment memo in professional QCC memo format
 * Staff can download their approved deferment approval memo for their records
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const memoId = request.nextUrl.searchParams.get("memo_id")

    if (!memoId) {
      return NextResponse.json({ error: "memo_id parameter required" }, { status: 400 })
    }

    // Get current user
    const supabase = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch the deferment request with full details
    const { data: defermentReq, error: reqErr } = await admin
      .from("leave_deferment_requests")
      .select(`
        id, user_id, original_leave_period_start, original_leave_period_end,
        requested_deferment_year, deferment_start_date, deferment_end_date,
        reason, hr_office_decision, hr_office_reviewed_at, hr_executive_id,
        created_at
      `)
      .eq("id", memoId)
      .eq("user_id", user.id)
      .eq("hr_office_decision", "approved")
      .single()

    if (reqErr || !defermentReq) {
      console.error("[v0] Error fetching deferment request:", reqErr)
      return NextResponse.json({ error: "Deferment approval not found" }, { status: 404 })
    }

    // Fetch staff details
    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, employee_id, position, department_id")
      .eq("id", user.id)
      .single()

    // Fetch department
    const { data: dept } = staffProfile?.department_id
      ? await admin
          .from("departments")
          .select("name")
          .eq("id", staffProfile.department_id)
          .single()
      : { data: null }

    // Fetch signer details (HR executive who approved)
    const { data: signerProfile } = defermentReq.hr_executive_id
      ? await admin
          .from("user_profiles")
          .select("first_name, last_name, position")
          .eq("id", defermentReq.hr_executive_id)
          .single()
      : { data: null }

    // Create PDF using QCC professional memo format
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - 2 * margin

    let yPos = margin

    // ─── QCC Header with Logo Placeholder ───
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, yPos, { align: "center" })
    yPos += 5
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text("(COCOBOD)", pageWidth / 2, yPos, { align: "center" })
    yPos += 4
    doc.setFontSize(8)
    doc.text("P.O. Box M54, Accra, Ghana", pageWidth / 2, yPos, { align: "center" })
    yPos += 8

    // ─── Green accent bar ───
    doc.setFillColor(26, 110, 26)
    doc.rect(margin, yPos, contentWidth, 1.5, "F")
    yPos += 6

    // ─── Reference and Date ───
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(26, 110, 26)
    const refNo = `QCC/HR/DEF/${new Date().getFullYear()}/${Math.random().toString(36).substring(7).toUpperCase()}`
    doc.text(`Our Ref No: ${refNo}`, margin, yPos)
    doc.setTextColor(0)
    const dateStr = new Date(defermentReq.hr_office_reviewed_at || new Date()).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    doc.text(`Date: ${dateStr}`, pageWidth - margin - 50, yPos)
    yPos += 6
    doc.setFont("helvetica", "normal")
    doc.setTextColor(26, 110, 26)
    doc.text("Your Ref No: ____________________________", margin, yPos)
    doc.setTextColor(0)
    yPos += 5

    // ─── Thin divider ───
    doc.setDrawColor(180)
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 6

    // ─── TO / FROM / SUBJECT block ───
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("TO:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.text("DEPUTY DIRECTOR, FINANCE", margin + 20, yPos)
    yPos += 6

    doc.setFont("helvetica", "bold")
    doc.text("FROM:", margin, yPos)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(26, 110, 26)
    doc.text("HR MANAGER", margin + 20, yPos)
    doc.setTextColor(0)
    yPos += 6

    doc.setFont("helvetica", "bold")
    doc.text("SUBJECT:", margin, yPos)
    doc.setFont("helvetica", "normal")
    const subject = `APPROVAL FOR RESCHEDULING OF ${new Date(defermentReq.original_leave_period_start).getFullYear()} LEAVE`
    const subjectLines = doc.splitTextToSize(subject, contentWidth - 25)
    subjectLines.forEach((line: string, i: number) => {
      doc.text(line, margin + 20, yPos + i * 5)
    })
    yPos += subjectLines.length * 5 + 4

    // ─── Body paragraphs ───
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)

    const originalPeriod = `${new Date(defermentReq.original_leave_period_start).toLocaleDateString("en-GB")} to ${new Date(defermentReq.original_leave_period_end).toLocaleDateString("en-GB")}`
    const deferredPeriod = `${new Date(defermentReq.deferment_start_date || 0).toLocaleDateString("en-GB")} to ${new Date(defermentReq.deferment_end_date || 0).toLocaleDateString("en-GB")}`

    const para1 = `We refer to your request dated ${new Date(defermentReq.created_at).toLocaleDateString("en-GB")} and wish to inform you that Management has granted approval for your leave to be rescheduled.`
    const lines1 = doc.splitTextToSize(para1, contentWidth)
    lines1.forEach((line: string) => {
      doc.text(line, margin, yPos)
      yPos += 4.5
    })
    yPos += 3

    doc.text(`Accordingly, your outstanding leave of days shall be deferred to ${defermentReq.requested_deferment_year}.`, margin, yPos)
    yPos += 6

    doc.setFont("helvetica", "bold")
    doc.text("Details:", margin, yPos)
    doc.setFont("helvetica", "normal")
    yPos += 5

    doc.text(`Original Leave Period: ${originalPeriod}`, margin + 5, yPos)
    yPos += 4.5
    doc.text(`Deferment Year: ${defermentReq.requested_deferment_year}`, margin + 5, yPos)
    yPos += 4.5
    if (defermentReq.reason) {
      const reasonText = `Reason: ${defermentReq.reason}`
      const reasonLines = doc.splitTextToSize(reasonText, contentWidth - 10)
      reasonLines.forEach((line: string) => {
        doc.text(line, margin + 5, yPos)
        yPos += 4.5
      })
    }
    yPos += 3

    doc.text("We wish you a pleasant continuation of service.", margin, yPos)
    yPos += 10

    // ─── Signature block ───
    doc.setFont("helvetica", "normal")
    const signerName = signerProfile
      ? `${signerProfile.first_name} ${signerProfile.last_name}`.toUpperCase()
      : "HR EXECUTIVE"
    const signerPos = signerProfile?.position?.toUpperCase() || "HR MANAGER"
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(signerName, margin, yPos)
    yPos += 5
    doc.text(signerPos, margin, yPos)
    yPos += 5
    doc.text("FOR: MANAGING DIRECTOR", margin, yPos)
    yPos += 8

    // ─── CC line ───
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.text("cc: ", margin, yPos)
    doc.setFont("helvetica", "normal")
    const ccList = "Managing Director, Deputy Managing Director, HR Head, Accounts Manager"
    const ccLines = doc.splitTextToSize(ccList, contentWidth - 10)
    ccLines.forEach((line: string, i: number) => {
      doc.text(line, margin + 8, yPos + i * 3.5)
    })

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"))
    const staffName = (staffProfile?.first_name || "Staff").replace(/\s+/g, "-").toLowerCase()
    const filename = `deferment-approval-${staffName}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length,
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
