import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"
import { NonRegionalRequisitionForm } from "@/components/transport/nonregional-requisition-form"

export default async function NewNonRegionalRequisitionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name)")
    .eq("id", user.id)
    .single()
  const adminSupabase = await createAdminClient()
  const { data: assignedHodLink } = await adminSupabase
    .from("loan_hod_linkages")
    .select("id")
    .eq("hod_user_id", user.id)
    .limit(1)
    .maybeSingle()
  const { data: linkedHodForStaff } = await adminSupabase
    .from("loan_hod_linkages")
    .select("id")
    .eq("staff_user_id", user.id)
    .limit(1)
    .maybeSingle()
  const isAssignedHod = Boolean(assignedHodLink)
  const isLinkedToHod = Boolean(linkedHodForStaff)
  const normalizedRole = normalizeAppRole(profile?.role)
  const normalizedLocationName = String((profile as { geofence_locations?: { name?: string | null } | null } | null)?.geofence_locations?.name || "").toLowerCase()
  const isExplicitNonRegionalLocation = [
    "head office",
    "swanzy arcade",
    "archive center",
    "archivial center",
    "awutu stores",
    "cocoa clinic",
  ].some((location) => normalizedLocationName.includes(location))
  const isNonRegionalStaff = ["staff", "contract", "audit_staff"].includes(normalizedRole)
  if (isNonRegionalStaff && !isExplicitNonRegionalLocation) redirect("/dashboard/transport")
  if (isNonRegionalStaff && !isLinkedToHod) redirect("/dashboard/transport")
  if (!isAssignedHod && !isLinkedToHod && !["staff", "contract", "audit_staff", "hr_records", "department_head", "accounts_executive", "hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "admin", "it-admin"].includes(normalizedRole)) redirect("/dashboard/transport/nonregional")
  return <main className="mx-auto w-full max-w-4xl"><NonRegionalRequisitionForm /></main>
}
