import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isRegionalManagerRole } from "@/lib/role-capabilities"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(district_id, districts(region_id))")
    .eq("id", user.id)
    .single()
  const role = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const regionalHrRoles = new Set(["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"])
  if (!profile?.is_active || !regionalHrRoles.has(role)) return NextResponse.json({ error: "Only active Regional HR Office users can create transport requests." }, { status: 403 })
  const assignedLocation = profile.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  const linkedDistrictId = assignedLocation?.district_id ?? null
  const assignedRegionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  const originLocationId = profile.assigned_location_id ?? null
  const body = await request.json()
  const purpose = String(body.purpose ?? "").trim()
  const origin = String(body.origin ?? "").trim()
  const destination = String(body.destination ?? "").trim()
  const eventDate = String(body.eventDate ?? "").trim()
  const passengerCount = Number(body.passengerCount)
  const supportingDocuments = Array.isArray(body.supportingDocuments) ? body.supportingDocuments.slice(0, 10).map((document: unknown) => { const item = document as Record<string, unknown>; return { name: String(item.name ?? "supporting-document"), url: String(item.url ?? ""), type: String(item.type ?? "application/octet-stream"), size: Number(item.size ?? 0) } }).filter((document: { url: string }) => document.url) : []
  if (!purpose || !origin || !destination || !eventDate || !Number.isInteger(passengerCount) || passengerCount < 1) return NextResponse.json({ error: "Complete all required request details." }, { status: 400 })
  const { data, error } = await supabase.from("transport_requests").insert({ requester_id: user.id, request_type: "regional_transport", purpose, origin, destination, event_date: eventDate, passenger_count: passengerCount, status: "submitted", workflow_stage: "regional_manager_endorsement", supporting_documents: supportingDocuments, assigned_region_id: assignedRegionId, linked_district_id: linkedDistrictId, origin_location_id: originLocationId }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(district_id, districts(region_id))").eq("id", user.id).single()
  const role = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(role)
  const isManagingDirector = role === "managing_director"
  const isManager = isRegionalManagerRole(profile?.role)
  if (!profile?.is_active || (!isManager && !isHrRecords && !isManagingDirector)) return NextResponse.json({ error: "You do not have permission to process this request." }, { status: 403 })
  const body = await request.json()
  const requestId = String(body.id ?? "")
  const decision = String(body.decision ?? "")
  if (!requestId) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
  const { data: row } = await supabase.from("transport_requests").select("id, assigned_region_id, linked_district_id, origin_location_id, workflow_stage").eq("id", requestId).single()
  if (!row) return NextResponse.json({ error: "Transport request not found." }, { status: 404 })
  const assignedLocation = profile.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  if (isManager) {
    const locationId = profile.assigned_location_id ?? null
    const districtId = assignedLocation?.district_id ?? null
    const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
    const inScope = Boolean((locationId && row.origin_location_id === locationId) || (!row.origin_location_id && districtId && row.linked_district_id === districtId) || (!row.origin_location_id && !districtId && regionId && row.assigned_region_id === regionId))
    if (!inScope) return NextResponse.json({ error: "This request is outside your assigned office." }, { status: 403 })
    if (row.workflow_stage !== "regional_manager_endorsement" || !["endorse", "deny"].includes(decision)) return NextResponse.json({ error: "This request is not awaiting Regional Manager action." }, { status: 409 })
  } else if (isHrRecords) {
    if (row.workflow_stage !== "hr_records_review" || !["correct", "return_for_correction", "forward_to_md"].includes(decision)) return NextResponse.json({ error: "This request is not awaiting HR Records action." }, { status: 409 })
  } else if (row.workflow_stage !== "managing_director_approval" || !["approve", "reject"].includes(decision)) return NextResponse.json({ error: "This request is not awaiting Managing Director action." }, { status: 409 })
  let update: Record<string, unknown>
  if (decision === "endorse") update = { status: "endorsed", workflow_stage: "hr_records_review", updated_at: new Date().toISOString() }
  else if (decision === "deny" || decision === "reject") update = { status: "rejected", workflow_stage: "closed", updated_at: new Date().toISOString() }
  else if (decision === "return_for_correction") update = { status: "returned_for_correction", workflow_stage: "regional_hr_correction", updated_at: new Date().toISOString() }
  else if (decision === "forward_to_md") update = { status: "pending_md_approval", workflow_stage: "managing_director_approval", updated_at: new Date().toISOString() }
  else if (decision === "approve") update = { status: "approved", workflow_stage: "completed", updated_at: new Date().toISOString() }
  else update = { purpose: String(body.purpose ?? "").trim(), origin: String(body.origin ?? "").trim(), destination: String(body.destination ?? "").trim(), event_date: String(body.eventDate ?? "").trim(), passenger_count: Number(body.passengerCount), status: "endorsed", workflow_stage: "hr_records_review", updated_at: new Date().toISOString() }
  if (decision === "correct" && (!update.purpose || !update.origin || !update.destination || !update.event_date || !Number.isInteger(update.passenger_count) || Number(update.passenger_count) < 1)) return NextResponse.json({ error: "Complete all correction fields." }, { status: 400 })
  const { error } = await supabase.from("transport_requests").update(update).eq("id", requestId)
  if (error) return NextResponse.json({ error: `Unable to process this request: ${error.message}` }, { status: 500 })
  await supabase.from("transport_request_events").insert({ request_id: requestId, actor_id: user.id, action: `transport_${decision}`, from_stage: row.workflow_stage, to_stage: update.workflow_stage, comment: String(body.comment ?? `Transport request ${decision.replace(/_/g, " ")}.`) })
  return NextResponse.json({ ok: true })
}
