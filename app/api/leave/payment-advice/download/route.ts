import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Helper: Format date for memo — returns empty string if no date (never falls back to today)
function fmtDate(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

// Helper: Format month/year label for subject line
function fmtMonthYear(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase()
}

// Helper: Get best signature from registry (proven pattern)
function pickBestSignature(rows: any[]): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const active = rows.filter((row) => row?.is_active !== false)
  const pool = active.length > 0 ? active : rows

  const score = (row: any) => {
    const mode = String(row?.signature_mode || "").toLowerCase()
    const hasImage = (mode === "draw" || mode === "upload") && String(row?.signature_data_url || "").trim().length > 0
    const hasTyped = mode === "typed" && String(row?.signature_text || "").trim().length > 0
    return hasImage ? 100 : hasTyped ? 10 : 0
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] || null
}

/**
 * GET: Download payment advice memo in professional QCC letter format
 * Uses proven leave memo pattern with proper signature fetching and rendering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const memoId = searchParams.get("memo_id")

    if (!memoId) {
      return NextResponse.json({ error: "memo_id required" }, { status: 400 })
    }



    // Auth check — must use createClient (session-aware) not createAdminClient
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use admin client to bypass RLS for the memo lookup
    const admin = await createAdminClient()

    // Fetch memo — no user-id filter so HR and staff can both download
    const { data: memo, error } = await admin
      .from("leave_payment_memos")
      .select(`
        id, staff_id, staff_name, staff_number, memo_subject, memo_body,
        leave_period_start, leave_period_end, approved_days,
        hr_leave_office_name, signer_id, signer_name,
        signature_data_url, created_at, status, staff_category
      `)
      .eq("id", memoId)
      .maybeSingle()

    if (error) {
      console.error("[v0] Payment advice DB error:", error)
      return NextResponse.json(
        { error: "Failed to fetch memo", details: error.message },
        { status: 500 }
      )
    }

    if (!memo) {
      console.error("[v0] Memo not found by id:", memoId)
      return NextResponse.json({ error: "Memo not found" }, { status: 404 })
    }

    // Signature priority: 1) stored on memo, 2) signer's user_profiles, 3) registry, 4) current user's profile
    let signatureUrl: string | null = memo.signature_data_url || null
    let signerName = memo.signer_name || memo.hr_leave_office_name || "HUMAN RESOURCE MANAGER"

    if (!signatureUrl) {
      // Try signer_id's user_profiles first
      const signerIdToCheck = memo.signer_id || user.id
      const { data: signerProfile } = await admin
        .from("user_profiles")
        .select("signature_data_url, first_name, last_name, position")
        .eq("id", signerIdToCheck)
        .single()

      if (signerProfile?.signature_data_url) {
        signatureUrl = signerProfile.signature_data_url
        // If we fell back to current user, use their name
        if (!memo.signer_id && signerProfile.first_name) {
          signerName = `${signerProfile.first_name} ${signerProfile.last_name}`.toUpperCase()
        }
      }

      // Fallback to approval_signature_registry
      if (!signatureUrl) {
        const { data: signatureRecords } = await admin
          .from("approval_signature_registry")
          .select("id, signature_data_url, signature_mode, signature_text, is_active, user_id")
          .eq("user_id", signerIdToCheck)

        if (signatureRecords) {
          const bestSig = pickBestSignature(signatureRecords)
          if (bestSig?.signature_data_url) {
            signatureUrl = bestSig.signature_data_url
          }
        }
      }
    }

    // Parse memo body to extract staff list and approval metadata
    let staffList: any[] = []
    let approvedAt: string | null = null
    let approverPosition: string | null = null
    if (memo.memo_body) {
      try {
        const body = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
        const rawList: any[] = body.staffList || body.staff || []
        // Enrich each staff record — if position or location_name is blank, try memo-level columns
        staffList = rawList.map((s: any) => ({
          ...s,
          position: s.position || s.rank || memo.staff_position || "",
          location_name: s.location_name || s.assigned_location_name || s.location || s.station || memo.staff_location_name || "",
        }))
        // Use the approval date stored at approval time — NOT today's date
        approvedAt = body.approver?.approved_at || null
        approverPosition = body.selectedSigner?.position || body.approver?.position || null
        if (approverPosition) {
          // Override signerName with the stored approver name from memo_body
          const approverName = body.approver?.name || body.selectedSigner?.name
          if (approverName) signerName = approverName
        }
      } catch (e) {
        console.warn("[v0] Could not parse memo_body")
      }
    }

    // The memo date is the approval date; fall back to created_at only if not yet approved
    const memoDateStr = approvedAt || memo.created_at
    const memoDate = new Date(memoDateStr)

    // Create professional QCC memorandum format PDF
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - 2 * margin
    let y = margin

    // === LEFT SIDE HEADER ===
    doc.setFontSize(11)
    doc.setFont(undefined, "bold")
    doc.text("QUALITY CONTROL COMPANY LTD.", margin, y)
    y += 5
    doc.setFontSize(9)
    doc.setFont(undefined, "normal")
    doc.text("(COCOBOD)", margin, y)
    y += 4
    doc.text("P.O. BOX M54", margin, y)
    y += 4
    doc.text("ACCRA", margin, y)

    // === VERTICAL DIVIDER LINE ===
    const dividerX = pageWidth / 2 - 0.5
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(dividerX, margin + 2, dividerX, margin + 18)

    // === RIGHT SIDE: MEMORANDUM HEADER ===
    doc.setFontSize(12)
    doc.setFont(undefined, "bold")
    doc.text("MEMORANDUM", pageWidth / 2 + 15, margin + 5, { align: "center" })

    // Date on right
    doc.setFontSize(9)
    doc.setFont(undefined, "normal")
    doc.text(`DATE: ${fmtDate(memoDateStr)}`, pageWidth / 2 + 15, margin + 13, { align: "center" })

    y = margin + 22

    // === REFERENCE NUMBER ===
    const refNo = `QCC/HR/PA/${memoDate.getFullYear()}/${String(memoDate.getMonth() + 1).padStart(2, "0")}/MGT/${String(memoId).substring(0, 3).toUpperCase()}`
    doc.setFontSize(9)
    doc.setFont(undefined, "bold")
    doc.text(`REF. NO: ${refNo}`, margin, y)
    y += 7

    // === HORIZONTAL DIVIDER ===
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // === TO / FROM / SUBJECT ===
    doc.setFontSize(9)
    doc.setFont(undefined, "bold")
    doc.text("TO:", margin, y)
    doc.setFont(undefined, "normal")
    doc.text("DEPUTY DIRECTOR, FINANCE", margin + 15, y)
    y += 6

    doc.setFont(undefined, "bold")
    doc.text("FROM:", margin, y)
    doc.setFont(undefined, "normal")
    // Use the actual approver's position from memo_body (set at approval time)
    const fromPosition = (approverPosition || "HUMAN RESOURCE MANAGER").toUpperCase()
    doc.text(fromPosition, margin + 15, y)
    y += 6

    doc.setFont(undefined, "bold")
    doc.text("SUBJECT:", margin, y)
    doc.setFont(undefined, "normal")
    
    // Use approval date for subject month/year — NOT today
    const categoryLabel = memo.staff_category ? `(${memo.staff_category.toUpperCase()} STAFF)` : ""
    const monthYear = fmtMonthYear(memoDateStr)
    const subject = `PAYMENT OF LEAVE ALLOWANCE ${categoryLabel} – ${monthYear}`
    const subjectLines = doc.splitTextToSize(subject, contentWidth - 30)
    doc.text(subjectLines, margin + 30, y)
    y += (subjectLines.length * 4) + 6

    // === BODY TEXT ===
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    
    const staffCount = staffList.length > 0 ? staffList.length : 1
    const bodyText1 = `We wish to inform you that the attached list of ${staffCount} ${memo.staff_category ? memo.staff_category + " " : ""}staff are scheduled to proceed on their annual vacation leave in ${monthYear}.`
    const bodyLines1 = doc.splitTextToSize(bodyText1, contentWidth)
    doc.text(bodyLines1, margin, y)
    y += bodyLines1.length * 4 + 4

    const bodyText2 = "We, therefore, kindly request you to process and pay their leave allowances accordingly."
    const bodyLines2 = doc.splitTextToSize(bodyText2, contentWidth)
    doc.text(bodyLines2, margin, y)
    y += bodyLines2.length * 4 + 4

    // === STAFF TABLE ===
    // Build fallback single-staff row extracting position/location from memo_body if needed
    const fallbackPosition = (() => { 
      try { 
        const b = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
        return b?.staffList?.[0]?.position || b?.staffList?.[0]?.rank || "" 
      } catch { 
        return "" 
      } 
    })()
    const fallbackLocation = (() => { 
      try { 
        const b = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
        return b?.staffList?.[0]?.location_name || b?.staffList?.[0]?.assigned_location_name || b?.staffList?.[0]?.location || "" 
      } catch { 
        return "" 
      } 
    })()

    const tableData = (staffList.length > 0 ? staffList : [
      {
        name: memo.staff_name,
        employeeId: memo.staff_number,
        position: fallbackPosition,
        location_name: fallbackLocation,
        leaveDate: fmtDate(memo.leave_period_start),
      },
    ]).map((s: any, idx: number) => [
      String(idx + 1),
      s.name || s.staff_name || "",
      s.employeeId || s.staff_number || s.sno || "",
      s.position || s.rank || "",
      s.location_name || s.assigned_location_name || s.location || s.station || s.workStation || "",
      s.leaveDate || fmtDate(memo.leave_period_start),
    ])

    autoTable(doc, {
      head: [["NO", "NAME", "S/NO", "POSITION", "LOCATION", "LEAVE DATE"]],
      body: tableData,
      startY: y,
      margin: margin,
      headStyles: { 
        fillColor: [101, 67, 33],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        valign: "middle",
        lineWidth: 0.3,
      },
      bodyStyles: { 
        fontSize: 8,
        lineWidth: 0.3,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 32, halign: "left" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 23, halign: "left" },
        4: { cellWidth: 23, halign: "left" },
        5: { cellWidth: 22, halign: "center" },
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    })

    y = (doc as any).lastAutoTable.finalY + 8

    // === CLOSING TEXT ===
    doc.setFontSize(9)
    doc.setFont(undefined, "normal")
    doc.text("We count on your co-operation.", margin, y)
    y += 10

    // === ADD SIGNATURE IMAGE ABOVE NAME ===
    if (signatureUrl && signatureUrl.length > 10) {
      try {
        if (signatureUrl.startsWith("data:image/")) {
          const b64Match = signatureUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (b64Match) {
            const imageType = b64Match[1].toUpperCase() === "JPEG" ? "JPEG" : "PNG"
            doc.addImage(signatureUrl, imageType, margin, y, 40, 15)
            y += 16
          }
        } else if (signatureUrl.startsWith("https://")) {
          try {
            const sigResponse = await fetch(signatureUrl)
            if (sigResponse.ok) {
              const sigBuffer = await sigResponse.arrayBuffer()
              const base64Sig = Buffer.from(sigBuffer).toString('base64')
              const contentType = sigResponse.headers.get('content-type') || 'image/png'
              const imageType = contentType.includes('jpeg') || contentType.includes('jpg') ? 'JPEG' : 'PNG'
              const dataUrl = `data:${contentType};base64,${base64Sig}`
              doc.addImage(dataUrl, imageType, margin, y, 40, 15)
              y += 16
            }
          } catch {
            y += 4
          }
        }
      } catch {
        y += 4
      }
    } else {
      y += 4
    }

    // === SIGNER NAME AND TITLE (BELOW SIGNATURE) ===
    doc.setFont(undefined, "bold")
    doc.setFontSize(9)
    doc.text(signerName, margin, y)
    y += 4
    doc.setFont(undefined, "normal")
    doc.text("HUMAN RESOURCE MANAGER", margin, y)
    y += 7

    // === CC SECTION ===
    doc.setFont(undefined, "bold")
    doc.text("cc:", margin, y)
    y += 4
    doc.setFont(undefined, "normal")
    const ccList = ["Managing Director", "Deputy Director, HR", "Audit Manager"]
    ccList.forEach((cc) => {
      doc.text(cc, margin + 5, y)
      y += 4
    })

    // === ADD SECRET FOOTER ===
    const footerY = doc.internal.pageSize.getHeight() - 5
    
    doc.setFontSize(6)
    doc.setTextColor(180, 180, 180) // Light gray
    doc.text("Powered by ITD", pageWidth - 40, footerY, { align: "right" })
    
    // Reset text color for any subsequent content
    doc.setTextColor(0, 0, 0)

    // Convert to buffer and return
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"))
    
    const response = new NextResponse(pdfBuffer)
    response.headers.set("Content-Type", "application/pdf")
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="payment-advice-${memo.staff_name.replace(/\s+/g, "-")}-${memoDateStr.slice(0, 10)}.pdf"`
    )
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")

    return response
  } catch (err) {
    console.error("[v0] Error downloading payment advice memo:", err)
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(err) },
      { status: 500 }
    )
  }
}
