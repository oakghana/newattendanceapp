import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"
import { NonRegionalRequisitionForm } from "@/components/transport/nonregional-requisition-form"

export default async function NewNonRegionalRequisitionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  if (!["department_head", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "admin"].includes(normalizeAppRole(profile?.role))) redirect("/dashboard/transport/nonregional")
  return <main className="mx-auto w-full max-w-4xl"><NonRegionalRequisitionForm /></main>
}
