import { redirect } from "next/navigation"
import { TransportWorkspace } from "@/components/transport/transport-workspace"
import { createClient } from "@/lib/supabase/server"

const TRANSPORT_ROLES = new Set([
  "admin", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_manager",
  "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "director_hr", "manager_hr",
])

export default async function TransportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  if (!profile || !TRANSPORT_ROLES.has(profile.role)) redirect("/dashboard")

  return <TransportWorkspace />
}
