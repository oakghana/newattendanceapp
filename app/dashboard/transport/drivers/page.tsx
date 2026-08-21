import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DriverLicenseWorkspace } from "@/components/transport/driver-license-workspace"
import { canManageTransport } from "@/lib/role-capabilities"

export default async function DriverLicensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active").eq("id", user.id).single()
  if (!profile?.is_active || !canManageTransport(profile.role)) redirect("/dashboard")
  const { data: drivers } = await supabase.from("transport_drivers").select("*").order("expiry_date")
  return <DriverLicenseWorkspace initialDrivers={drivers ?? []} canVerify={profile.role === "regional_hr" || profile.role === "regional_hr_office" || profile.role === "regional_hr_officer"} />
}
