import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// POST /api/leave/deferment-recall/assign-to-executive
// Assign a deferment or recall request to an HR executive for approval
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Verify the user is hr_leave_office
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const isHrOffice = ["hr_leave_office", "hr_office", "admin", "director_hr", "manager_hr"].includes(roleNorm)

    if (!isHrOffice) {
      return NextResponse.json({ error: "Forbidden - only HR Leave Office can assign to executives" }, { status: 403 })
    }

    const body = await request.json()
    const { type, requestId, hrExecutiveId, notes } = body

    if (!type || !requestId || !hrExecutiveId) {
      return NextResponse.json({ error: "Missing required fields: type, requestId, hrExecutiveId" }, { status: 400 })
    }

    if (type === "deferment") {
      // Update deferment request with HR executive assignment
      const { error } = await admin
        .from("leave_deferment_requests")
        .update({
          assigned_hr_executive_id: hrExecutiveId,
          hr_office_notes: notes || null,
          hr_office_reviewed_by: user.id,
          hr_office_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)

      if (error) {
        console.error("[v0] Error assigning deferment to executive:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else if (type === "recall") {
      // Update recall request with HR executive assignment
      const { error } = await admin
        .from("leave_recall_requests")
        .update({
          assigned_hr_executive_id: hrExecutiveId,
          hr_office_notes: notes || null,
          hr_office_reviewed_by: user.id,
          hr_office_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)

      if (error) {
        console.error("[v0] Error assigning recall to executive:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: "Invalid type. Must be 'deferment' or 'recall'" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: `Request assigned to HR executive successfully`,
    })
  } catch (error) {
    console.error("[v0] Assign to executive error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
