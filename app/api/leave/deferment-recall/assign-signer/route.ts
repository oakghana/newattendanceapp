import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// PATCH /api/leave/deferment-recall/assign-signer
// Allows hr_leave_office to assign a signer and write date to a deferment or recall request
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Verify the user is hr_leave_office or admin
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const roleNorm = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const canAssign = ["hr_leave_office", "hr_office", "admin", "director_hr", "manager_hr", "hr_director"].includes(roleNorm)

    if (!canAssign) {
      return NextResponse.json({ error: "Forbidden - insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const { type, id, signer_name, signer_title, write_date, notes } = body

    if (!type || !id) {
      return NextResponse.json({ error: "Missing required fields: type and id" }, { status: 400 })
    }

    if (type === "deferment") {
      const { error } = await admin
        .from("leave_deferment_requests")
        .update({
          hr_signer_name: signer_name || null,
          hr_signer_title: signer_title || null,
          hr_write_date: write_date || null,
          hr_office_notes: notes || null,
          hr_office_reviewed_by: user.id,
          hr_office_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) {
        console.error("[v0] Error assigning signer to deferment:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else if (type === "recall") {
      const { error } = await admin
        .from("leave_recall_requests")
        .update({
          hr_signer_name: signer_name || null,
          hr_signer_title: signer_title || null,
          hr_write_date: write_date || null,
          hr_office_notes: notes || null,
          hr_reviewed_by: user.id,
          hr_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) {
        console.error("[v0] Error assigning signer to recall:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: "Invalid type. Must be 'deferment' or 'recall'" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: "Signer assigned successfully" })
  } catch (error) {
    console.error("[v0] Assign signer error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
