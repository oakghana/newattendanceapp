import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

function normalizeRole(role: string | null | undefined): string {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function canManageHolidays(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  const HOLIDAY_MANAGEMENT_ROLES = [
    "admin",
    "leave_admin",
    "hr_leave_office",
    "hr_office",
    "director_hr",
    "manager_hr",
  ]
  return HOLIDAY_MANAGEMENT_ROLES.includes(normalized)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const role = (profile as any).role || null
    if (!canManageHolidays(role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage holidays" },
        { status: 403 }
      )
    }

    const holidayId = params.id

    // Verify holiday exists and is custom before deleting
    const { data: holiday, error: fetchError } = await admin
      .from("ghana_public_holidays")
      .select("id, is_custom")
      .eq("id", holidayId)
      .single()

    if (fetchError || !holiday) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 })
    }

    if (!(holiday as any).is_custom) {
      return NextResponse.json(
        { error: "Cannot delete standard Ghana public holidays" },
        { status: 400 }
      )
    }

    // Delete the holiday
    const { error: deleteError } = await admin
      .from("ghana_public_holidays")
      .delete()
      .eq("id", holidayId)

    if (deleteError) {
      console.error("[v0] Error deleting holiday:", deleteError)
      return NextResponse.json({ error: "Failed to delete holiday" }, { status: 500 })
    }

    console.log("[v0] Holiday deleted:", holidayId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Error in DELETE holiday:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
