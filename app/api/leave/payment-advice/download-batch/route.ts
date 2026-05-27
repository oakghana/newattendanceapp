import { createAdminClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
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
      console.error("[v0] Batch download: Missing memo_ids parameter")
      return NextResponse.json({ error: "memo_ids required" }, { status: 400 })
    }

    console.log("[v0] Batch download requested for memos:", memoIds)

    // Check authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.warn("[v0] Batch download: Unauthenticated request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()
    const idList = memoIds.split(",").map(id => id.trim()).filter(Boolean)

    if (idList.length === 0) {
      return NextResponse.json({ error: "No valid memo IDs provided" }, { status: 400 })
    }

    console.log("[v0] Processing batch download for", idList.length, "memos")

    // Fetch all memos
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select(
        `
        id,
        staff_id,
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
        created_at,
        status
      `
      )
      .in("id", idList)

    if (error || !memos || memos.length === 0) {
      console.error("[v0] Error fetching memos for batch download:", error)
      return NextResponse.json({ error: "No memos found" }, { status: 404 })
    }

    console.log("[v0] Found", memos.length, "memos, generating PDFs...")

    // Create ZIP file
    const zip = new AdmZip()
    let successCount = 0
    let failureCount = 0

    // Generate PDFs for each memo
    for (const memo of memos) {
      try {
        // Parse memo_body if needed
        let memoBodies: any = {}
        if (memo.memo_body) {
          try {
            memoBodies = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
          } catch (e) {
            console.warn("[v0] Failed to parse memo_body for memo:", memo.id)
          }
        }

        // Generate PDF
        const pdfBuffer = await generateProfessionalMemoPDF({
          ...memo,
          memo_body: memoBodies,
          signatory: {
            name: memo.signer_name || memo.hr_leave_office_name || "HR Manager",
            title: "HUMAN RESOURCE MANAGER",
            signature_image_url: memo.signature_data_url,
          },
        })

        // Add to ZIP
        const fileName = `Payment-Advice-${memo.staff_name.replace(/\s+/g, "-")}-${new Date(memo.created_at).toISOString().split("T")[0]}.pdf`
        zip.addFile(fileName, pdfBuffer)
        successCount++
        console.log("[v0] Added to ZIP:", fileName)
      } catch (e) {
        failureCount++
        console.error("[v0] Error generating PDF for memo:", memo.id, e)
        // Continue with other memos instead of failing entire request
      }
    }

    console.log("[v0] ZIP file creation complete:", successCount, "successful,", failureCount, "failed")

    // Create response with ZIP
    const zipBuffer = zip.toBuffer()
    const response = new NextResponse(zipBuffer)
    response.headers.set("Content-Type", "application/zip")
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="Payment-Advice-Batch-${new Date().toISOString().split("T")[0]}.zip"`
    )
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")

    return response
  } catch (err) {
    console.error("[v0] Error creating batch download:", err)
    return NextResponse.json(
      { error: "Failed to create ZIP file", details: String(err) },
      { status: 500 }
    )
  }
}
