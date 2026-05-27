import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { generateProfessionalMemoPDF } from "@/lib/professional-memo-generator"
import AdmZip from "adm-zip"

export const dynamic = "force-dynamic"

/**
 * GET: Download multiple payment advice memos as ZIP file
 * Query params:
 * - memo_ids: Comma-separated list of memo IDs to download
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const memoIds = searchParams.get("memo_ids")

    if (!memoIds) {
      return NextResponse.json({ error: "memo_ids required" }, { status: 400 })
    }

    const admin = await createAdminClient()
    const idList = memoIds.split(",").map(id => id.trim())

    // Fetch all memos
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select(
        `
        id,
        staff_name,
        staff_number,
        memo_subject,
        memo_body,
        leave_period_start,
        leave_period_end,
        approved_days,
        hr_leave_office_name,
        signer_name,
        signature_data_url,
        created_at
      `
      )
      .in("id", idList)

    if (error || !memos || memos.length === 0) {
      console.error("[v0] Error fetching memos for batch download:", error)
      return NextResponse.json({ error: "No memos found" }, { status: 404 })
    }

    // Create ZIP file
    const zip = new AdmZip()

    // Generate PDFs for each memo
    for (const memo of memos) {
      try {
        // Parse memo_body if needed
        let memoBodies: any = {}
        if (memo.memo_body) {
          try {
            memoBodies = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
          } catch (e) {
            console.warn("[v0] Failed to parse memo_body:", e)
          }
        }

        // Generate PDF
        const pdfBuffer = await generateProfessionalMemoPDF({
          ...memo,
          memo_body: memoBodies,
          signatory: {
            name: memo.signer_name || "HR Manager",
            signature_image_url: memo.signature_data_url,
          },
        })

        // Add to ZIP
        const fileName = `Payment-Advice-${memo.staff_name.replace(/\s+/g, "-")}-${new Date(memo.created_at).toISOString().split("T")[0]}.pdf`
        zip.addFile(fileName, pdfBuffer)
      } catch (e) {
        console.error("[v0] Error generating PDF for memo:", memo.id, e)
        // Continue with other memos instead of failing entire request
      }
    }

    console.log("[v0] ZIP file created successfully with", memos.length, "memos")

    // Create response with ZIP
    const zipBuffer = zip.toBuffer()
    const response = new NextResponse(zipBuffer)
    response.headers.set("Content-Type", "application/zip")
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="Payment-Advice-Batch-${new Date().toISOString().split("T")[0]}.zip"`
    )

    return response
  } catch (err) {
    console.error("[v0] Error creating batch download:", err)
    return NextResponse.json(
      { error: "Failed to create ZIP file", details: String(err) },
      { status: 500 }
    )
  }
}
