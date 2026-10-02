import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeAppRole } from "@/lib/role-capabilities"
import { NonRegionalRequisitionForm } from "@/components/transport/nonregional-requisition-form"

export default async function NewHeadOfficeTransportRequestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name)")
    .eq("id", user.id)
    .single()
  const normalizedRole = normalizeAppRole(profile?.role)
  const normalizedLocationName = String((profile as { geofence_locations?: { name?: string | null } | null } | null)?.geofence_locations?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const isExplicitNonRegionalLocation = [
    "qcc head office",
    "head office swanzy arcade",
    "awutu stores",
    "awutu store",
    "nsawam archives",
    "nsawam archive",
  ].some((location) => normalizedLocationName.includes(location))
  const canSubmitRequest = [
    "staff", "contract", "audit_staff", "hr", "hr_officer", "hr_records",
    "hr_executive", "hr_executive_officer", "manager_hr", "director_hr",
    "department_head", "accounts_executive", "admin", "it-admin",
  ].includes(normalizedRole)
  if (!canSubmitRequest || !isExplicitNonRegionalLocation) redirect("/dashboard/transport")
  return <main className="mx-auto w-full max-w-4xl"><NonRegionalRequisitionForm /></main>
}
