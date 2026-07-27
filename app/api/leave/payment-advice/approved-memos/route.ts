import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { isUserAdmin } from "@/lib/admin-bypass"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch all approved payment advice memos for tracking and download
 * ADMINS: See ALL approved memos without RLS restriction
 * HR Executives: See all approved memos via admin client bypass
 */
export async function GET(request: NextRequest) {
  try {
    const userIsAdmin = await isUserAdmin()
    const supabase = await createClient()
    // Always use admin client - admins bypass RLS, HR execs need bypass for permissions
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") || ""

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
        status,
        forwarded_at,
        acknowledged_at,
        payment_amount,
        payment_currency,
        signature_data_url,
        signer_id,
        signer_name
      `
      )
      // HR executives see ALL memos regardless of status — no stage-based restriction
      // DB statuses found: ready_for_review, reviewed_by_hr, forwarded_to_accounts, acknowledged_by_accounts
      .in("status", [
        "ready_for_review",
        "reviewed_by_hr",
        "signed_by_hr_executive",
        "forwarded_to_accounts",
        "acknowledged_by_accounts",
        "approved",
        "completed",
      ])
      .order("updated_at", { ascending: false })

    // Optionally filter by month
    if (month) {
      const startOfMonth = `${month}-01`
      const [year, mon] = month.split("-").map(Number)
      const endOfMonth = new Date(year, mon, 0).toISOString().slice(0, 10)
      query = query.gte("created_at", startOfMonth).lte("created_at", endOfMonth + "T23:59:59")
    }

    const { data: approvedMemos, error } = await query

    if (error) {
      console.error("[v0] Error fetching approved memos:", {
        error,
        userId: user.id,
        month,
      })
      return NextResponse.json(
        { error: "Failed to fetch approved memos", details: error.message },
        { status: 500 }
      )
    }

    // Enrich memos with location from user_profiles + geofence_locations for memos missing location
    const memoList = approvedMemos || []
    const staffIds = [...new Set(memoList.map((m: any) => m.staff_id).filter(Boolean))]

    let locationMap: Record<string, string> = {}
    if (staffIds.length > 0) {
      // Fetch user profiles with assigned_location_id
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, assigned_location_id")
        .in("id", staffIds)

      if (profiles && profiles.length > 0) {
        const locationIds = [...new Set(profiles.map((p: any) => p.assigned_location_id).filter(Boolean))]
        let geoMap: Record<string, string> = {}

        if (locationIds.length > 0) {
          const { data: locations } = await admin
            .from("geofence_locations")
            .select("id, name")
            .in("id", locationIds)
          if (locations) {
            locations.forEach((l: any) => { geoMap[l.id] = l.name })
          }
        }

        profiles.forEach((p: any) => {
          if (p.assigned_location_id && geoMap[p.assigned_location_id]) {
            locationMap[p.id] = geoMap[p.assigned_location_id]
          }
        })
      }
    }

    // Merge location into memo_body where missing & extract staff details
    const enrichedMemos = memoList.map((memo: any) => {
      let memoBody: any = {}
      try {
        memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
      } catch { memoBody = {} }

      if (!memoBody.staff_location_name && locationMap[memo.staff_id]) {
        memoBody.staff_location_name = locationMap[memo.staff_id]
      }

      // Extract staff details from memo_body for combined memo generation
      return {
        ...memo,
        memo_body: JSON.stringify(memoBody),
        // Add extracted fields for easy access
        staff_position: memoBody.staff_position || "N/A",
        staff_department: memoBody.staff_department || "N/A",
        staff_location: memoBody.staff_location_name || locationMap[memo.staff_id] || "N/A",
      }
    })

    return NextResponse.json({
      success: true,
      memos: enrichedMemos,
      count: enrichedMemos.length,
    })
  } catch (err) {
    console.error("[v0] Unexpected error in approved-memos:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
