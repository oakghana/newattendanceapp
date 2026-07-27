/**
 * GET /api/leave/annual-entitlement
 *
 * Returns the logged-in user's annual leave entitlement based on their
 * staff_category and date_of_appointment / years_of_service from user_profiles.
 */
import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { resolveEntitlementFromProfile } from "@/lib/annual-leave-entitlement"

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await createAdminClient()

    const { data: profile } = await admin
      .from("user_profiles")
      .select("staff_category, date_of_appointment, years_of_service, first_name, last_name, employee_id, position, rank")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const entitlement = resolveEntitlementFromProfile(profile as any)

    return NextResponse.json({
      entitlement: {
        staffCategory: entitlement.staffCategory,
        yearsOfService: entitlement.yearsOfService,
        annualLeaveDays: entitlement.annualLeaveDays,
        travelDays: entitlement.travelDays,
        totalEntitlement: entitlement.totalEntitlement,
        tierLabel: entitlement.tierLabel,
      },
    })
  } catch (err) {
    console.error("[annual-entitlement] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
