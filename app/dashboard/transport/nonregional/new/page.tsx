import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"
import { NonRegionalRequisitionForm } from "@/components/transport/nonregional-requisition-form"

export default async function NewNonRegionalRequisitionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  const { data: assignedHodLink } = await supabase
    .from("loan_hod_linkages")
    .select("id")
    .eq("hod_user_id", user.id)
    .limit(1)
    .maybeSingle()
  const isAssignedHod = Boolean(assignedHodLink)
  if (!isAssignedHod && !["staff", "contract", "audit_staff", "department_head", "hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "admin", "it-admin"].includes(normalizeAppRole(profile?.role))) redirect("/dashboard/transport/nonregional")
  return <main className="mx-auto w-full max-w-4xl"><NonRegionalRequisitionForm /></main>
}
