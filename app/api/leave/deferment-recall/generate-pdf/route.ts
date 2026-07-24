import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"

// Ordinal suffix helper: 1st, 2nd, 3rd …
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Format "Monday, 3rd July, 2026"
function fmtFormal(d: string | null | undefined): string {
  if (!d) return "N/A"
  const dt = new Date(d)
  const days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const months = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"]
  return `${days[dt.getDay()]}, ${ordinal(dt.getDate())} ${months[dt.getMonth()]}, ${dt.getFullYear()}`
}

export async function GET(request: NextRequest) {
  try {
    const recallId = request.nextUrl.searchParams.get("recall_id")
    if (!recallId) return NextResponse.json({ error: "recall_id parameter required" }, { status: 400 })
    return await generateRecallPDF(recallId)
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
    if (!memo_id || !memo_type) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    if (memo_type === "recall") return await generateRecallPDF(memo_id)
    return NextResponse.json({ error: "Invalid memo_type" }, { status: 400 })
  } catch (error) {
    console.error("[v0] generate-pdf POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 }
    )
  }
}

async function generateRecallPDF(recallId: string): Promise<NextResponse> {
  const admin = await createAdminClient()

  // ── Fetch recall ─────────────────────────────────────────────────────────
  const { data: recall, error } = await admin
    .from("leave_recall_requests")
    .select(`
      id, staff_user_id, leave_plan_request_id,
      recall_date, recall_reason, recall_notes,
      hr_decision, hr_reviewed_at, hr_reviewed_by,
      status, created_at
    `)
    .eq("id", recallId)
    .maybeSingle()

  if (error || !recall) {
    return NextResponse.json({ error: "Recall request not found" }, { status: 404 })
  }

  // ── Fetch staff profile (including assigned location) ───────────────────
  const { data: staff } = await admin
    .from("user_profiles")
    .select("first_name, last_name, employee_id, position, department_id, assigned_location_id")
    .eq("id", recall.staff_user_id)
    .maybeSingle()

  const { data: staffDept } = staff?.department_id
    ? await admin.from("departments").select("name").eq("id", staff.department_id).maybeSingle()
    : { data: null }

  // ── Fetch staff assigned location from geofence_locations ───────────────
  const { data: staffLocation } = staff?.assigned_location_id
    ? await admin.from("geofence_locations").select("name").eq("id", staff.assigned_location_id).maybeSingle()
    : { data: null }

  // ── Fetch leave plan (for days info) ────────────────────────────────────
  const { data: plan } = recall.leave_plan_request_id
    ? await admin
        .from("leave_plan_requests")
        .select("adjusted_days, travelling_days_added, adjusted_start_date, adjusted_end_date, preferred_start_date, preferred_end_date")
        .eq("id", recall.leave_plan_request_id)
        .maybeSingle()
    : { data: null }

  // ── Fetch HR reviewer (signer) ──────────────────────────────────────────
  const { data: signer } = recall.hr_reviewed_by
    ? await admin
        .from("user_profiles")
        .select("first_name, last_name, position, signature_data_url")
        .eq("id", recall.hr_reviewed_by)
        .maybeSingle()
    : { data: null }

  // ── Find HOD for THRO' block ─────────────────────────────────────────────
  let hodTitle = `THE HEAD OF ${(staffDept?.name || "DEPARTMENT").toUpperCase()}`
  if (staff?.department_id) {
    const { data: deptHead } = await admin
      .from("user_profiles")
      .select("position")
      .eq("department_id", staff.department_id)
      .ilike("position", "%head%")
      .maybeSingle()
    if (deptHead?.position) {
      hodTitle = `THE ${deptHead.position.toUpperCase()}`
    }
  }

  // ── Build display strings ────────────────────────────────────────────────
  const staffName  = staff
    ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim().toUpperCase()
    : "STAFF MEMBER"
  const staffSNo   = staff?.employee_id || "N/A"
  const staffPos   = (staff?.position || "STAFF").toUpperCase()

  const signerName = signer
    ? `${signer.first_name || ""} ${signer.last_name || ""}`.trim().toUpperCase()
    : "HR MANAGER"
  const signerPos  = (signer?.position || "HR MANAGER").toUpperCase()

  const reviewYear = recall.hr_reviewed_at
    ? new Date(recall.hr_reviewed_at).getFullYear()
    : new Date().getFullYear()

  const shortId  = recallId.replace(/-/g, "").substring(0, 4).toUpperCase()
  const refNo    = `QCC/HR/RCL/${reviewYear}/${shortId}`

  const recallDateFormal = fmtFormal(recall.recall_date)

  // Leave period from plan
  const leaveStart = plan?.adjusted_start_date || plan?.preferred_start_date
  const leaveEnd   = plan?.adjusted_end_date   || plan?.preferred_end_date
  const workDays   = plan?.adjusted_days || 0
  const travelDays = plan?.travelling_days_added || 0

  // ── PDF Setup ────────────────────────────────────────────────────────────
  const doc      = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW    = doc.internal.pageSize.getWidth()
  const pageH    = doc.internal.pageSize.getHeight()
  const marginL  = 25
  const marginR  = 25
  const contentW = pageW - marginL - marginR

  // ── Letterhead with QCC logo ─────────────────────────────────────────────
  let logoDataUrl: string | null = null
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const logoResp = await fetch(`${baseUrl}/logos/qcc-logo.png`)
    if (logoResp.ok) {
      const buf = await logoResp.arrayBuffer()
      const u8  = new Uint8Array(buf)
      let bin   = ""
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
      logoDataUrl = `data:image/png;base64,${btoa(bin)}`
    }
  } catch { /* logo optional */ }

  const logoSize = 26
  const logoX    = marginL
  const logoY    = 10
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize)

  // Company name centred
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text("QUALITY CONTROL COMPANY LTD.", pageW / 2, 17, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("(COCOBOD)", pageW / 2, 23, { align: "center" })

  // Address top-right
  doc.setFontSize(8.5)
  doc.text("P.O. Box M54", pageW - marginR, 13, { align: "right" })
  doc.text("Accra", pageW - marginR, 18, { align: "right" })
  doc.text("Ghana", pageW - marginR, 23, { align: "right" })

  // Green accent rule
  const ruleY = logoY + logoSize + 2
  doc.setFillColor(26, 110, 26)
  doc.rect(marginL, ruleY, contentW, 1.2, "F")

  let y = ruleY + 10

  // ── Staff address block ──────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text(`${staffName} (S/NO. ${staffSNo})`, marginL, y);  y += 5.5
  doc.text(staffPos, marginL, y);                             y += 10

  // THRO' block
  doc.setFont("helvetica", "bold")
  doc.text("THRO':", marginL, y)
  const throcol = marginL + 16
  doc.text(hodTitle, throcol, y);                                   y += 5.5
  doc.text("QUALITY CONTROL COMPANY LTD.", throcol, y);             y += 5.5
  doc.text("HEAD OFFICE, ACCRA", throcol, y);                       y += 12

  // ── Subject (bold, underlined) ───────────────────────────────────────────
  const subject = `RECALL FROM LEAVE — ${reviewYear}`
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  const subjW = doc.getTextWidth(subject)
  doc.text(subject, marginL, y)
  doc.setLineWidth(0.3)
  doc.setDrawColor(0, 0, 0)
  doc.line(marginL, y + 1, marginL + subjW, y + 1)
  y += 10

  // ── Body ───────────────────────────────────────────���─────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)

  // Paragraph 1
  const p1 = `We refer to our letter no. ${refNo} and wish to inform you that Management has found it necessary to recall you from your ${reviewYear} annual vacation leave effective ${recallDateFormal}.`
  doc.splitTextToSize(p1, contentW).forEach((l: string) => { doc.text(l, marginL, y); y += 5.5 })
  y += 4

  // Paragraph 2 — days + bold dates if available
  if (leaveStart && leaveEnd) {
    const daysText = workDays > 0
      ? `${numWords(workDays)} (${workDays}) working days${travelDays > 0 ? ` plus ${numWords(travelDays)} (${travelDays}) travelling days` : ""}`
      : "outstanding leave days"

    const pre  = `Accordingly, your outstanding annual vacation leave of ${daysText} shall be credited back to your leave balance with effect from `
    const bold = `${fmtFormal(leaveStart)} to ${fmtFormal(leaveEnd)}.`

    const preFull = pre.trimEnd()
    doc.setFont("helvetica", "normal")
    doc.text(preFull, marginL, y)
    const preW = doc.getTextWidth(preFull + " ")

    // Check if bold dates fit on same line; if not, go to next line
    const boldW = doc.getTextWidth(bold)
    if (preW + boldW > contentW + 2) {
      y += 5.5
      doc.setFont("helvetica", "bold")
      doc.text(bold, marginL, y)
    } else {
      doc.setFont("helvetica", "bold")
      doc.text(bold, marginL + preW, y)
    }
    doc.setFont("helvetica", "normal")
    y += 5.5

    if (doc.getTextWidth(pre + bold) > contentW) y += 5.5
    y += 4
  }

  // Paragraph 3 — resume duty
  const p3pre  = "You are expected to resume duty on "
  const p3bold = `${recallDateFormal}.`
  doc.setFont("helvetica", "normal")
  doc.text(p3pre, marginL, y)
  doc.setFont("helvetica", "bold")
  doc.text(p3bold, marginL + doc.getTextWidth(p3pre), y)
  doc.setFont("helvetica", "normal")
  y += 5.5
  y += 4

  // Reason paragraph
  if (recall.recall_reason || recall.recall_notes) {
    const reason = recall.recall_reason || recall.recall_notes || "exigencies of service"
    const p4 = `The reason for this recall is due to ${reason.toLowerCase()}.`
    doc.splitTextToSize(p4, contentW).forEach((l: string) => { doc.text(l, marginL, y); y += 5.5 })
    y += 4
  }

  // Closing
  doc.text("We regret any inconvenience this may cause and count on your understanding and co-operation.", marginL, y)
  y += 16

  // ── Signature ─────────────────────────────────────────────────────────────
  if (signer?.signature_data_url) {
    try {
      doc.addImage(signer.signature_data_url, "PNG", marginL, y, 40, 16)
      y += 18
    } catch { /* skip */ }
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(signerName, marginL, y);               y += 5.5
  doc.text(signerPos, marginL, y);                y += 5.5
  doc.text("FOR: MANAGING DIRECTOR", marginL, y); y += 12

  // ── CC block ──────────────────────────────────────────────────────────────
  doc.setFontSize(9.5)
  doc.setFont("helvetica", "normal")
  doc.text("cc:", marginL, y)
  const ccX     = marginL + 14
  const ccItems = [
    "Managing Director",
    "Dep. Director, HR",
    "Deputy Director, Finance",
    "Audit Manager",
  ]
  ccItems.forEach(item => { doc.text(item, ccX, y); y += 5 })

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  doc.text(
    `Ref: ${refNo}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
    pageW / 2, pageH - 8, { align: "center" }
  )

  // ── Output ────────────────────────────────────────────────────────────────
  const pdfBuf   = Buffer.from(doc.output("arraybuffer"))
  const fnStaff  = staffName.replace(/\s+/g, "-").toLowerCase()
  const filename = `recall-approval-${fnStaff}-${reviewYear}.pdf`

  return new NextResponse(pdfBuf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuf.length),
    },
  })
}

function numWords(n: number): string {
  const ones = ["","one","two","three","four","five","six","seven","eight","nine",
                 "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen",
                 "seventeen","eighteen","nineteen"]
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"]
  if (n < 20) return ones[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return o ? `${tens[t]}-${ones[o]}` : tens[t]
}
