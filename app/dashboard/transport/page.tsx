import { redirect } from "next/navigation"
import { TransportWorkspace } from "@/components/transport/transport-workspace"
import { createClient } from "@/lib/supabase/server"
import { canManageTransport } from "@/lib/role-capabilities"

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
  if (!profile || (!TRANSPORT_ROLES.has(normalizedRole) && !canManageTransport(profile.role))) redirect("/dashboard")

  const isManagingDirector = normalizedRole === "managing_director"
  const isHrExecutive = normalizedRole === "hr_executive" || normalizedRole === "hr_executive_officer"
  let pendingCount = 0
  let totalCount = 0
  let queueRows: { id: string; purpose: string; origin: string; destination: string; event_date: string | null; reference_number: string | null }[] = []
  if (isManagingDirector || isHrExecutive) {
    const stage = isManagingDirector ? "managing_director_approval" : "hr_executive_signing"
    const { count: total } = await supabase.from("transport_requests").select("id", { count: "exact", head: true })
    const { data: pendingRows, count: pending } = await supabase.from("transport_requests").select("id, purpose, origin, destination, event_date, reference_number", { count: "exact" }).eq("workflow_stage", stage).order("created_at", { ascending: false }).limit(4)
    totalCount = total ?? 0
    pendingCount = pending ?? 0
    queueRows = pendingRows ?? []
  }

  return <TransportWorkspace role={profile.role ?? normalizedRole} pendingCount={pendingCount} totalCount={totalCount} queueRows={queueRows} />
}
