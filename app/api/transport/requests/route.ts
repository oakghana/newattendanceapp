import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isRegionalManagerRole } from "@/lib/role-capabilities"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active").eq("id", user.id).single()
  const role = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const regionalHrRoles = new Set(["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"])
  if (!profile?.is_active || !regionalHrRoles.has(role)) return NextResponse.json({ error: "Only active Regional HR Office users can create transport requests." }, { status: 403 })
  const body = await request.json()
  const purpose = String(body.purpose ?? "").trim()
  const origin = String(body.origin ?? "").trim()
  const destination = String(body.destination ?? "").trim()
  const eventDate = String(body.eventDate ?? "").trim()
  const passengerCount = Number(body.passengerCount)
  const supportingDocuments = Array.isArray(body.supportingDocuments) ? body.supportingDocuments.slice(0, 10).map((document: unknown) => { const item = document as Record<string, unknown>; return { name: String(item.name ?? "supporting-document"), url: String(item.url ?? ""), type: String(item.type ?? "application/octet-stream"), size: Number(item.size ?? 0) } }).filter((document: { url: string }) => document.url) : []
  if (!purpose || !origin || !destination || !eventDate || !Number.isInteger(passengerCount) || passengerCount < 1) return NextResponse.json({ error: "Complete all required request details." }, { status: 400 })
  const { data, error } = await supabase.from("transport_requests").insert({ requester_id: user.id, request_type: "regional_transport", purpose, origin, destination, event_date: eventDate, passenger_count: passengerCount, status: "submitted", workflow_stage: "regional_hr_review", supporting_documents: supportingDocuments }).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id").eq("id", user.id).single()
  if (!profile?.is_active || !isRegionalManagerRole(profile.role) || !profile.region_id) return NextResponse.json({ error: "Only active Regional Managers can endorse requests in their region." }, { status: 403 })
  const body = await request.json()
  const requestId = String(body.id ?? "")
  if (!requestId) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
  const { data: transportRequest } = await supabase.from("transport_requests").select("id, assigned_region_id, workflow_stage").eq("id", requestId).single()
  if (!transportRequest || transportRequest.assigned_region_id !== profile.region_id) return NextResponse.json({ error: "This request is outside your assigned region." }, { status: 403 })
  const { error } = await supabase.from("transport_requests").update({ status: "endorsed", workflow_stage: "hr_records_review", updated_at: new Date().toISOString() }).eq("id", requestId)
  if (error) return NextResponse.json({ error: "Unable to endorse this request." }, { status: 500 })
  await supabase.from("transport_request_events").insert({ request_id: requestId, actor_id: user.id, action: "regional_manager_endorsed", from_stage: transportRequest.workflow_stage, to_stage: "hr_records_review", comment: String(body.comment ?? "Endorsed by Regional Manager for HR Records processing.") })
  return NextResponse.json({ ok: true })
}
