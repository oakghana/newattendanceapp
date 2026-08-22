import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"
import { NonRegionalRequisitionDashboard } from "@/components/transport/nonregional-requisition-dashboard"

export default async function NonRegionalTransportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  const role = normalizeAppRole(profile?.role)
  if (!["staff", "department_head", "managing_director", "transport_manager", "admin"].includes(role)) redirect("/dashboard/transport")
  return <NonRegionalRequisitionDashboard role={role} />
}
