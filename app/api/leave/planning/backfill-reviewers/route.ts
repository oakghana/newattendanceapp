/**
 * POST /api/leave/planning/backfill-reviewers
 *
 * For every pending leave_plan_request, resolves the correct set of HOD
 * reviewers via loan_hod_linkages and inserts any missing leave_plan_reviews
 * rows.  Safe to call repeatedly — uses upsert with onConflict ignore.
 *
 * Called automatically when a HOD opens their Leave Center so that newly
 * linked HODs can see existing pending requests without waiting for a
 * re-submission.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const HOD_ROLES = ["regional_manager", "department_head", "manager_hr", "director_hr"]
const PENDING_STATUSES = ["pending_hod_review", "hod_pending", "submitted", "pending"]

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Fetch all pending leave plan requests (use neq to include null is_archived rows too)
    const { data: pendingRequests, error: reqError } = await admin
      .from("leave_plan_requests")
      .select("id, user_id")
      .in("status", PENDING_STATUSES)
      .neq("is_archived", true)

    if (reqError) {
      console.error("[v0] backfill-reviewers: failed to fetch pending requests:", reqError.message)
      return NextResponse.json({ error: reqError.message }, { status: 500 })
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      return NextResponse.json({ backfilled: 0 })
    }

    // Get all unique staff user IDs
    const staffIds = [...new Set((pendingRequests as any[]).map((r) => String(r.user_id)))]

    // Fetch all HOD linkages for these staff
    const { data: linkages, error: linkErr } = await admin
      .from("loan_hod_linkages")
      .select("staff_user_id, hod_user_id")
      .in("staff_user_id", staffIds)

    if (linkErr) {
      console.error("[v0] backfill-reviewers: failed to fetch linkages:", linkErr.message)
      return NextResponse.json({ error: linkErr.message }, { status: 500 })
    }

    if (!linkages || linkages.length === 0) {
      return NextResponse.json({ backfilled: 0, note: "No HOD linkages found" })
    }

    // Verify HOD users exist and have valid HOD roles
    const hodIds = [...new Set((linkages as any[]).map((l) => String(l.hod_user_id)))]
    const { data: hodProfiles } = await admin
      .from("user_profiles")
      .select("id, role")
      .in("id", hodIds)
      .in("role", HOD_ROLES)
      .eq("is_active", true)

    const validHodSet = new Set((hodProfiles || []).map((h: any) => String(h.id)))
    const hodRoleMap = new Map((hodProfiles || []).map((h: any) => [String(h.id), String(h.role)]))

    // Build staff_user_id -> valid hod array map
    const staffToHods = new Map<string, Array<{ id: string; role: string }>>()
    for (const link of linkages as any[]) {
      const staffId = String(link.staff_user_id)
      const hodId = String(link.hod_user_id)
      if (!validHodSet.has(hodId)) continue
      if (!staffToHods.has(staffId)) staffToHods.set(staffId, [])
      staffToHods.get(staffId)!.push({ id: hodId, role: hodRoleMap.get(hodId) || "department_head" })
    }

    // Fetch existing leave_plan_reviews for these requests to avoid duplicates
    const requestIds = (pendingRequests as any[]).map((r) => String(r.id))
    const { data: existingReviews } = await admin
      .from("leave_plan_reviews")
      .select("leave_plan_request_id, reviewer_id")
      .in("leave_plan_request_id", requestIds)

    const existingSet = new Set(
      (existingReviews || []).map((r: any) => `${r.leave_plan_request_id}::${r.reviewer_id}`)
    )

    // Build missing rows
    const newRows: any[] = []
    for (const req of pendingRequests as any[]) {
      const hods = staffToHods.get(String(req.user_id)) || []
      for (const hod of hods) {
        const key = `${req.id}::${hod.id}`
        if (!existingSet.has(key)) {
          newRows.push({
            leave_plan_request_id: String(req.id),
            reviewer_id: hod.id,
            reviewer_role: hod.role,
            decision: "pending",
          })
        }
      }
    }

    if (newRows.length === 0) {
      return NextResponse.json({ backfilled: 0, note: "All reviewer rows already exist" })
    }

    const { error: insertError } = await admin
      .from("leave_plan_reviews")
      .insert(newRows)

    if (insertError) {
      console.error("[v0] backfill-reviewers: insert failed:", insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ backfilled: newRows.length })
  } catch (err: any) {
    console.error("[v0] backfill-reviewers: unexpected error:", err)
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 })
  }
}
