import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionClient = await createClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getAdmin()
    const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).single()
    if (!profile || normalizeAppRole(profile.role) !== "admin") {
      return NextResponse.json({ error: "Forbidden - only administrators can edit leave dates" }, { status: 403 })
    }

    const body = await request.json()
    const { id, startDate, endDate } = body
    if (!id || !isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "A valid start date and end date are required" }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await admin.from("leave_plan_requests").select("*").eq("id", id).single()
    if (fetchError || !existing) return NextResponse.json({ error: "Leave request not found" }, { status: 404 })

    const requestedDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1
    const { data: updated, error } = await admin.from("leave_plan_requests").update({
      preferred_start_date: startDate,
      preferred_end_date: endDate,
      adjusted_start_date: startDate,
      adjusted_end_date: endDate,
      auto_calculated_end_date: endDate,
      requested_days: requestedDays,
      original_requested_days: requestedDays,
      adjusted_days: requestedDays,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("id, preferred_start_date, preferred_end_date, requested_days").single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await admin.from("audit_logs").insert({
      user_id: user.id,
      record_id: id,
      table_name: "leave_plan_requests",
      action: "ADMIN_EDIT_LEAVE_DATES",
      old_values: { preferred_start_date: existing.preferred_start_date, preferred_end_date: existing.preferred_end_date, requested_days: existing.requested_days },
      new_values: { preferred_start_date: startDate, preferred_end_date: endDate, requested_days: requestedDays },
      details: { reason: "Admin changed annual leave dates" },
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (error) {
    console.error("[v0] Admin leave date update failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
