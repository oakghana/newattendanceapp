import { createAdminClient, createClient as createSessionClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import jsPDF from "jspdf"

// Ordinal suffix helper: 1st, 2nd, 3rd, 4th …
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Format a date as "Monday, 2nd March, 2026"
function fmtFormal(d: string | null | undefined): string {
  if (!d) return "N/A"
  const dt = new Date(d)
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  return `${days[dt.getDay()]}, ${ordinal(dt.getDate())} ${months[dt.getMonth()]}, ${dt.getFullYear()}`
}

// Add one day to a date string
function addDay(d: string): string {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString().split("T")[0]
}

export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const memoId = request.nextUrl.searchParams.get("memo_id")

    if (!memoId) {
      return NextResponse.json({ error: "memo_id parameter required" }, { status: 400 })
    }

    // Verify caller is authenticated
    const sessionClient = await createSessionClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ── Fetch the approved deferment record ──────────────────────────────────
    const { data: req, error: reqErr } = await admin
      .from("leave_deferment_requests")
      .select(`
        id, user_id, leave_plan_request_id,
        requested_deferment_year, requested_deferment_period,
        deferment_start_date, deferment_end_date,
        rescheduled_start_date, rescheduled_end_date,
        reason, hr_office_decision, hr_office_reviewed_at,
        hr_office_reviewed_by, hod_reviewed_by, created_at
      `)
      .eq("id", memoId)
      .eq("hr_office_decision", "approved")
      .maybeSingle()

    if (reqErr || !req) {
      return NextResponse.json({ error: "Deferment approval not found" }, { status: 404 })
    }

    // ── Fetch staff profile (including assigned location) ───────────────────
    const { data: staff } = await admin
      .from("user_profiles")
      .select("first_name, last_name, employee_id, position, department_id, assigned_location_id")
      .eq("id", req.user_id)
      .maybeSingle()

    const { data: staffDept } = staff?.department_id
      ? await admin.from("departments").select("name").eq("id", staff.department_id).maybeSingle()
      : { data: null }

    // ── Fetch staff assigned location from geofence_locations ───────────────
    const { data: staffLocation } = staff?.assigned_location_id
      ? await admin.from("geofence_locations").select("name").eq("id", staff.assigned_location_id).maybeSingle()
      : { data: null }

    // ── Fetch leave plan for days/travel info ───────────────────────────────
    const { data: plan } = req.leave_plan_request_id
      ? await admin
          .from("leave_plan_requests")
          .select("adjusted_days, travelling_days_added, adjusted_start_date, adjusted_end_date, preferred_start_date, preferred_end_date")
          .eq("id", req.leave_plan_request_id)
          .maybeSingle()
      : { data: null }

    // ── Fetch HR reviewer (signer) ──────────────────────────────────────────
    const { data: signer } = req.hr_office_reviewed_by
      ? await admin
          .from("user_profiles")
          .select("first_name, last_name, position, signature_data_url")
          .eq("id", req.hr_office_reviewed_by)
          .maybeSingle()
      : { data: null }

    // ── Fetch HOD for THRO' block ────────────────────────────────────────────
    const { data: hod } = req.hod_reviewed_by
      ? await admin
          .from("user_profiles")
          .select("first_name, last_name, position, department_id")
          .eq("id", req.hod_reviewed_by)
          .maybeSingle()
      : { data: null }

    // If no HOD on record, try to find the dept head of staff's department
    let hodFallback: { first_name: string; last_name: string; position: string } | null = null
    if (!hod && staff?.department_id) {
      const { data: deptHead } = await admin
        .from("user_profiles")
        .select("first_name, last_name, position")
        .eq("department_id", staff.department_id)
        .ilike("position", "%head%")
        .maybeSingle()
      hodFallback = deptHead
    }

    // ── Build display strings ────────────────────────────────────────────────
    const staffName = staff
      ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim().toUpperCase()
      : "STAFF MEMBER"
    const staffSNo     = staff?.employee_id || "N/A"
    const staffPos     = (staff?.position || "STAFF").toUpperCase()
    const deptName     = (staffDept?.name || "").toUpperCase()

    const hodData      = hod || hodFallback
    const hodTitle     = hodData
      ? `THE ${(hodData.position || "HEAD OF DEPARTMENT").toUpperCase()}`
      : `THE HEAD OF ${deptName || "DEPARTMENT"}`

    const signerName   = signer
      ? `${signer.first_name || ""} ${signer.last_name || ""}`.trim().toUpperCase()
      : "HR MANAGER"
    const signerPos    = (signer?.position || "HR MANAGER").toUpperCase()

    const approvalYear = req.hr_office_reviewed_at
      ? new Date(req.hr_office_reviewed_at).getFullYear()
      : new Date().getFullYear()

    // Rescheduled dates
    const newStart = req.rescheduled_start_date || req.deferment_start_date
    const newEnd   = req.rescheduled_end_date   || req.deferment_end_date

    // Working days and travel days
    const workDays   = plan?.adjusted_days || 0
    const travelDays = plan?.travelling_days_added || 0

    // Resume date = day after new end
    const resumeDate = newEnd ? addDay(newEnd) : null

    // Deterministic ref
    const shortId = memoId.replace(/-/g, "").substring(0, 4).toUpperCase()
    const refNo   = `QCC/HR/DEF/${approvalYear}/${shortId}`

    const requestDate = req.created_at
      ? new Date(req.created_at).toLocaleDateString("en-GB")
      : "N/A"

    // ── PDF Setup ────────────────────────────────────────────────────────────
    const doc        = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageW      = doc.internal.pageSize.getWidth()
    const pageH      = doc.internal.pageSize.getHeight()
    const marginL    = 25
    const marginR    = 25
    const contentW   = pageW - marginL - marginR

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

    // ── Staff address block (top-left) ───────────────────────────────────────
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(`${staffName} (S/NO. ${staffSNo})`, marginL, y)
    y += 5.5
    doc.text(staffPos, marginL, y)
    y += 10

    // THRO' block
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("THRO':", marginL, y)
    const throcol = marginL + 16
    doc.text(hodTitle, throcol, y)
    y += 5.5
    doc.text("QUALITY CONTROL COMPANY LTD.", throcol, y)
    y += 5.5
    doc.text("HEAD OFFICE, ACCRA", throcol, y)
    y += 12

    // ── Subject (bold, underlined) ───────────────���────────────────────────────
    const subject = `APPROVAL FOR DEFERMENT / RESCHEDULING OF ${approvalYear} ANNUAL VACATION LEAVE`
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    // Underline manually
    const subjW = doc.getTextWidth(subject)
    doc.text(subject, marginL, y)
    doc.setLineWidth(0.3)
    doc.setDrawColor(0, 0, 0)
    doc.line(marginL, y + 1, marginL + subjW, y + 1)
    y += 10

    // ── Body paragraph 1 ─────────────────────────────────────────────────────
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)

    const p1 = `We refer to our letter no. ${refNo} dated ${requestDate} and wish to inform you that Management has granted approval for your ${approvalYear} annual vacation leave to be rescheduled to ${newStart ? fmtFormal(newStart) : "the approved date"}.`
    const p1lines = doc.splitTextToSize(p1, contentW)
    p1lines.forEach((l: string) => { doc.text(l, marginL, y); y += 5.5 })
    y += 4

    // ── Body paragraph 2 — days + bold dates ─────────────────────────────────
    if (newStart && newEnd) {
      const daysText = workDays > 0
        ? `annual vacation leave of ${numWords(workDays)} (${workDays}) working days${travelDays > 0 ? ` plus ${numWords(travelDays)} (${travelDays}) travelling days` : ""}`
        : "annual vacation leave"

      // "Accordingly, your [days] shall take effect from " (normal) BOLD dates (normal) .
      const pre  = `Accordingly, your ${daysText} shall take effect from `
      const bold = `${fmtFormal(newStart)} to ${fmtFormal(newEnd)}.`

      // Render pre-text then bold dates on same line
      doc.setFont("helvetica", "normal")
      const preLines = doc.splitTextToSize(pre + bold, contentW)
      // Simple approach: render the combined text, then bold the last segment
      // Use two-pass: measure pre then bold
      const preTrimmed = pre.trimEnd()
      doc.text(preTrimmed, marginL, y)
      const preW = doc.getTextWidth(preTrimmed + " ")
      doc.setFont("helvetica", "bold")
      doc.text(bold, marginL + preW, y)
      doc.setFont("helvetica", "normal")
      y += 5.5

      // Check if text wrapped (crude: if bold block is wide enough to need second line, add spacing)
      if (doc.getTextWidth(pre + bold) > contentW) y += 5.5
      y += 4

      // Resume line
      if (resumeDate) {
        const resumePre  = "You are expected to resume duty on "
        const resumeBold = `${fmtFormal(resumeDate)}.`
        doc.setFont("helvetica", "normal")
        doc.text(resumePre, marginL, y)
        const rPreW = doc.getTextWidth(resumePre)
        doc.setFont("helvetica", "bold")
        doc.text(resumeBold, marginL + rPreW, y)
        doc.setFont("helvetica", "normal")
        y += 5.5
        y += 4
      }
    }

    // ── Closing ───────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "normal")
    doc.text("We wish you a pleasant and relaxing vacation.", marginL, y)
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
    doc.text(signerName, marginL, y);      y += 5.5
    doc.text(signerPos, marginL, y);       y += 5.5
    doc.text("FOR: MANAGING DIRECTOR", marginL, y); y += 12

    // ── CC block ─────────────────────────────────────────────────────────────
    doc.setFontSize(9.5)
    doc.setFont("helvetica", "normal")
    doc.text("cc:", marginL, y)
    const ccItems = [
      "Managing Director",
      "Dep. Director, HR",
      "Deputy Director, Finance",
      "Audit Manager",
    ]
    const ccX = marginL + 14
    ccItems.forEach(item => { doc.text(item, ccX, y); y += 5 })

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(
      `Ref: ${refNo}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
      pageW / 2, pageH - 8, { align: "center" }
    )

    // ── Output ────────────────────────────────────────────────────────────────
    const pdfBuf  = Buffer.from(doc.output("arraybuffer"))
    const fnStaff = staffName.replace(/\s+/g, "-").toLowerCase()
    const filename = `deferment-approval-${fnStaff}-${approvalYear}.pdf`

    return new NextResponse(pdfBuf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuf.length),
      },
    })
  } catch (err) {
    console.error("[v0] Deferment PDF error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 500 }
    )
  }
}

// Convert small integers to words for "twenty-eight (28) working days"
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
