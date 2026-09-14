import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch the shared payment advice queue for HR Leave Office
 * Used by the Monthly Summary tab and duplicate checks so officers see requests
 * submitted by every HR Leave Office user.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userProfile, error: profileError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const normalizedRole = String(userProfile?.role || "")
      .toLowerCase()
      .trim()
      .replace(/[-\s]+/g, "_")
    const canViewHrPaymentQueue = ["admin", "hr_leave_office", "leave_office"].includes(normalizedRole)

    if (profileError || !canViewHrPaymentQueue) {
      return NextResponse.json(
        { error: "Only HR Leave Office staff can view submitted payment advice requests" },
        { status: 403 },
      )
    }

    // Get month filter from query params (format: YYYY-MM)
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month")

    // HR Leave Office needs one shared queue. Do not scope this to the
    // current officer, otherwise another officer can create a duplicate.
    let query = admin
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
        hr_leave_office_id,
        hr_leave_office_name,
        created_at,
        updated_at,
        status
      `
      )
      .order("created_at", { ascending: false })

    // Filter by month if provided (format: YYYY-MM)
    if (month) {
      const [year, monthNum] = month.split("-").map(Number)
      // Create proper date range for the month
      const startDate = new Date(year, monthNum - 1, 1) // First day of month
      const endDate = new Date(year, monthNum, 0) // Last day of month
      
      const startISO = startDate.toISOString()
      const endISO = new Date(endDate.getTime() + 86400000).toISOString() // Add 1 day to include entire last day
      
      console.log(`[v0] Monthly Summary: Filtering memos for ${month}`, {
        startISO,
        endISO,
        submittedBy: user.id,
      })
      
      query = query.gte("created_at", startISO).lt("created_at", endISO)
    }

    const { data: memos, error } = await query

    if (error) {
      console.error("[v0] Error fetching submitted payment memos:", {
        error,
        userId: user.id,
        month,
      })
      return NextResponse.json(
        { error: "Failed to fetch your submitted payment advice memos", details: error.message },
        { status: 500 }
      )
    }

    // Enrich memos with signatures and location data
    let enrichedMemos = memos || []
    
    if (enrichedMemos.length > 0) {
      // Extract unique signer IDs from memos
      const signerIds = [...new Set(
        enrichedMemos
          .map((m: any) => {
            try {
              const b = typeof m.memo_body === "string" ? JSON.parse(m.memo_body) : m.memo_body
              return b?.selectedSigner?.id
            } catch { return null }
          })
          .filter(Boolean)
      )]

      // Fetch signer profiles with signatures
      const signerMap: Record<string, { name: string; position: string; signature_data_url: string }> = {}
      if (signerIds.length > 0) {
        const { data: signers } = await admin
          .from("user_profiles")
          .select("id, first_name, last_name, position, signature_data_url")
          .in("id", signerIds)
        
        if (signers) {
          signers.forEach((s: any) => {
            signerMap[s.id] = {
              name: `${s.first_name || ""} ${s.last_name || ""}`.trim(),
              position: s.position || "",
              signature_data_url: s.signature_data_url || "",
            }
          })
        }
      }

      // Enrich each memo with signer signature if missing
      enrichedMemos = enrichedMemos.map((memo: any) => {
        let memoBody: any = {}
        try {
          memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
        } catch { memoBody = {} }

        // Enrich selectedSigner with live signature_data_url if missing
        if (memoBody.selectedSigner?.id && signerMap[memoBody.selectedSigner.id]) {
          const signer = signerMap[memoBody.selectedSigner.id]
          if (!memoBody.selectedSigner.signature_data_url && signer.signature_data_url) {
            memoBody.selectedSigner.signature_data_url = signer.signature_data_url
            return { ...memo, memo_body: JSON.stringify(memoBody) }
          }
        }
        return memo
      })
    }

    console.log(`[v0] Successfully fetched ${enrichedMemos?.length || 0} submitted payment memos`, {
      userId: user.id,
      month,
      memoCount: enrichedMemos?.length || 0,
    })

    return NextResponse.json({
      success: true,
      memos: enrichedMemos || [],
      count: enrichedMemos?.length || 0,
      month,
    })
  } catch (err) {
    console.error("[v0] Unexpected error in my-memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
