import { redirect } from "next/navigation"
import { ArrowLeft, Bus, Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TransportRequestRegister } from "@/components/transport/transport-request-register"
import { TransportApprovalDashboard } from "@/components/transport/transport-approval-dashboard"
import { createClient } from "@/lib/supabase/server"
import { isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"

const roles = new Set(["admin", "administrator", "it_admin", "driver", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_manager", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "director_hr", "manager_hr", "hr_executive", "hr_executive_officer"])
const normalize = (value: string) => value.toLowerCase().trim().replace(/[\s-]+/g, "_")

export default async function TransportRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(district_id, districts(region_id))")
    .eq("id", user.id)
    .single()
  if (!profile || !profile.role || (!roles.has(normalize(profile.role)) && !isRegionalManagerRole(profile.role))) redirect("/dashboard")
  const normalizedRole = normalizeAppRole(profile.role)
  const canCreate = isRegionalHrRole(profile.role) || ["department_head", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const canAct = isRegionalManagerRole(profile.role)
  const canHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizedRole)
  const canManagingDirector = normalizedRole === "managing_director"
  const canHrExecutive = ["hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const assignedLocation = profile.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  const locationId = profile.assigned_location_id ?? null
  const districtId = assignedLocation?.district_id ?? null
  const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  let requestsQuery = supabase.from("transport_requests").select("id, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, linked_district_id, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, regional_manager_signer_id, regional_manager_signed_at, hr_records_amended_at").order("created_at", { ascending: false }).limit(200)
  if (isRegionalManagerRole(profile.role)) {
    if (locationId) requestsQuery = requestsQuery.or(`origin_location_id.eq.${locationId},origin_location_id.is.null`)
    if (!locationId && districtId) requestsQuery = requestsQuery.eq("linked_district_id", districtId)
    else if (!locationId && !districtId && regionId) requestsQuery = requestsQuery.eq("assigned_region_id", regionId)
    requestsQuery = requestsQuery.eq("workflow_stage", "regional_manager_endorsement")
  }
  const { data: requests, error: requestsError } = await requestsQuery
  const signerIds = (requests ?? []).map((request) => request.regional_manager_signer_id).filter((id): id is string => Boolean(id))
  const { data: signerProfiles } = signerIds.length ? await supabase.from("user_profiles").select("id, signature_data_url").in("id", signerIds) : { data: [] as { id: string; signature_data_url?: string | null }[] }
  const signatures = new Map((signerProfiles ?? []).map((signer) => [signer.id, signer.signature_data_url]))
  const requestsWithSignatures = (requests ?? []).map((request) => ({ ...request, regional_manager_signature_data_url: request.regional_manager_signer_id ? signatures.get(request.regional_manager_signer_id) ?? null : null }))

  const pendingCount = requests?.filter((request) => canManagingDirector ? request.workflow_stage === "managing_director_approval" : canHrExecutive ? request.workflow_stage === "hr_executive_signing" : false).length ?? 0

  return <main className="flex flex-col gap-6">
    {canManagingDirector && <TransportApprovalDashboard role="managing_director" pendingCount={pendingCount} totalCount={requests?.length ?? 0} />}
    {canHrExecutive && <TransportApprovalDashboard role="hr_executive" pendingCount={pendingCount} totalCount={requests?.length ?? 0} />}
    <header className="flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between"><div className="flex items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bus /></div><div><p className="text-sm font-medium text-primary">Transport Management</p><h1 className="text-3xl font-semibold tracking-tight text-balance">Transport request register</h1><p className="mt-1 max-w-2xl text-muted-foreground leading-6">Track every request from submission through Regional HR review, approval, and fulfilment.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</Link></Button>{canCreate && <Button asChild><Link href="/dashboard/transport"><Plus data-icon="inline-start" /> New transport request</Link></Button>}</div></header>
    {requestsError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Transport requests could not be loaded. Please refresh and try again.</div>}<TransportRequestRegister rows={requestsWithSignatures} canCreate={canCreate} canAct={canAct} canHrRecords={canHrRecords} canManagingDirector={canManagingDirector} canHrExecutive={canHrExecutive} />
  </main>
}
