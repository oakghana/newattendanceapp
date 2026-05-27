import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = new URL(request.url).searchParams
    const type = searchParams.get("type") || "all" // "deferment" or "recall"
    const memoType = searchParams.get("memo_type") // "deferment" or "recall"

    const results: { deferments: any[], recalls: any[] } = { deferments: [], recalls: [] }

    // Fetch deferment memos
    if (type === "all" || memoType === "deferment") {
      const { data: memos } = await admin
        .from("deferment_memos")
        .select(`
          *,
          deferment_request:leave_deferment_requests (
            id,
            status,
            reason,
            requested_deferment_year,
            requested_deferment_period,
            deferment_start_date,
            deferment_end_date
          ),
          staff:user_profiles!deferment_memos_staff_id_fkey (
            id,
            first_name,
            last_name,
            employee_id
          ),
          hod:user_profiles!deferment_memos_hod_id_fkey (
            id,
            first_name,
            last_name,
            position
          )
        `)
        .or(`staff_id.eq.${user.id},hod_id.eq.${user.id},hr_signer_id.eq.${user.id}`)
        .order("created_at", { ascending: false })

      if (memos) {
        results.deferments = memos.map(m => ({
          ...m,
          memo_type: "deferment",
          staff_name: m.staff ? `${m.staff.first_name} ${m.staff.last_name}` : "Unknown",
          hod_name: m.hod ? `${m.hod.first_name} ${m.hod.last_name}` : null,
        }))
      }
    }

    // Fetch recall memos
    if (type === "all" || memoType === "recall") {
      const { data: memos } = await admin
        .from("recall_memos")
        .select(`
          *,
          recall_request:leave_recall_requests (
            id,
            status,
            recall_reason,
            recall_notes,
            recall_date
          ),
          staff:user_profiles!recall_memos_staff_id_fkey (
            id,
            first_name,
            last_name,
            employee_id
          )
        `)
        .or(`staff_id.eq.${user.id},hr_signer_id.eq.${user.id}`)
        .order("created_at", { ascending: false })

      if (memos) {
        results.recalls = memos.map(m => ({
          ...m,
          memo_type: "recall",
          staff_name: m.staff ? `${m.staff.first_name} ${m.staff.last_name}` : "Unknown",
        }))
      }
    }

    return NextResponse.json({
      success: true,
      deferment_memos: results.deferments,
      recall_memos: results.recalls,
      total: results.deferments.length + results.recalls.length,
    })
  } catch (error) {
    console.error("[v0] Error fetching memos:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
