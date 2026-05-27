import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { generateProfessionalMemoPDF } from "@/lib/professional-memo-generator"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET: Download a single payment advice memo as PDF
 * Query params:
 * - memo_id: The ID of the memo to download
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const memoId = searchParams.get("memo_id")

    if (!memoId) {
      console.error("[v0] Download endpoint missing memo_id")
      return NextResponse.json({ error: "memo_id required" }, { status: 400 })
    }

    console.log("[v0] Download requested for memo:", memoId)

    // Check authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.warn("[v0] Download: Unauthenticated request for memo:", memoId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Fetch the memo with all required data
    const { data: memo, error } = await admin
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
      .eq("id", memoId)
      .single()

    if (error || !memo) {
      console.error("[v0] Error fetching memo for download:", error || "Not found")
      return NextResponse.json({ error: "Memo not found" }, { status: 404 })
    }

    console.log("[v0] Memo fetched successfully:", memoId, "Status:", memo.status)

    // Parse memo_body if needed
    let memoBodies: any = {}
    if (memo.memo_body) {
      try {
        memoBodies = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
      } catch (e) {
        console.warn("[v0] Failed to parse memo_body:", e)
      }
    }

    // Generate PDF using the professional memo generator
    console.log("[v0] Generating PDF for memo:", memoId)
    const pdfBuffer = await generateProfessionalMemoPDF({
      ...memo,
      memo_body: memoBodies,
      signatory: {
        name: memo.signer_name || memo.hr_leave_office_name || "HR Manager",
        title: "HUMAN RESOURCE MANAGER",
        signature_image_url: memo.signature_data_url,
      },
    })

    console.log("[v0] PDF generated successfully for memo:", memoId, "Size:", pdfBuffer?.length || 0, "bytes")

    // Create response with PDF
    const response = new NextResponse(pdfBuffer)
    response.headers.set("Content-Type", "application/pdf")
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="Payment-Advice-${memo.staff_name.replace(/\s+/g, "-")}-${new Date(memo.created_at).toISOString().split("T")[0]}.pdf"`
    )
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")

    return response
  } catch (err) {
    console.error("[v0] Error downloading memo:", err)
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(err) },
      { status: 500 }
    )
  }
}
