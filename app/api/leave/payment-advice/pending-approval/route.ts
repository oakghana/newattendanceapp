import { createClient, createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { isUserAdmin } from "@/lib/admin-bypass"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch ALL payment advice memos pending approval for HR Executives
 * ADMINS: See ALL pending memos without RLS restriction
 * HR Executives (director_hr, manager_hr, hr_director): See all pending memos via admin client bypass
 */
export async function GET(request: NextRequest) {
  try {
    const userIsAdmin = await isUserAdmin()
    const supabase = await createClient()
    // Always use admin client for this endpoint - admins see everything, HR execs need bypass for RLS
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Admins and HR Executives can see ALL pending memos (admin client bypasses RLS)
    // Show memos that are in ready_for_review status (submitted by HR Leave Office for approval)
    // We filter for status = ready_for_review which indicates HR Leave Office has completed processing
    const { data: pendingMemos, error } = await admin
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
        status,
        updated_at,
        forwarded_at,
        acknowledged_at,
        payment_amount,
        payment_currency
      `
      )
      .eq("status", "ready_for_review") // Only show memos submitted for HR Executive review
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching pending memos:", error)
      return NextResponse.json(
        { error: "Failed to fetch memos", details: error.message },
        { status: 500 }
      )
    }

    // Enrich memos with location from user_profiles + geofence_locations
    const memoList = pendingMemos || []
    const staffIds = [...new Set(memoList.map((m: any) => m.staff_id).filter(Boolean))]

    let locationMap: Record<string, string> = {}
    if (staffIds.length > 0) {
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

    const enrichedMemos = memoList.map((memo: any) => {
      let memoBody: any = {}
      try {
        memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
      } catch { memoBody = {} }

      if (!memoBody.staff_location_name && locationMap[memo.staff_id]) {
        memoBody.staff_location_name = locationMap[memo.staff_id]
        return { ...memo, memo_body: JSON.stringify(memoBody) }
      }
      return memo
    })

    return NextResponse.json({
      success: true,
      memos: enrichedMemos,
      count: enrichedMemos.length,
    })
  } catch (err: any) {
    console.error("[v0] Error fetching pending memos:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}

/**
 * POST: Approve a payment advice memo
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user profile for full name
    const { data: profile } = await admin
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single()

    const fullName = profile 
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() 
      : (user.user_metadata?.full_name || user.email || "Unknown")

    const { memoId, approved } = await request.json()

    if (!memoId || approved === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: memoId, approved" },
        { status: 400 }
      )
    }

    // Update memo status using admin client to bypass RLS
    // Valid status values per database: draft, ready_for_review, reviewed_by_hr, forwarded_to_accounts, acknowledged_by_accounts
    // Approval = reviewed_by_hr (HR Executive has reviewed and approved)
    const newStatus = approved ? "reviewed_by_hr" : "draft"

    const { data, error } = await admin
      .from("leave_payment_memos")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memoId)
      .select()

    if (error) {
      console.error("[v0] Error updating memo approval:", error)
      return NextResponse.json(
        { error: "Failed to update memo", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Memo ${approved ? "approved" : "rejected"} successfully`,
      memo: data?.[0],
    })
  } catch (err: any) {
    console.error("[v0] Error approving memo:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
