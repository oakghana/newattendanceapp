import { NextRequest, NextResponse } from "next/server"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

// Helper: Format date for memo
function fmtDate(value?: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-GH", { day: "2-digit", month: "long", year: "numeric" })
}

// Helper: Formal date format
function fmtFormalDate(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return fmtDate(value)
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const ordinalSuffix = (n: number) => {
    const v = n % 100
    const s = ["th", "st", "nd", "rd"]
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  return `${ordinalSuffix(date.getDate())} ${MONTH_NAMES[date.getMonth()]}, ${date.getFullYear()}`
}

// Helper: Pick best signature from registry (proven pattern from payment advice)
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

export async function POST(request: NextRequest, context: any) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = await context.params
    const { memoId, memoType } = params // memoType: "deferment" or "recall"

    if (!memoId || !memoType) {
      return NextResponse.json({ error: "Missing memo ID or type" }, { status: 400 })
    }

    let memoData = null
    let memoTable = ""
    let signerUserId: string | null = null

    if (memoType === "deferment") {
      const { data: memo } = await admin
        .from("deferment_memos")
        .select(`
          *,
          deferment_request:leave_deferment_requests (
            id, status, reason, requested_deferment_year, requested_deferment_period,
            deferment_start_date, deferment_end_date
          ),
          staff:user_profiles!deferment_memos_staff_id_fkey (
            id, first_name, last_name, employee_id, position, department_id, departments(name)
          ),
          hod:user_profiles!deferment_memos_hod_id_fkey (
            id, first_name, last_name
          )
        `)
        .eq("id", memoId)
        .single()

      memoData = memo
      memoTable = "deferment_memos"
      signerUserId = memo?.signer_id || null
    } else if (memoType === "recall") {
      const { data: memo } = await admin
        .from("recall_memos")
        .select(`
          *,
          recall_request:leave_recall_requests (
            id, status, recall_reason, recall_notes, recall_date
          ),
          staff:user_profiles!recall_memos_staff_id_fkey (
            id, first_name, last_name, employee_id, position, department_id, departments(name)
          )
        `)
        .eq("id", memoId)
        .single()

      memoData = memo
      memoTable = "recall_memos"
      signerUserId = memo?.signer_id || null
    }

    if (!memoData) {
      return NextResponse.json({ error: "Memo not found" }, { status: 404 })
    }

    // Parse memo_body if it's JSON
    let memoBody = memoData.memo_body
    if (typeof memoBody === "string") {
      try {
        memoBody = JSON.parse(memoBody)
      } catch (e) {
        console.warn("[v0] Failed to parse memo_body:", e)
      }
    }

    // Smart signature fetching (proven pattern from payment advice)
    let signerSignatureUrl = memoData.signature_image_url || memoBody?.selectedSigner?.signature_data_url || ""
    
    // Priority 1: Check approval_signature_registry for signer (pickBestSignature)
    if (!signerSignatureUrl && signerUserId) {
      console.log("[v0] Fetching signature from registry for signer:", signerUserId)
      const { data: signatureRecords } = await admin
        .from("approval_signature_registry")
        .select("id, signature_data_url, signature_mode, signature_text, is_active")
        .eq("user_id", signerUserId)
      
      if (signatureRecords && signatureRecords.length > 0) {
        const bestSig = pickBestSignature(signatureRecords)
        if (bestSig?.signature_data_url) {
          signerSignatureUrl = bestSig.signature_data_url
          console.log("[v0] Found signature in registry for memo")
        }
      }
    }
    
    // Priority 2: Check user_profiles for signer
    if (!signerSignatureUrl && signerUserId) {
      console.log("[v0] Fetching signature from user_profiles for signer:", signerUserId)
      const { data: signerProfile } = await admin
        .from("user_profiles")
        .select("signature_data_url")
        .eq("id", signerUserId)
        .single()
      
      if (signerProfile?.signature_data_url) {
        signerSignatureUrl = signerProfile.signature_data_url
        console.log("[v0] Found signature in user_profiles for memo")
      }
    }

    // Create PDF
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginLeft = 20
    const marginRight = 20
    const marginTop = 20
    const contentWidth = pageWidth - marginLeft - marginRight
    let y = marginTop

    // Header
    doc.setFontSize(16)
    doc.setFont(undefined, "bold")
    doc.text("OFFICIAL MEMORANDUM", pageWidth / 2, y, { align: "center" })
    y += 10

    // Memo info
    doc.setFontSize(10)
    doc.setFont(undefined, "normal")
    const memoDate = fmtFormalDate(memoData.generated_at || new Date().toISOString())
    doc.text(`Date: ${memoDate}`, marginLeft, y)
    y += 8

    // TO field
    doc.setFont(undefined, "bold")
    doc.text("TO:", marginLeft, y)
    doc.setFont(undefined, "normal")
    const staffName = memoData.staff ? `${memoData.staff.first_name} ${memoData.staff.last_name}` : "Staff Member"
    const staffPosition = memoData.staff?.position || "Position N/A"
    doc.text(staffName, marginLeft + 10, y)
    y += 6
    doc.text(staffPosition, marginLeft + 10, y)
    y += 10

    // Subject line
    doc.setFont(undefined, "bold")
    const subject = memoType === "deferment" 
      ? "LEAVE DEFERMENT APPROVAL NOTIFICATION"
      : "LEAVE RECALL NOTIFICATION"
    doc.text("SUBJECT:", marginLeft, y)
    doc.setFont(undefined, "normal")
    const subjectWrapped = doc.splitTextToSize(subject, contentWidth - 30)
    doc.text(subjectWrapped, marginLeft + 25, y)
    y += 10 + (subjectWrapped.length - 1) * 5

    // Body content
    doc.setFont(undefined, "normal")
    doc.setFontSize(11)

    if (memoType === "deferment") {
      const content = `
Dear ${staffName},

This is to notify you that your application for leave deferment has been reviewed and approved by the Human Resources Office.

Leave Details:
• Leave Type: ${memoBody.leave_type || "Annual Leave"}
• Original Period: ${fmtDate(memoBody.original_start_date)} to ${fmtDate(memoBody.original_end_date)}
• Number of Days: ${memoBody.requested_days || "N/A"}
• Deferment Reason: ${memoBody.deferment_reason || "As requested"}
• Deferred to Year: ${memoBody.deferred_to_year || "N/A"}
• Deferred to Period: ${memoBody.deferred_to_period || "N/A"}

Please make arrangements to take your deferred leave during the specified period.

Yours faithfully,
`.trim()

      const contentLines = doc.splitTextToSize(content, contentWidth)
      doc.text(contentLines, marginLeft, y)
      y += contentLines.length * 5 + 15

    } else if (memoType === "recall") {
      const content = `
Dear ${staffName},

This is to formally notify you that your leave has been recalled by management.

Recall Details:
• Leave Type: ${memoBody.leave_type || "Annual Leave"}
• Original Period: ${fmtDate(memoBody.original_start_date)} to ${fmtDate(memoBody.original_end_date)}
• Recall Date: ${fmtDate(memoBody.recall_date)}
• Recall Reason: ${memoBody.recall_reason || "As per operational needs"}
• Additional Notes: ${memoBody.recall_notes || "None"}

You are required to resume duty on the specified recall date.

Yours faithfully,
`.trim()

      const contentLines = doc.splitTextToSize(content, contentWidth)
      doc.text(contentLines, marginLeft, y)
      y += contentLines.length * 5 + 15
    }

    // Signature block
    doc.setFont(undefined, "bold")
    doc.setFontSize(10)
    doc.text("APPROVED BY:", marginLeft, y)
    doc.setFont(undefined, "normal")

    y += 8

    // Add signature image if available - RENDER ABOVE NAME (critical fix)
    if (signerSignatureUrl && signerSignatureUrl.length > 10) {
      try {
        if (signerSignatureUrl.startsWith("data:image/")) {
          // Base64 data URL
          const b64Match = signerSignatureUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (b64Match) {
            const imageType = b64Match[1].toUpperCase() === "JPEG" ? "JPEG" : "PNG"
            doc.addImage(signerSignatureUrl, imageType, marginLeft, y, 40, 15)
            y += 18
            console.log("[v0] Signature rendered from data URL")
          }
        } else if (signerSignatureUrl.startsWith("https://")) {
          // External URL - fetch and embed
          try {
            const sigResponse = await fetch(signerSignatureUrl)
            if (sigResponse.ok) {
              const sigBuffer = await sigResponse.arrayBuffer()
              const base64Sig = Buffer.from(sigBuffer).toString('base64')
              const contentType = sigResponse.headers.get('content-type') || 'image/png'
              const imageType = contentType.includes('jpeg') || contentType.includes('jpg') ? 'JPEG' : 'PNG'
              const dataUrl = `data:${contentType};base64,${base64Sig}`
              doc.addImage(dataUrl, imageType, marginLeft, y, 40, 15)
              y += 18
              console.log("[v0] Signature rendered from external URL")
            }
          } catch (fetchErr) {
            console.warn("[v0] Could not fetch signature from URL:", fetchErr)
            // Draw placeholder line
            doc.setDrawColor(150, 150, 150)
            doc.setLineWidth(0.2)
            doc.line(marginLeft, y + 8, marginLeft + 50, y + 8)
            y += 12
          }
        }
      } catch (err) {
        console.warn("[v0] Failed to add signature image:", err)
        // Draw placeholder line
        doc.setDrawColor(150, 150, 150)
        doc.setLineWidth(0.2)
        doc.line(marginLeft, y + 8, marginLeft + 50, y + 8)
        y += 12
      }
    } else {
      // No signature - draw placeholder line
      doc.setDrawColor(150, 150, 150)
      doc.setLineWidth(0.2)
      doc.line(marginLeft, y + 8, marginLeft + 50, y + 8)
      y += 12
    }

    // Signer name and position (BELOW SIGNATURE IMAGE)
    doc.setFont(undefined, "bold")
    doc.text(memoData.signer_name || "To Be Determined", marginLeft, y)
    y += 5
    doc.setFont(undefined, "normal")
    doc.setFontSize(9)
    doc.text(memoData.signer_position || "HR Executive", marginLeft, y)
    y += 8

    // Footer
    doc.setFontSize(8)
    doc.setFont(undefined, "italic")
    doc.setTextColor(128, 128, 128)
    const footerText = `This is an electronically generated document. Reference: ${memoType}_${String(memoId).slice(0, 8)}`
    doc.text(footerText, marginLeft, pageHeight - 10)

    // Generate PDF and return
    const pdf = doc.output("arraybuffer")
    const filename = `${memoType}-memo-${String(memoId).slice(0, 8)}.pdf`

    console.log("[v0] Memo PDF generated:", memoType, memoId, "Signature:", signerSignatureUrl ? "YES" : "NO")

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error in memo renderer:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
