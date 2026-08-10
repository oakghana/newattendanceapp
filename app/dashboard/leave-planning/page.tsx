import { createClient } from "@/lib/supabase/server"
import { resolveEntitlementFromProfile } from "@/lib/annual-leave-entitlement"
import { LeavePlanningClient } from "./leave-planning-client"

export default async function LeavePlanningPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, department_id, staff_category, date_of_appointment, years_of_service, position, departments(name, code)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  // Fetch all public holidays for Ghana
  const { data: holidays } = await supabase
    .from("ghana_public_holidays")
    .select("holiday_date, holiday_name")
    .order("holiday_date", { ascending: true })

  const annualEntitlement = resolveEntitlementFromProfile(profile as any)

  return (
    <div className="leave-theme">
      <LeavePlanningClient
        annualEntitlement={{
          annualLeaveDays: annualEntitlement.annualLeaveDays,
          travelDays: annualEntitlement.travelDays,
          totalEntitlement: annualEntitlement.totalEntitlement,
          tierLabel: annualEntitlement.tierLabel,
        }}
        profile={{
          id: profile.id,
          role: profile.role,
          firstName: (profile as any)?.first_name || "",
          lastName: (profile as any)?.last_name || "",
          departmentName: (profile as any)?.departments?.name || null,
          departmentCode: (profile as any)?.departments?.code || null,
        }}
        initialHolidays={holidays || []}
      />
    </div>
  )
}
