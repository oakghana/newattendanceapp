import { redirect } from "next/navigation"
import { ArrowLeft, Bus, Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TransportRequestRegister } from "@/components/transport/transport-request-register"
import { createClient } from "@/lib/supabase/server"
import { canCreateTransportRequest, canManageTransport, isChiefDriverRole, isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"

const roles = new Set(["admin", "administrator", "it_admin", "driver", "chief_driver", "transport_manager", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_manager", "hr_records", "hr_records_officer", "hr_records_manager", "hr", "managing_director", "director_hr", "manager_hr", "hr_executive", "hr_executive_officer"])
const normalize = (value: string) => value.toLowerCase().trim().replace(/[\s-]+/g, "_")

export default async function TransportRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, region_id, assigned_location_id, regions(name), geofence_locations!user_profiles_assigned_location_id_fkey(name, district_id, districts(region_id))")
    .eq("id", user.id)
    .single()
  if (!profile || !profile.role || (!roles.has(normalize(profile.role)) && !isRegionalManagerRole(profile.role) && !canManageTransport(profile.role) && !canCreateTransportRequest(profile.role))) redirect("/dashboard")
  const normalizedRole = normalizeAppRole(profile.role)
  if (normalizedRole === "driver") redirect("/dashboard/transport/nonregional")
  const canCreate = isChiefDriverRole(profile.role) || isRegionalHrRole(profile.role) || ["department_head", "hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const canAct = isRegionalManagerRole(profile.role) || isChiefDriverRole(profile.role)
  const canHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizedRole)
  const canManagingDirector = normalizedRole === "managing_director"
  const canHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const assignedLocation = profile.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  const locationId = profile.assigned_location_id ?? null
  const districtId = assignedLocation?.district_id ?? null
  const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  const profileRegion = profile.regions as { name?: string | null } | null
  const assignedLocationName = (profile.geofence_locations as { name?: string | null } | null)?.name?.trim() ?? ""
  const locationRegionAliases: Record<string, string> = { kumasi: "Ashanti", "kumasi regional office": "Ashanti", accra: "Greater Accra", "accra regional office": "Greater Accra", takoradi: "Western", cape: "Central", sunyani: "Bono", tamale: "Northern", bolgatanga: "Upper East", wa: "Upper West", koforidua: "Eastern", ho: "Volta" }
  const locationKey = assignedLocationName.toLowerCase().replace(/\s+/g, " ").trim()
  const locationRegionName = Object.entries(locationRegionAliases).find(([key]) => locationKey.includes(key))?.[1] ?? ""
  const rawRegionalName = locationRegionName || (assignedLocationName && !/accra|head office/i.test(assignedLocationName) ? assignedLocationName : "") || profileRegion?.name?.trim() || ""
  const regionalOfficeName = rawRegionalName ? rawRegionalName.replace(/\s+Regional\s+Office$/i, "").replace(/\s+Region$/i, "").trim() + " Regional Office" : "Regional Office"
  const requestFields = "id, requester_id, request_type, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, linked_district_id, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, regional_manager_signer_id, regional_manager_signed_at, hr_records_amended_at, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url, assigned_region:geofence_locations!transport_requests_assigned_region_id_fkey(name, districts(region_id, regions(name)))"
  let requestsQuery = supabase.from("transport_requests").select(requestFields).order("created_at", { ascending: false }).limit(200)
  if (canHrExecutive) requestsQuery = requestsQuery.eq("request_type", "regional_transport")
  if (isRegionalManagerRole(profile.role)) {
    if (locationId) requestsQuery = requestsQuery.or(`origin_location_id.eq.${locationId},origin_location_id.is.null`)
    if (!locationId && districtId) requestsQuery = requestsQuery.eq("linked_district_id", districtId)
    else if (!locationId && !districtId && regionId) requestsQuery = requestsQuery.eq("assigned_region_id", regionId)
    requestsQuery = requestsQuery.in("workflow_stage", ["regional_manager_endorsement", "hr_records_review", "hr_executive_signing", "approved", "referenced", "completed", "closed"])
  }
  let { data: requests, error: requestsError } = await requestsQuery
  const { data: ownRequests, error: ownRequestsError } = await supabase
    .from("transport_requests")
    .select(requestFields)
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (!ownRequestsError && ownRequests) {
    const scopedRequests = requests ?? []
    requests = [...scopedRequests, ...ownRequests.filter((request) => !scopedRequests.some((scopedRequest) => scopedRequest.id === request.id))]
      .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
  }
  if (requestsError) {
    console.error("[v0] Transport request query failed:", requestsError.message)
    let fallbackQuery = supabase.from("transport_requests").select("id, requester_id, request_type, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, linked_district_id, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments").order("created_at", { ascending: false }).limit(200)
    if (canHrExecutive) fallbackQuery = fallbackQuery.eq("request_type", "regional_transport")
    if (isRegionalManagerRole(profile.role)) {
      if (locationId) fallbackQuery = fallbackQuery.or(`origin_location_id.eq.${locationId},origin_location_id.is.null`)
      if (!locationId && districtId) fallbackQuery = fallbackQuery.eq("linked_district_id", districtId)
      else if (!locationId && !districtId && regionId) fallbackQuery = fallbackQuery.eq("assigned_region_id", regionId)
      fallbackQuery = fallbackQuery.in("workflow_stage", ["regional_manager_endorsement", "hr_records_review", "hr_executive_signing", "approved", "referenced", "completed", "closed"])
    }
    const fallback = await fallbackQuery
    const fallbackRequests = fallback.data?.map((request) => ({ ...request, assigned_region: [], regional_manager_signer_id: null, regional_manager_signed_at: null, hr_executive_signer_id: null, hr_executive_signed_at: null, hr_executive_signature_data_url: null })) ?? []
    const fallbackOwnRequests = ownRequests ?? []
    requests = [...fallbackRequests, ...fallbackOwnRequests.filter((request) => !fallbackRequests.some((scopedRequest) => scopedRequest.id === request.id))]
      .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
    requestsError = fallback.error
  }
  // Resolve HR Executive signatures server-side, batched, the same way leave administration does it
  // (user_profiles.signature_data_url first, approval_signature_registry as fallback) — no per-row client fetch delay.
  const rawRequests = requests ?? []
  // The HR Executive signer id / signature are persisted inside the memo_amendments JSON payload,
  // so read there first and fall back to the top-level columns.
  const readSignedAmendments = (request: { memo_amendments?: string | null }) => {
    try {
      const amendments = request.memo_amendments ? (JSON.parse(request.memo_amendments) as Record<string, unknown>) : {}
      return {
        signerId: typeof amendments.hr_executive_signer_id === "string" ? amendments.hr_executive_signer_id : null,
        signatureUrl: typeof amendments.hr_executive_signature_data_url === "string" ? amendments.hr_executive_signature_data_url : null,
      }
    } catch {
      return { signerId: null, signatureUrl: null }
    }
  }
  const hrExecutiveSignerIds = [...new Set(rawRequests.map((request) => request.hr_executive_signer_id ?? readSignedAmendments(request).signerId).filter(Boolean))] as string[]
  const hrExecutivePreviewIds = canHrExecutive && !hrExecutiveSignerIds.includes(user.id) ? [user.id] : []
  const hrSignatureLookupIds = [...new Set([...hrExecutiveSignerIds, ...hrExecutivePreviewIds])]
  const hrExecutiveProfileMap: Record<string, { first_name?: string | null; last_name?: string | null; position?: string | null; signature_data_url?: string | null }> = {}
  const hrExecutiveRegistrySignatureMap: Record<string, string> = {}
  if (hrSignatureLookupIds.length > 0) {
    const [{ data: hrProfiles }, { data: hrSignatureRegistry }] = await Promise.all([
      supabase.from("user_profiles").select("id, first_name, last_name, position, signature_data_url").in("id", hrSignatureLookupIds),
      supabase.from("approval_signature_registry").select("user_id, signature_data_url").in("user_id", hrSignatureLookupIds).eq("is_active", true).order("created_at", { ascending: false }),
    ])
    for (const hrProfile of hrProfiles ?? []) hrExecutiveProfileMap[hrProfile.id] = hrProfile
    for (const signatureRow of hrSignatureRegistry ?? []) {
      if (!hrExecutiveRegistrySignatureMap[signatureRow.user_id] && signatureRow.signature_data_url) hrExecutiveRegistrySignatureMap[signatureRow.user_id] = signatureRow.signature_data_url
    }
  }
  const resolveHrExecutiveSignature = (signerId: string | null | undefined) => {
    if (!signerId) return null
    return hrExecutiveProfileMap[signerId]?.signature_data_url || hrExecutiveRegistrySignatureMap[signerId] || null
  }
  const requestsWithSignatures = rawRequests.map((request) => {
    const signed = readSignedAmendments(request)
    const signerId = request.hr_executive_signer_id ?? signed.signerId
    const resolvedSignature = request.hr_executive_signature_data_url || signed.signatureUrl || resolveHrExecutiveSignature(signerId)
    const previewSignerId = signerId ?? (canHrExecutive ? user.id : null)
    const previewProfile = previewSignerId ? hrExecutiveProfileMap[previewSignerId] : null
    const previewSignature = resolvedSignature || (previewSignerId ? resolveHrExecutiveSignature(previewSignerId) : null)
    return {
      ...request,
      // A preview signature must not make an unsigned request appear completed.
      hr_executive_signature_preview_url: previewSignature,
      hr_executive_signer_display_name: signerId ? `${hrExecutiveProfileMap[signerId]?.first_name ?? ""} ${hrExecutiveProfileMap[signerId]?.last_name ?? ""}`.trim() || null : previewProfile ? `${previewProfile.first_name ?? ""} ${previewProfile.last_name ?? ""}`.trim() || null : null,
      hr_executive_signer_display_position: signerId ? hrExecutiveProfileMap[signerId]?.position ?? null : previewProfile?.position ?? null,
    }
  })

  return <main className="flex flex-col gap-6">
    <header className="flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between"><div className="flex items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bus /></div><div><p className="text-sm font-medium text-primary">Transport Management</p><h1 className="text-3xl font-semibold tracking-tight text-balance">Transport request register</h1><p className="mt-1 max-w-2xl text-muted-foreground leading-6">Track every request from submission through Regional HR review, approval, and fulfilment.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/dashboard/transport"><ArrowLeft data-icon="inline-start" /> Back to transport</Link></Button>{canHrExecutive && <Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/transport/nonregional/new"><Plus data-icon="inline-start" /> New non-regional request</Link></Button>}{canCreate && <Button variant={canHrExecutive ? "outline" : "default"} asChild><Link href="/dashboard/transport"><Plus data-icon="inline-start" /> New regional request</Link></Button>}</div></header>
    {requestsError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Transport requests could not be loaded. Please refresh and try again.</div>}<TransportRequestRegister rows={requestsWithSignatures} canCreate={canCreate} canAct={canAct} canHrRecords={canHrRecords} canManagingDirector={canManagingDirector} canHrExecutive={canHrExecutive} regionalOfficeName={regionalOfficeName} currentUserId={user.id} />
  </main>
}
