import type { SupabaseClient } from "@supabase/supabase-js"
import { isNonRegionalTransportLocation } from "@/lib/role-capabilities"

const PRE_APPROVAL_REGIONAL_STAGES = [
  "submitted",
  "district_officer_review",
  "regional_hr_review",
  "regional_hr_correction",
  "awaiting_do_regional_hr_endorsement",
]

/**
 * Staff assigned to a non-regional location (Head Office, Swanzy Arcade, Awutu Stores, Nsawam Archives)
 * always raise non-regional requisitions. Older submissions were filed as regional requests because the
 * classification followed the travel route. This moves those still-unactioned rows into the non-regional
 * workflow. A row is only removed from the regional table after its replacement has been created.
 */
export async function moveMisfiledRegionalRequests(admin: SupabaseClient) {
  const { data: candidates } = await admin
    .from("transport_requests")
    .select("id, requester_id, origin, destination, purpose, event_date, passenger_count, supporting_documents, created_at")
    .eq("request_type", "regional_transport")
    .in("workflow_stage", PRE_APPROVAL_REGIONAL_STAGES)
    .limit(100)
  if (!candidates?.length) return 0

  const requesterIds = [...new Set(candidates.map((row) => row.requester_id).filter(Boolean))] as string[]
  if (!requesterIds.length) return 0

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, assigned_location_id, hod_id, departments(name)")
    .in("id", requesterIds)
  const locationIds = [...new Set((profiles ?? []).map((profile: any) => profile.assigned_location_id).filter(Boolean))] as string[]
  const { data: locations } = locationIds.length
    ? await admin.from("geofence_locations").select("id, name").in("id", locationIds)
    : { data: [] as { id: string; name: string }[] }
  const locationNameById = new Map((locations ?? []).map((location) => [location.id, location.name]))

  const misfiledRequesterIds = (profiles ?? [])
    .filter((profile: any) => isNonRegionalTransportLocation(locationNameById.get(profile.assigned_location_id)))
    .map((profile: any) => profile.id as string)
  if (!misfiledRequesterIds.length) return 0

  const { data: linkages } = await admin
    .from("loan_hod_linkages")
    .select("staff_user_id, hod_user_id")
    .in("staff_user_id", misfiledRequesterIds)
  const linkedHodByStaff = new Map<string, string>()
  for (const link of linkages ?? []) {
    if (!linkedHodByStaff.has(link.staff_user_id)) linkedHodByStaff.set(link.staff_user_id, link.hod_user_id)
  }
  const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id as string, profile]))

  let moved = 0
  for (const row of candidates) {
    if (!misfiledRequesterIds.includes(row.requester_id)) continue
    const profile: any = profileById.get(row.requester_id)
    const department = Array.isArray(profile?.departments) ? profile.departments[0]?.name : profile?.departments?.name
    const { error: insertError } = await admin.from("nonregional_transport_requisitions").insert({
      requester_id: row.requester_id,
      department: department || "Not specified",
      location: locationNameById.get(profile?.assigned_location_id) ?? "Head Office",
      origin: row.origin,
      destination: row.destination,
      purpose: row.purpose,
      required_at: row.event_date,
      persons_requiring_transport: row.passenger_count ?? 1,
      supporting_documents: row.supporting_documents ?? [],
      hod_id: linkedHodByStaff.get(row.requester_id) ?? profile?.hod_id ?? null,
      hod_decision: "pending",
      md_decision: "pending",
      status: "awaiting_hod_approval",
      created_at: row.created_at,
    })
    if (insertError) continue
    const { error: deleteError } = await admin.from("transport_requests").delete().eq("id", row.id)
    if (!deleteError) moved += 1
  }
  return moved
}
