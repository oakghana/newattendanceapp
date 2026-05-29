import { createAdminClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import AdmZip from "adm-zip"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET: Download multiple payment advice memos as ZIP file
 * Calls the single download endpoint for each memo and packages as ZIP
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

    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()
    const idList = memoIds.split(",").map(id => id.trim()).filter(Boolean)

    if (idList.length === 0) {
      return NextResponse.json({ error: "No valid memo IDs provided" }, { status: 400 })
    }

    console.log("[v0] Batch download for", idList.length, "memos")

    // Fetch memo details for ZIP filenames
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select("id, staff_name, created_at")
      .in("id", idList)

    if (error || !memos || memos.length === 0) {
      console.error("[v0] Error fetching memos for batch:", error)
      return NextResponse.json({ error: "No memos found" }, { status: 404 })
    }

    // Create ZIP and add each memo's PDF
    const zip = new AdmZip()
    const baseUrl = new URL(request.url).origin
    let successCount = 0
    let failureCount = 0

    for (const memo of memos) {
      try {
        console.log("[v0] Downloading memo for ZIP:", memo.id)

        // Call the single download endpoint
        const downloadUrl = `${baseUrl}/api/leave/payment-advice/download?memo_id=${memo.id}`
        const pdfResponse = await fetch(downloadUrl, {
          headers: {
            "Cookie": request.headers.get("Cookie") || "",
          },
        })

        if (!pdfResponse.ok) {
          console.warn("[v0] Failed to fetch PDF for memo:", memo.id)
          failureCount++
          continue
        }

        const pdfBuffer = await pdfResponse.arrayBuffer()
        const memoDate = new Date(memo.created_at).toISOString().split("T")[0]
        const filename = `payment-advice-${memo.staff_name.replace(/\s+/g, "-")}-${memoDate}.pdf`

        zip.addFile(filename, Buffer.from(pdfBuffer))
        successCount++
        console.log("[v0] Added to ZIP:", filename)
      } catch (err) {
        failureCount++
        console.error("[v0] Error processing memo for ZIP:", memo.id, err)
      }
    }

    const zipBuffer = zip.toBuffer()
    const response = new NextResponse(zipBuffer)
    response.headers.set("Content-Type", "application/zip")
    response.headers.set("Content-Disposition", `attachment; filename="payment-advice-batch-${new Date().toISOString().split("T")[0]}.zip"`)
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")

    console.log("[v0] Batch ZIP created:", successCount, "successful,", failureCount, "failed")

    return response
  } catch (err) {
    console.error("[v0] Error in batch download:", err)
    return NextResponse.json(
      { error: "Failed to create ZIP file", details: String(err) },
      { status: 500 }
    )
  }
}
