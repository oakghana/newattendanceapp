import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/leave/deferment-recall/pending-requests
// Returns all HOD-approved deferment and recall requests that have not yet been
// assigned to an HR executive. Uses NO FK joins to avoid PGRST relationship errors —
// all related data is fetched in separate queries and merged in JS.
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Verify the caller has an HR-office-level role
    const { data: callerProfile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(callerProfile?.role || "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_")

    const allowedRoles = [
      "hr_leave_office",
      "hr_office",
      "admin",
      "director_hr",
      "manager_hr",
      "hr_executive",
    ]
    if (!allowedRoles.includes(roleNorm)) {
      return NextResponse.json(
        { error: "Forbidden — only HR Leave Office can view pending requests" },
        { status: 403 }
      )
    }

    // ── Deferment requests — raw columns only, no FK joins ────────────────
    const { data: rawDeferments, error: defError } = await admin
      .from("leave_deferment_requests")
      .select(
        "id, staff_user_id, request_reason, deferment_to_year, created_at, hod_approval_status, assigned_hr_executive_id, department_id, leave_balance_id"
      )
      .eq("hod_approval_status", "approved")
      .is("assigned_hr_executive_id", null)
      .order("created_at", { ascending: false })

    if (defError) {
      console.error("[v0] Deferment fetch error:", JSON.stringify(defError))
      // Return empty rather than crashing — table may not exist yet
      if (defError.code === "PGRST200" || defError.code === "42P01" || String(defError.message).includes("does not exist")) {
        return NextResponse.json({ defermentRequests: [], recallRequests: [], total: 0 })
      }
      throw new Error(defError.message)
    }

    // ── Recall requests — raw columns only, no FK joins ───────────────────
    const { data: rawRecalls, error: recError } = await admin
      .from("leave_recall_requests")
      .select(
        "id, staff_user_id, recall_reason, created_at, hod_approval_status, assigned_hr_executive_id, department_id, leave_balance_id"
      )
      .eq("hod_approval_status", "approved")
      .is("assigned_hr_executive_id", null)
      .order("created_at", { ascending: false })

    if (recError) {
      console.error("[v0] Recall fetch error:", JSON.stringify(recError))
      if (recError.code === "PGRST200" || recError.code === "42P01" || String(recError.message).includes("does not exist")) {
        return NextResponse.json({
          defermentRequests: (rawDeferments || []).map((r: any) => ({ ...r, staff: null, department: null, leave: null })),
          recallRequests: [],
          total: rawDeferments?.length ?? 0,
        })
      }
      throw new Error(recError.message)
    }

    // ── Batch-fetch staff profiles ────────────────────────────────────────
    const allStaffIds = Array.from(
      new Set([
        ...(rawDeferments ?? []).map((r: any) => r.staff_user_id as string).filter(Boolean),
        ...(rawRecalls ?? []).map((r: any) => r.staff_user_id as string).filter(Boolean),
      ])
    )

    const profilesMap: Record<string, any> = {}
    if (allStaffIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, department_id")
        .in("id", allStaffIds)

      for (const p of profiles ?? []) {
        profilesMap[p.id] = p
      }
    }

    // ── Batch-fetch department names ──────────────────────────────────────
    const allDeptIds = Array.from(
      new Set([
        ...(rawDeferments ?? []).map((r: any) => r.department_id).filter(Boolean),
        ...(rawRecalls ?? []).map((r: any) => r.department_id).filter(Boolean),
        ...Object.values(profilesMap).map((p: any) => p.department_id).filter(Boolean),
      ])
    )

    const departmentsMap: Record<string, { id: string; name: string }> = {}
    if (allDeptIds.length > 0) {
      const { data: depts } = await admin
        .from("departments")
        .select("id, name")
        .in("id", allDeptIds)

      for (const d of depts ?? []) {
        departmentsMap[d.id] = d
      }
    }

    // ── Helper to merge data into a request record ────────────────────────
    const enrich = (r: any, type: "deferment" | "recall") => {
      const profile = profilesMap[r.staff_user_id] ?? null
      const deptId = r.department_id || profile?.department_id
      const dept = deptId ? departmentsMap[deptId] ?? null : null
      return {
        id: r.id,
        staff_user_id: r.staff_user_id,
        request_reason: type === "deferment" ? r.request_reason : undefined,
        deferment_to_year: type === "deferment" ? r.deferment_to_year : undefined,
        recall_reason: type === "recall" ? r.recall_reason : undefined,
        created_at: r.created_at,
        hod_approval_status: r.hod_approval_status,
        assigned_hr_executive_id: r.assigned_hr_executive_id ?? null,
        staff: profile
          ? {
              id: profile.id,
              first_name: profile.first_name || "",
              last_name: profile.last_name || "",
              employee_id: profile.employee_id || "",
              position: profile.position || "",
            }
          : null,
        department: dept,
      }
    }

    const defermentRequests = (rawDeferments ?? []).map((r: any) => enrich(r, "deferment"))
    const recallRequests = (rawRecalls ?? []).map((r: any) => enrich(r, "recall"))

    return NextResponse.json({
      defermentRequests,
      recallRequests,
      total: defermentRequests.length + recallRequests.length,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[v0] Pending requests unhandled error:", msg)
    return NextResponse.json({ error: msg || "Internal server error" }, { status: 500 })
  }
}
