import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DriverLicenseWorkspace } from "@/components/transport/driver-license-workspace"
import { canManageTransport, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"

export default async function DriverLicensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id").eq("id", user.id).single()
  if (!profile?.is_active || !canManageTransport(profile.role)) redirect("/dashboard")
  let driversQuery = supabase.from("transport_drivers").select("*").order("expiry_date")
  if ((isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role)) && profile.region_id) driversQuery = driversQuery.eq("assigned_region_id", profile.region_id)
  const { data: drivers } = await driversQuery
  return <DriverLicenseWorkspace initialDrivers={drivers ?? []} canVerify={isRegionalHrRole(profile.role)} canEndorse={isRegionalManagerRole(profile.role)} />
}
