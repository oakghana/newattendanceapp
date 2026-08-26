import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminRole, isDepartmentHeadRole, isTransportManagerRole, normalizeAppRole, NON_REGIONAL_TRANSPORT_LOCATIONS } from "@/lib/role-capabilities"

const locations = new Set<string>(NON_REGIONAL_TRANSPORT_LOCATIONS)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name)").eq("id", user.id).single()
  const role = normalizeAppRole(profile?.role)
  if (!profile || !["staff", "department_head", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "managing_director", "transport_manager", "admin", "driver"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  let query = supabase.from("nonregional_transport_requisitions").select("*, requester:user_profiles!requester_id(first_name,last_name,email), driver:user_profiles!recommended_driver_id(first_name,last_name,email)").order("created_at", { ascending: false })
  if (role === "driver") {
    const locationName = (profile.geofence_locations as { name?: string } | null)?.name
    if (locationName) query = query.or(`driver_id.eq.${user.id},location.eq.${locationName}`)
    else query = query.eq("driver_id", user.id)
  } else if (["staff", "department_head", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(role)) query = query.eq("requester_id", user.id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: drivers } = await supabase.from("user_profiles").select("id,first_name,last_name,assigned_location_id,geofence_locations!user_profiles_assigned_location_id_fkey(name)").eq("role", "driver").eq("is_active", true)
  return NextResponse.json({ requests: data ?? [], drivers: drivers ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, signature_data_url").eq("id", user.id).single()
  const submitterRole = normalizeAppRole(profile?.role)
  const canSubmit = isDepartmentHeadRole(profile?.role) || ["hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(submitterRole)
  if (!canSubmit && !isAdminRole(profile?.role)) return NextResponse.json({ error: "Only Department Heads or HR Executives can submit this requisition." }, { status: 403 })
  const body = await request.json()
  const required = ["department", "location", "origin", "destination", "purpose", "requiredAt", "personsRequiringTransport", "hodAuthorization"]
  if (required.some((key) => !String(body[key] ?? "").trim()) || !locations.has(String(body.location))) return NextResponse.json({ error: "Complete all requisition fields and select an approved location." }, { status: 400 })
  const { data, error } = await supabase.from("nonregional_transport_requisitions").insert({ requester_id: user.id, department: String(body.department).trim(), location: String(body.location), origin: String(body.origin).trim(), destination: String(body.destination).trim(), purpose: String(body.purpose).trim(), required_at: String(body.requiredAt), return_at: body.returnAt ? String(body.returnAt) : null, persons_requiring_transport: String(body.personsRequiringTransport).trim(), hod_authorization: String(body.hodAuthorization).trim(), hod_signature_data_url: body.hodSignatureDataUrl ?? null, supporting_documents: Array.isArray(body.supportingDocuments) ? body.supportingDocuments.slice(0, 10) : [], department_head_signer_id: user.id, department_head_signed_at: new Date().toISOString(), department_head_signature_data_url: body.hodSignatureDataUrl ?? profile?.signature_data_url ?? null }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  const role = normalizeAppRole(profile?.role)
  const body = await request.json()
  const id = String(body.id ?? "")
  if (!id) return NextResponse.json({ error: "Requisition id is required." }, { status: 400 })
  const { data: row } = await supabase.from("nonregional_transport_requisitions").select("*").eq("id", id).single()
  if (!row) return NextResponse.json({ error: "Requisition not found." }, { status: 404 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (role === "managing_director" && row.md_decision === "pending" && ["approve", "reject"].includes(body.decision)) { update.md_decision = body.decision === "approve" ? "approved" : "rejected"; update.md_decided_by = user.id; update.md_decided_at = new Date().toISOString(); update.status = body.decision === "approve" ? "awaiting_transport_manager" : "rejected" }
  else if ((isTransportManagerRole(role) || isAdminRole(role)) && row.md_decision === "approved" && body.decision === "assign_driver") { const driverId = String(body.driverId ?? ""); const { data: driver } = await supabase.from("user_profiles").select("id,role,assigned_location_id,geofence_locations!user_profiles_assigned_location_id_fkey(name)").eq("id", driverId).single(); const driverLocation = (driver?.geofence_locations as { name?: string } | null)?.name; if (!driver || driver.role !== "driver" || driverLocation !== row.location) return NextResponse.json({ error: "Select a driver assigned to the requisition location." }, { status: 400 }); update.recommended_driver_id = driverId; update.recommended_vehicle = String(body.recommendedVehicle ?? "").trim(); update.transport_use_date = body.transportUseDate || null; update.dtm_signature_data_url = body.dtmSignatureDataUrl ?? null; update.transport_manager_id = user.id; update.transport_manager_signer_id = user.id; update.transport_manager_signed_at = new Date().toISOString(); update.transport_manager_signature_data_url = body.dtmSignatureDataUrl ?? null; update.status = "assigned" }
  else return NextResponse.json({ error: "This action is not available for your role or the current stage." }, { status: 403 })
  const { error } = await supabase.from("nonregional_transport_requisitions").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
