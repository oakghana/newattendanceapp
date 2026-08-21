import { redirect } from "next/navigation"
import { TransportWorkspace } from "@/components/transport/transport-workspace"
import { createClient } from "@/lib/supabase/server"

const TRANSPORT_ROLES = new Set([
  "admin", "administrator", "it-admin", "it_admin", "driver", "regional_hr", "regional hr", "regional_hr_office", "regional hr office", "regional_hr_officer", "regional hr officer", "regional_manager", "regional manager",
  "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "director_hr", "manager_hr",
])

function normalizeRole(role: string) {
  return role.toLowerCase().trim().replace(/[\s-]+/g, "_")
}

export default async function TransportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  const normalizedRole = profile?.role ? normalizeRole(profile.role) : ""
  if (!profile || !TRANSPORT_ROLES.has(normalizedRole)) redirect("/dashboard")

  return <TransportWorkspace role={normalizedRole} />
}
