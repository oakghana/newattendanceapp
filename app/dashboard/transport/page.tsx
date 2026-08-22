import { redirect } from "next/navigation"
import { TransportWorkspace } from "@/components/transport/transport-workspace"
import { createClient } from "@/lib/supabase/server"
import { canManageTransport } from "@/lib/role-capabilities"

const TRANSPORT_ROLES = new Set([
  "admin", "administrator", "it-admin", "it_admin", "driver", "regional_hr", "regional hr", "regional_hr_office", "regional hr office", "regional_hr_officer", "regional hr officer", "regional_manager", "regional manager",
  "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "director_hr", "manager_hr", "hr_executive", "hr_executive_officer",
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
  const isHrExecutive = ["hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  let pendingCount = 0
  let totalCount = 0
  let regionalPendingCount = 0
  let nonRegionalPendingCount = 0
  let queueRows: { id: string; purpose: string; origin: string; destination: string; event_date: string | null; reference_number: string | null; request_type: "regional" | "nonregional" }[] = []
  if (isManagingDirector || isHrExecutive) {
    const stage = isManagingDirector ? "managing_director_approval" : "hr_executive_signing"
    const { count: total } = await supabase.from("transport_requests").select("id", { count: "exact", head: true })
    const { data: pendingRows, count: pending } = await supabase.from("transport_requests").select("id, purpose, origin, destination, event_date, reference_number", { count: "exact" }).eq("workflow_stage", stage).order("created_at", { ascending: false }).limit(4)
    totalCount = total ?? 0
    regionalPendingCount = pending ?? 0
    queueRows = (pendingRows ?? []).map((row) => ({ ...row, request_type: "regional" as const }))

    if (isManagingDirector) {
      const { count: nonRegionalTotal } = await supabase.from("nonregional_transport_requisitions").select("id", { count: "exact", head: true })
      const { data: nonRegionalRows, count: nonRegionalPending } = await supabase.from("nonregional_transport_requisitions").select("id, purpose, origin, destination, required_at, department, location", { count: "exact" }).eq("md_decision", "pending").order("created_at", { ascending: false }).limit(4)
      totalCount += nonRegionalTotal ?? 0
      nonRegionalPendingCount = nonRegionalPending ?? 0
      queueRows = [
        ...queueRows,
        ...(nonRegionalRows ?? []).map((row) => ({ id: row.id, purpose: row.purpose, origin: row.origin, destination: row.destination, event_date: row.required_at, reference_number: `${row.department} · ${row.location}`, request_type: "nonregional" as const })),
      ]
    }
    pendingCount = regionalPendingCount + nonRegionalPendingCount
  }

  return (
    <TransportWorkspace
      role={profile.role ?? normalizedRole}
      pendingCount={pendingCount}
      totalCount={totalCount}
      queueRows={queueRows}
      regionalPendingCount={regionalPendingCount}
      nonRegionalPendingCount={nonRegionalPendingCount}
    />
  )
}
