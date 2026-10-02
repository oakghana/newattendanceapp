import { redirect } from "next/navigation"
import { ArrowLeft, Bus, Plus } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TransportRequestRegister } from "@/components/transport/transport-request-register"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canManageTransport, isChiefDriverRole, isDistrictOfficerRole, isRegionalDriverRole, isRegionalHrRole, isRegionalManagerRole, normalizeAppRole } from "@/lib/role-capabilities"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

export default async function TransportRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, region_id, assigned_location_id, regions(name), geofence_locations!user_profiles_assigned_location_id_fkey(name, district_id, districts(region_id))")
    .eq("id", user.id)
    .single()
  if (!profile || !profile.role) redirect("/dashboard")
  const normalizedRole = normalizeAppRole(profile.role)
  const locationId = profile.assigned_location_id ?? null
  const assignedLocationName = String((profile.geofence_locations as { name?: string | null } | null)?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const isExplicitNonRegionalLocation = new Set([
    "qcc head office",
    "head office swanzy arcade",
    "awutu stores",
    "awutu store",
    "nsawam archives",
    "nsawam archive",
  ]).has(assignedLocationName)
  const isRegionalRequester = ["staff", "contract", "audit_staff", "it-admin", "it_admin"].includes(normalizedRole) && Boolean(locationId) && !isExplicitNonRegionalLocation
  const canViewRegionalRegister = ["admin", "administrator"].includes(normalizedRole) || isRegionalRequester || isDistrictOfficerRole(profile.role) || isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role) || canManageTransport(profile.role) || normalizedRole === "managing_director" || ["hr_records", "hr_records_officer", "hr_records_manager", "hr_executive", "hr_executive_officer"].includes(normalizedRole)
  if (!canViewRegionalRegister) redirect("/dashboard")
  const isRegionalDriver = isRegionalDriverRole(profile.role)
  // Non-regional drivers only ever see their nonregional trips; regional drivers stay here (scoped to their own assigned trips below).
  if (normalizedRole === "driver" && !isRegionalDriver) redirect("/dashboard/transport/nonregional")
  const canCreate = isChiefDriverRole(profile.role) || isRegionalHrRole(profile.role) || ["department_head", "accounts_executive", "hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const canAct = isRegionalManagerRole(profile.role) || isChiefDriverRole(profile.role)
  const canDistrictOfficer = isDistrictOfficerRole(profile.role)
  const canRegionalHr = isRegionalHrRole(profile.role)
  const canHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizedRole)
  const canManagingDirector = normalizedRole === "managing_director"
  const canHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const assignedLocation = profile.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  const districtId = assignedLocation?.district_id ?? null
  const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  // Older profiles can have an assigned location without the nested district relation
  // in the session response. Resolve that relation before applying District Officer scope.
  const resolvedDistrictId = districtId ?? (locationId
    ? (await supabase.from("geofence_locations").select("district_id").eq("id", locationId).maybeSingle()).data?.district_id ?? null
    : null)
  const profileRegion = profile.regions as { name?: string | null } | null
  const locationRegionAliases: Record<string, string> = { kumasi: "Ashanti", "kumasi regional office": "Ashanti", accra: "Greater Accra", "accra regional office": "Greater Accra", takoradi: "Western", cape: "Central", sunyani: "Bono", tamale: "Northern", bolgatanga: "Upper East", wa: "Upper West", koforidua: "Eastern", ho: "Volta" }
  const locationKey = assignedLocationName.toLowerCase().replace(/\s+/g, " ").trim()
  const locationRegionName = Object.entries(locationRegionAliases).find(([key]) => locationKey.includes(key))?.[1] ?? ""
  const rawRegionalName = locationRegionName || (assignedLocationName && !/accra|head office/i.test(assignedLocationName) ? assignedLocationName : "") || profileRegion?.name?.trim() || ""
  const regionalOfficeName = rawRegionalName ? rawRegionalName.replace(/\s+Regional\s+Office$/i, "").replace(/\s+Region$/i, "").trim() + " Regional Office" : "Regional Office"
  const requestFields = "id, requester_id, request_type, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, linked_district_id, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, regional_manager_signer_id, regional_manager_signed_at, hr_records_amended_at, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url, assigned_region:geofence_locations!transport_requests_assigned_region_id_fkey(name, districts(region_id, regions(name)))"
  const regionalHrDataClient = canRegionalHr ? await createAdminClient() : supabase
  const { data: regionalHrAssignments } = canRegionalHr
    ? await regionalHrDataClient.from("regional_hr_office_locations").select("location_id, region_id").eq("regional_hr_user_id", user.id).eq("is_active", true)
    : { data: [] as { location_id: string; region_id?: string | null }[] }
  const regionalHrLocationIds = (regionalHrAssignments ?? []).map((assignment) => assignment.location_id).filter(Boolean)
  let regionalHrScopeLocationIds = regionalHrLocationIds
  let regionalHrScopeDistrictIds: string[] = []
  const regionalHrRegionIds = [...new Set([
    ...(regionId ? [regionId] : []),
    ...(regionalHrAssignments ?? []).map((assignment) => assignment.region_id).filter(Boolean),
  ])]
  if (canRegionalHr && locationId) {
    const ownedLocationIds = await resolveOwnedLocationIdsForRegionalOffice(regionalHrDataClient, locationId, regionId)
    regionalHrScopeLocationIds = [...new Set([...regionalHrScopeLocationIds, ...ownedLocationIds])]
  }
  if (canRegionalHr && regionalHrRegionIds.length) {
    const { data: regionalLocations } = await regionalHrDataClient
      .from("geofence_locations")
      .select("id, district_id, districts(region_id)")
    const scopedLocations = (regionalLocations ?? []).filter((location: any) => {
      const districtRegionId = Array.isArray(location.districts) ? location.districts[0]?.region_id : location.districts?.region_id
      return districtRegionId && regionalHrRegionIds.includes(districtRegionId)
    })
    regionalHrScopeLocationIds = scopedLocations.map((location: any) => location.id).filter(Boolean)
    regionalHrScopeDistrictIds = scopedLocations.map((location: any) => location.district_id).filter(Boolean)
  }
  let requestsQuery = (canRegionalHr ? regionalHrDataClient : supabase).from("transport_requests").select(requestFields).order("created_at", { ascending: false }).limit(200)
  if (isRegionalRequester) requestsQuery = requestsQuery.eq("id", "00000000-0000-0000-0000-000000000000")
  if (canHrExecutive) requestsQuery = requestsQuery.eq("request_type", "regional_transport")
  const regionalHrStages = ["submitted", "district_officer_review", "regional_hr_review", "regional_hr_correction", "awaiting_do_regional_hr_endorsement", "regional_manager_endorsement", "hr_records_review", "hr_executive_signing", "approved", "referenced", "completed", "closed"]
  if (canRegionalHr && !regionalHrScopeLocationIds.length && !regionalHrScopeDistrictIds.length && !regionalHrRegionIds.length) {
    requestsQuery = requestsQuery.eq("id", "00000000-0000-0000-0000-000000000000")
  }
  if (isDistrictOfficerRole(profile.role)) {
    if (locationId && resolvedDistrictId) {
      requestsQuery = requestsQuery.or(`origin_location_id.eq.${locationId},linked_district_id.eq.${resolvedDistrictId}`)
    } else if (locationId) {
      requestsQuery = requestsQuery.eq("origin_location_id", locationId)
    } else if (resolvedDistrictId) {
      requestsQuery = requestsQuery.eq("linked_district_id", resolvedDistrictId)
    } else if (regionId) {
      requestsQuery = requestsQuery.eq("assigned_region_id", regionId)
    } else {
      requestsQuery = requestsQuery.eq("id", "00000000-0000-0000-0000-000000000000")
    }
    requestsQuery = requestsQuery.in("workflow_stage", [
      "submitted",
      "district_officer_review",
      "regional_hr_review",
      "regional_hr_correction",
      "awaiting_do_regional_hr_endorsement",
    ])
  }
  if (isRegionalManagerRole(profile.role)) {
    if (locationId) requestsQuery = requestsQuery.or(`origin_location_id.eq.${locationId},origin_location_id.is.null`)
    if (!locationId && districtId) requestsQuery = requestsQuery.eq("linked_district_id", districtId)
    else if (!locationId && !districtId && regionId) requestsQuery = requestsQuery.eq("assigned_region_id", regionId)
    requestsQuery = requestsQuery.in("workflow_stage", ["regional_manager_endorsement", "hr_records_review", "hr_executive_signing", "approved", "referenced", "completed", "closed"])
  }
  // Regional Chief Drivers can review requests for their assigned region/location.
  // Head Office Chief Drivers retain nationwide visibility for transport operations.
  if (isRegionalDriver) {
    if (locationId) requestsQuery = requestsQuery.or(`origin_location_id.eq.${locationId},origin_location_id.is.null`)
    if (!locationId && districtId) requestsQuery = requestsQuery.eq("linked_district_id", districtId)
    else if (!locationId && !districtId && regionId) requestsQuery = requestsQuery.eq("assigned_region_id", regionId)
    requestsQuery = requestsQuery.eq("request_type", "regional_transport")
  }
  let { data: requests, error: requestsError } = await requestsQuery
  if (canRegionalHr && requestsError) {
    const fallback = await regionalHrDataClient
      .from("transport_requests")
.select("id, requester_id, request_type, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, linked_district_id, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, regional_manager_signer_id, regional_manager_signed_at, hr_records_amended_at, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url")
      .order("created_at", { ascending: false })
      .limit(500)
    requests = fallback.data as any[] | null
    requestsError = fallback.error
  }
  if ((canRegionalHr || isDistrictOfficerRole(profile.role)) && requests) {
    const requesterIds = [...new Set((requests ?? []).map((request: any) => request.requester_id).filter(Boolean))]
    const { data: requesterProfiles } = requesterIds.length
      ? await regionalHrDataClient
          .from("user_profiles")
          .select("id, first_name, last_name, assigned_location_id, region_id")
          .in("id", requesterIds)
      : { data: [] as any[] }
    const requesterLocationIds = [...new Set((requesterProfiles ?? []).map((profile: any) => profile.assigned_location_id).filter(Boolean))]
    const { data: requesterLocations } = requesterLocationIds.length
      ? await regionalHrDataClient.from("geofence_locations").select("id, name, district_id").in("id", requesterLocationIds)
      : { data: [] as any[] }
    const locationById = new Map((requesterLocations ?? []).map((location: any) => [location.id, location]))
    const requesterScope = new Map((requesterProfiles ?? []).map((profile: any) => {
      const location = locationById.get(profile.assigned_location_id)
      return [profile.id, { locationId: profile.assigned_location_id, districtId: location?.district_id, regionId: profile.region_id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Requester not linked", locationName: location?.name ?? "Location not assigned" }]
    }))
    const historyCounts = new Map<string, number>()
    for (const request of requests ?? []) {
      if (request.requester_id) historyCounts.set(request.requester_id, (historyCounts.get(request.requester_id) ?? 0) + 1)
    }
    requests = requests.filter((request: any) => {
      if (!regionalHrStages.includes(request.workflow_stage)) return false
      const requester = requesterScope.get(request.requester_id)
      return (
        regionalHrScopeLocationIds.includes(request.origin_location_id) ||
        regionalHrScopeDistrictIds.includes(request.linked_district_id) ||
        regionalHrRegionIds.includes(request.assigned_region_id) ||
        (requester?.locationId && regionalHrScopeLocationIds.includes(requester.locationId)) ||
        (requester?.districtId && regionalHrScopeDistrictIds.includes(requester.districtId)) ||
        (requester?.regionId && regionalHrRegionIds.includes(requester.regionId))
      )
    })
    const { data: legacyRegionalRequests } = await regionalHrDataClient
      .from("nonregional_transport_requisitions")
      .select("id, requester_id, purpose, origin, destination, required_at, persons_requiring_transport, status, created_at, reference_number")
      .in("status", ["submitted", "pending", "awaiting_hod", "awaiting_hod_approval", "approved", "completed"])
      .order("created_at", { ascending: false })
      .limit(200)
    const legacyRows = (legacyRegionalRequests ?? []).filter((request: any) => {
      const requester = requesterScope.get(request.requester_id)
      return requester?.locationId && regionalHrScopeLocationIds.includes(requester.locationId) || requester?.districtId && regionalHrScopeDistrictIds.includes(requester.districtId) || requester?.regionId && regionalHrRegionIds.includes(requester.regionId)
    }).map((request: any) => ({
      id: request.id,
      requester_id: request.requester_id,
      request_type: "regional_transport",
      purpose: request.purpose,
      origin: request.origin,
      destination: request.destination,
      event_date: request.required_at,
      passenger_count: request.persons_requiring_transport ?? 0,
      status: request.status ?? "submitted",
      workflow_stage: ["approved", "completed"].includes(request.status) ? request.status : "awaiting_do_regional_hr_endorsement",
      reference_number: request.reference_number,
      supporting_documents: [],
      created_at: request.created_at,
      assigned_region: [],
    }))
    const existingRequests = requests ?? []
    requests = [...existingRequests, ...legacyRows.filter((legacy: any) => !existingRequests.some((request: any) => request.id === legacy.id))] as any
    requests = (requests ?? []).map((request: any) => {
      const requester = requesterScope.get(request.requester_id)
      return { ...request, requester_name: requester?.name ?? "Unknown staff", requester_location: requester?.locationName ?? "Assigned location unavailable", previous_request_count: Math.max(0, (historyCounts.get(request.requester_id) ?? 1) - 1) }
    }) as any
  }
  const ownRequestFields = "id, requester_id, request_type, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, supporting_documents, created_at, assigned_region_id, linked_district_id, origin_location_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, regional_manager_signer_id, regional_manager_signed_at, hr_records_amended_at, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url"
  const ownRequestsClient = await createAdminClient()
  const ownRequestsQuery: any = ownRequestsClient
    .from("transport_requests")
    .select(ownRequestFields)
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)
  const { data: ownRequests, error: ownRequestsError } = await ownRequestsQuery
  const { data: ownNonregionalRequests } = await ownRequestsClient
    .from("nonregional_transport_requisitions")
    .select("id, requester_id, purpose, origin, destination, required_at, persons_requiring_transport, status, created_at, reference_number")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (canViewRegionalRegister && !ownRequestsError) {
    const scopedRequests = requests ?? []
    const personalRows = (ownRequests ?? []).map((request: any) => {
      const isPendingHod = ["submitted", "pending", "awaiting_hod", "hod_authorization", "awaiting_hod_approval"].includes(request.status ?? "") || ["submitted", "awaiting_hod", "hod_authorization", "awaiting_hod_approval"].includes(request.workflow_stage ?? "")
      const regionalRequesterView = isRegionalRequester && isPendingHod
      return {
        ...request,
        request_type: regionalRequesterView ? "regional_transport" : request.request_type,
        status: regionalRequesterView ? "awaiting_do_regional_hr_endorsement" : request.status,
        workflow_stage: regionalRequesterView ? "awaiting_do_regional_hr_endorsement" : request.workflow_stage,
        assigned_region: [],
      }
    })
    const nonregionalRows = (ownNonregionalRequests ?? []).map((request: any) => ({
      id: request.id,
      requester_id: request.requester_id,
      request_type: isRegionalRequester ? "regional_transport" : "nonregional_transport",
      purpose: request.purpose,
      origin: request.origin,
      destination: request.destination,
      event_date: request.required_at,
      passenger_count: request.persons_requiring_transport ?? 0,
      status: isRegionalRequester && !["approved", "rejected", "completed", "closed"].includes(request.status ?? "") ? "awaiting_do_regional_hr_endorsement" : request.status ?? "submitted",
      workflow_stage: isRegionalRequester && !["approved", "rejected", "completed", "closed"].includes(request.status ?? "") ? "awaiting_do_regional_hr_endorsement" : request.status ?? "submitted",
      reference_number: request.reference_number,
      supporting_documents: [],
      created_at: request.created_at,
      assigned_region: [],
    }))
    const allPersonalRows = [...personalRows, ...nonregionalRows]
    requests = [...scopedRequests, ...allPersonalRows.filter((request: any) => !scopedRequests.some((scopedRequest) => scopedRequest.id === request.id))]
      .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
  }
  if (canViewRegionalRegister && requests?.length) {
    const requesterIds = [...new Set(requests.map((request: any) => request.requester_id).filter(Boolean))]
    const adminClient = await createAdminClient()
    const { data: requesterProfiles } = await adminClient.from("user_profiles").select("id, first_name, last_name, assigned_location_id").in("id", requesterIds)
    const locationIds = [...new Set((requesterProfiles ?? []).map((profile: any) => profile.assigned_location_id).filter(Boolean))]
    const { data: requesterLocations } = locationIds.length ? await adminClient.from("geofence_locations").select("id, name").in("id", locationIds) : { data: [] as any[] }
    const locationsById = new Map((requesterLocations ?? []).map((location: any) => [location.id, location.name]))
    const profilesById = new Map((requesterProfiles ?? []).map((profile: any) => [profile.id, profile]))
    const finalHistory = new Map<string, number>()
    for (const request of requests) if (request.requester_id) finalHistory.set(request.requester_id, (finalHistory.get(request.requester_id) ?? 0) + 1)
    requests = requests.map((request: any) => {
      const requester = profilesById.get(request.requester_id)
      return { ...request, requester_name: requester ? [requester.first_name, requester.last_name].filter(Boolean).join(" ") || "Requester not linked" : "Requester not linked", requester_location: requester ? locationsById.get(requester.assigned_location_id) ?? "Location not assigned" : "Location not assigned", previous_request_count: Math.max(0, (finalHistory.get(request.requester_id) ?? 1) - 1) }
    })
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
    if (isRegionalDriver) {
      if (locationId) fallbackQuery = fallbackQuery.or(`origin_location_id.eq.${locationId},origin_location_id.is.null`)
      if (!locationId && districtId) fallbackQuery = fallbackQuery.eq("linked_district_id", districtId)
      else if (!locationId && !districtId && regionId) fallbackQuery = fallbackQuery.eq("assigned_region_id", regionId)
      fallbackQuery = fallbackQuery.eq("request_type", "regional_transport")
    }
    const fallback = await fallbackQuery
    const fallbackRequests = fallback.data?.map((request) => ({ ...request, assigned_region: [], regional_manager_signer_id: null, regional_manager_signed_at: null, hr_executive_signer_id: null, hr_executive_signed_at: null, hr_executive_signature_data_url: null })) ?? []
    const fallbackOwnRequests = ownRequests ?? []
    requests = [...fallbackRequests, ...fallbackOwnRequests.filter((request: any) => !fallbackRequests.some((scopedRequest) => scopedRequest.id === request.id))]
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
    {requestsError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Transport requests could not be loaded. Please refresh and try again.</div>}<TransportRequestRegister rows={requestsWithSignatures} canCreate={canCreate} canAct={canAct} canDistrictOfficer={canDistrictOfficer} canRegionalHr={canRegionalHr} canHrRecords={canHrRecords} canManagingDirector={canManagingDirector} canHrExecutive={canHrExecutive} regionalOfficeName={regionalOfficeName} currentUserId={user.id} />
  </main>
}
