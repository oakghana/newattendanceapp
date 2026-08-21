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
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(district_id, districts(region_id))")
    .eq("id", user.id)
    .single()
  const assignedLocation = profile?.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null
  const managerLocationId = profile?.assigned_location_id ?? null
  const managerDistrictId = assignedLocation?.district_id ?? null
  const managerRegionId = profile?.region_id ?? assignedLocation?.districts?.region_id ?? null
  if (!profile?.is_active || !isRegionalManagerRole(profile.role) || (!managerLocationId && !managerRegionId && !managerDistrictId)) return NextResponse.json({ error: "Only active Regional Managers with an assigned office can endorse requests." }, { status: 403 })
  const body = await request.json()
  const requestId = String(body.id ?? "")
  if (!requestId) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
  const { data: transportRequest } = await supabase.from("transport_requests").select("id, assigned_region_id, linked_district_id, origin_location_id, workflow_stage").eq("id", requestId).single()
  const withinScope = Boolean(transportRequest) && (
    (managerLocationId && transportRequest?.origin_location_id === managerLocationId) ||
    (!transportRequest?.origin_location_id && managerDistrictId && transportRequest?.linked_district_id === managerDistrictId) ||
    (!transportRequest?.origin_location_id && !managerDistrictId && managerRegionId && transportRequest?.assigned_region_id === managerRegionId)
  )
  if (!transportRequest || !withinScope) return NextResponse.json({ error: "This request is outside your assigned office." }, { status: 403 })
  const decision = body.decision === "deny" ? "deny" : "endorse"
  if (transportRequest.workflow_stage !== "regional_manager_endorsement") return NextResponse.json({ error: "This request is not awaiting Regional Manager action." }, { status: 409 })
  const update = decision === "deny"
    ? { status: "rejected", workflow_stage: "closed", updated_at: new Date().toISOString() }
    : { status: "endorsed", workflow_stage: "hr_records_review", updated_at: new Date().toISOString() }
  const { error } = await supabase.from("transport_requests").update(update).eq("id", requestId)
  if (error) return NextResponse.json({ error: `Unable to ${decision} this request.` }, { status: 500 })
  await supabase.from("transport_request_events").insert({ request_id: requestId, actor_id: user.id, action: decision === "deny" ? "regional_manager_denied" : "regional_manager_endorsed", from_stage: transportRequest.workflow_stage, to_stage: update.workflow_stage, comment: String(body.comment ?? (decision === "deny" ? "Denied by Regional Manager." : "Endorsed by Regional Manager for HR Records processing.")) })
  return NextResponse.json({ ok: true })
}
