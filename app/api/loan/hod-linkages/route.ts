import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"

/**
 * Get all HODs linked to a staff member
 * Returns current lock status and all linked HODs
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const staffId = searchParams.get("staffId") || user.id
    const requestId = searchParams.get("requestId")
    const requestType = searchParams.get("requestType") || "loan"

    // Get all HODs linked to this staff
    const { data: hodLinkages, error: linkError } = await admin
      .from("loan_hod_linkages")
      .select("hod_user_id, hod_rank")
      .eq("staff_user_id", staffId)
      .limit(100)

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    const hodIds = (hodLinkages || []).map((h: any) => h.hod_user_id).filter(Boolean)

    // Get HOD profile details
    let hodProfiles: any[] = []
    if (hodIds.length > 0) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position, role, department_id, email")
        .in("id", hodIds)

      hodProfiles = (profiles || []).map((p: any) => ({
        id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        position: p.position,
        role: p.role,
        email: p.email,
      }))
    }

    // If requestId provided, get current lock status
    let lockStatus: any = null
    if (requestId && requestType) {
      const table = requestType === "leave" ? "leave_plan_requests" : "loan_requests"
      const reviewerField = requestType === "leave" ? "hod_reviewer_id" : "hod_reviewer_id"

      const { data: req } = await admin
        .from(table)
        .select(reviewerField)
        .eq("id", requestId)
        .maybeSingle()

      if (req?.[reviewerField]) {
        const lockedByHod = hodProfiles.find((h: any) => h.id === req[reviewerField])
        lockStatus = {
          locked_by: req[reviewerField],
          locked_by_name: lockedByHod?.name || "Unknown",
          is_locked_by_current_user: req[reviewerField] === user.id,
        }
      }
    }

    return NextResponse.json({
      staff_id: staffId,
      linked_hods_count: hodIds.length,
      linked_hods: hodProfiles,
      lock_status: lockStatus,
      message:
        hodIds.length > 1
          ? `Staff is linked to ${hodIds.length} HODs - request will be visible to all of them`
          : `Staff is linked to ${hodIds.length} HOD`,
    })
  } catch (error: any) {
    console.error("[v0] HOD linkages error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch linkages" }, { status: 500 })
  }
}
