import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { canCreateTransportRequest, canManageTransport, isRegionalDriverRole, normalizeAppRole } from "@/lib/role-capabilities"
import { NonRegionalRequisitionDashboard } from "@/components/transport/nonregional-requisition-dashboard"

export default async function NonRegionalTransportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, geofence_locations!user_profiles_assigned_location_id_fkey(name)")
    .eq("id", user.id)
    .single()
  const role = normalizeAppRole(profile?.role)
  const locationName = String((profile as { geofence_locations?: { name?: string | null } | null } | null)?.geofence_locations?.name || "").toLowerCase()
  const isRegionalOrDistrictLocation = locationName.includes("regional") || locationName.includes("district")
  // Regional or district staff only handle location-scoped trips; send them to the regional request register instead.
  if ((role === "driver" && isRegionalDriverRole(profile?.role)) || (role === "it-admin" && isRegionalOrDistrictLocation)) redirect("/dashboard/transport/requests")
  if (!profile || !(role === "staff" || role === "driver" || canCreateTransportRequest(profile.role) || canManageTransport(profile.role) || role === "managing_director" || role === "admin" || role === "it-admin")) redirect("/dashboard/transport")
  return <NonRegionalRequisitionDashboard role={role} />
}
