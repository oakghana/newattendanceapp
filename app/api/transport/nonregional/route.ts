import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  isAdminRole,
  isChiefDriverRole,
  isDepartmentHeadRole,
  isTransportManagerRole,
  normalizeAppRole,
  NON_REGIONAL_TRANSPORT_LOCATIONS,
} from "@/lib/role-capabilities"

const locations = new Set<string>(NON_REGIONAL_TRANSPORT_LOCATIONS)

const VIEW_ROLES = new Set([
  "staff",
  "hr",
  "department_head",
  "hr_executive",
  "hr_executive_officer",
  "manager_hr",
  "director_hr",
  "managing_director",
  "transport_manager",
  "chief_driver",
  "admin",
  "it-admin",
  "driver",
])

const SUBMIT_ROLES = new Set([
  "staff",
  "hr",
  "department_head",
  "hr_executive",
  "hr_executive_officer",
  "manager_hr",
  "director_hr",
  "admin",
  "it-admin",
])

function canSelfAuthorize(role: string): boolean {
  return isDepartmentHeadRole(role) || ["hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(role)
}

async function loadSignature(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("signature_data_url, first_name, last_name, position")
    .eq("id", userId)
    .maybeSingle()
  let signatureDataUrl = String(profile?.signature_data_url || "").trim() || null
  if (!signatureDataUrl) {
    const { data: registered } = await supabase
      .from("approval_signature_registry")
      .select("signature_data_url")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    signatureDataUrl = String(registered?.signature_data_url || "").trim() || null
  }
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
  const authorization = name ? `${name}${profile?.position ? ` — ${profile.position}` : ""}`.toUpperCase() : ""
  return { signatureDataUrl, authorization, name }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name)")
    .eq("id", user.id)
    .single()
  const role = normalizeAppRole(profile?.role)
  if (!profile || !VIEW_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const requestedPageSize = Number(searchParams.get("pageSize") ?? "25")
  const pageSize = Math.min(Math.max(Number.isInteger(requestedPageSize) ? requestedPageSize : 25, 10), 100)
  const requiredDate = String(searchParams.get("date") ?? "").trim()
  const dateStart = /^\d{4}-\d{2}-\d{2}$/.test(requiredDate) ? `${requiredDate}T00:00:00.000Z` : null
  const dateEnd = dateStart ? `${requiredDate}T23:59:59.999Z` : null

  let query = supabase
    .from("nonregional_transport_requisitions")
    .select(
      "*, requester:user_profiles!requester_id(first_name,last_name,email,signature_data_url), driver:user_profiles!recommended_driver_id(first_name,last_name,email)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })

  const viewerLocation = (profile.geofence_locations as { name?: string } | null)?.name ?? null

  if (role === "driver") {
    if (viewerLocation) query = query.or(`recommended_driver_id.eq.${user.id},location.eq.${viewerLocation}`)
    else query = query.eq("recommended_driver_id", user.id)
  } else if (isChiefDriverRole(role)) {
    // Chief Drivers only see requisitions for their own location.
    if (viewerLocation) query = query.eq("location", viewerLocation)
    else query = query.eq("location", "__no_assigned_location__")
  } else if (isAdminRole(role) || role === "managing_director" || isTransportManagerRole(role) || role === "it-admin") {
    // full queue
  } else if (isDepartmentHeadRole(role)) {
    query = query.or(`requester_id.eq.${user.id},hod_id.eq.${user.id}`)
  } else {
    query = query.eq("requester_id", user.id)
  }

  if (dateStart && dateEnd) query = query.gte("required_at", dateStart).lte("required_at", dateEnd)

  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: drivers } = await supabase
    .from("user_profiles")
    .select("id,first_name,last_name,assigned_location_id,geofence_locations!user_profiles_assigned_location_id_fkey(name)")
    .eq("role", "driver")
    .eq("is_active", true)

  return NextResponse.json({
    requests: data ?? [],
    drivers: drivers ?? [],
    viewerRole: role,
    viewerId: user.id,
    viewerLocation,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      requiredDate: requiredDate || null,
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let profile: any = null
  let profileError: any = null
  ;({ data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, signature_data_url, hod_id, first_name, last_name, position, department_id")
    .eq("id", user.id)
    .single())
  if (profileError && /column .*does not exist|hod_id/i.test(profileError.message || "")) {
    ;({ data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, signature_data_url, first_name, last_name, position, department_id")
      .eq("id", user.id)
      .single())
  }
  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? "Profile not found" }, { status: 500 })
  }

  const submitterRole = normalizeAppRole(profile?.role)
  if (!SUBMIT_ROLES.has(submitterRole) && !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "You are not allowed to submit non-regional transport requisitions." }, { status: 403 })
  }

  const body = await request.json()
  const required = ["department", "location", "origin", "destination", "purpose", "requiredAt", "personsRequiringTransport"]
  const peopleCount = Number(body.personsCount)
  const personNames = String(body.personNames ?? body.personsRequiringTransport ?? "").trim()
  const names = personNames.split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean)
  if (
    required.some((key) => key !== "personsRequiringTransport" && !String(body[key] ?? "").trim()) ||
    !locations.has(String(body.location)) ||
    !Number.isInteger(peopleCount) ||
    peopleCount < 1 ||
    names.length < 1 ||
    names.length > peopleCount
  ) {
    return NextResponse.json({ error: "Enter a valid number of people and at least one person's name. The number of names cannot exceed the people count." }, { status: 400 })
  }
  // Some deployed databases use an integer for this legacy column. Keep the
  // count numeric and persist names separately when that column is available.
  const personsRequiringTransport = peopleCount

  // A linked HOD must approve first. Department Heads and HR Executives submit
  // their own departmental requisitions directly to the Managing Director.
  const selfAuth = canSelfAuthorize(submitterRole) && !isAdminRole(submitterRole)
  const signedAt = new Date().toISOString()
  const hodId = profile.hod_id ? String(profile.hod_id) : null

  // Non-HOD staff must route to their linked HOD first; authorization stays blank until HOD signs.
  if (!selfAuth) {
    if (!hodId) {
      return NextResponse.json(
        { error: "No Head of Department is linked to your profile. Ask HR/Admin to set your HOD before submitting." },
        { status: 400 },
      )
    }

    const insertPayload: Record<string, unknown> = {
      requester_id: user.id,
      department: String(body.department).trim(),
      location: String(body.location),
      origin: String(body.origin).trim(),
      destination: String(body.destination).trim(),
      purpose: String(body.purpose).trim(),
      required_at: String(body.requiredAt),
      return_at: body.returnAt ? String(body.returnAt) : null,
      persons_requiring_transport: personsRequiringTransport,
      hod_authorization: null,
      hod_signature_data_url: null,
      supporting_documents: Array.isArray(body.supportingDocuments) ? body.supportingDocuments.slice(0, 10) : [],
      hod_id: hodId,
      hod_decision: "pending",
      md_decision: "pending",
      status: "awaiting_hod_approval",
      requester_signature_data_url: body.requesterSignatureDataUrl ?? profile.signature_data_url ?? null,
      requester_signed_at: signedAt,
    }

    let { data, error } = await supabase.from("nonregional_transport_requisitions").insert({ ...insertPayload, person_names: personNames }).select("id,status").single()
    if (error && /column .*person_names.*does not exist|schema cache/i.test(error.message)) {
      ;({ data, error } = await supabase.from("nonregional_transport_requisitions").insert(insertPayload).select("id,status").single())
    }
    if (error && /column .*does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "Database is missing HOD approval columns. Apply migration 107_nonregional_requester_hod_approval.sql, then retry.",
          detail: error.message,
        },
        { status: 500 },
      )
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(
      { id: data.id, status: data.status, next: "awaiting_hod_approval", message: "Submitted for Head of Department authorization." },
      { status: 201 },
    )
  }

  // A Department Head or HR Executive self-authorizes their own requisition and
  // it proceeds directly to the MD. This does not grant approval authority over
  // other requesters' non-regional requisitions.
  const signatureDataUrl = body.hodSignatureDataUrl ?? profile.signature_data_url ?? null
  const hodAuthorization = String(body.hodAuthorization ?? "").trim()
  if (!hodAuthorization || !signatureDataUrl) {
    return NextResponse.json(
      { error: "Departmental authorization and signature are required when you submit as a Department Head or HR Executive." },
      { status: 400 },
    )
  }

  const insertPayload: Record<string, unknown> = {
    requester_id: user.id,
    department: String(body.department).trim(),
    location: String(body.location),
    origin: String(body.origin).trim(),
    destination: String(body.destination).trim(),
    purpose: String(body.purpose).trim(),
    required_at: String(body.requiredAt),
    return_at: body.returnAt ? String(body.returnAt) : null,
    persons_requiring_transport: personsRequiringTransport,
    hod_authorization: hodAuthorization,
    hod_signature_data_url: signatureDataUrl,
    supporting_documents: Array.isArray(body.supportingDocuments) ? body.supportingDocuments.slice(0, 10) : [],
    department_head_signer_id: user.id,
    department_head_signed_at: signedAt,
    department_head_signature_data_url: signatureDataUrl,
    hod_id: user.id,
    hod_decision: "approved",
    hod_decided_by: user.id,
    hod_decided_at: signedAt,
    md_decision: "pending",
    status: "awaiting_md_approval",
    requester_signature_data_url: signatureDataUrl,
    requester_signed_at: signedAt,
  }

  let { data, error } = await supabase.from("nonregional_transport_requisitions").insert({ ...insertPayload, person_names: personNames }).select("id,status").single()
  if (error && /column .*person_names.*does not exist|schema cache/i.test(error.message)) {
    ;({ data, error } = await supabase.from("nonregional_transport_requisitions").insert(insertPayload).select("id,status").single())
  }
  if (error && /column .*does not exist|schema cache/i.test(error.message)) {
    const {
      department_head_signer_id,
      department_head_signed_at,
      department_head_signature_data_url,
      hod_id,
      hod_decision,
      hod_decided_by,
      hod_decided_at,
      requester_signature_data_url,
      requester_signed_at,
      ...fallbackPayload
    } = insertPayload
    fallbackPayload.status = "submitted"
    ;({ data, error } = await supabase.from("nonregional_transport_requisitions").insert(fallbackPayload).select("id,status").single())
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { id: data.id, status: data.status, next: "awaiting_md_approval", message: "Submitted for Managing Director approval." },
    { status: 201 },
  )
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name)")
    .eq("id", user.id)
    .single()
  const role = normalizeAppRole(profile?.role)
  const body = await request.json()
  const id = String(body.id ?? "")
  if (!id) return NextResponse.json({ error: "Requisition id is required." }, { status: 400 })

  const { data: row } = await supabase.from("nonregional_transport_requisitions").select("*").eq("id", id).single()
  if (!row) return NextResponse.json({ error: "Requisition not found." }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const hodDecision = String(row.hod_decision ?? "pending")
  const mdReady = hodDecision === "approved"
  const isAssignedHod = row.hod_id && String(row.hod_id) === user.id

  // Stage 1 — Head of Department authorization
  if (
    ["approve_hod", "reject_hod", "approve", "reject"].includes(String(body.decision)) &&
    (body.stage === "hod" ||
      row.status === "awaiting_hod_approval" ||
      (hodDecision === "pending" &&
        body.decision !== "assign_driver" &&
        role !== "managing_director" &&
        !isTransportManagerRole(role) &&
        body.stage !== "md"))
  ) {
    const decision = String(body.decision).includes("reject") ? "reject" : "approve"
    const actingAsHod =
      isAssignedHod

    if (!actingAsHod) {
      return NextResponse.json({ error: "Only the assigned Head of Department can authorize this requisition." }, { status: 403 })
    }
    if (hodDecision !== "pending" && row.status !== "awaiting_hod_approval") {
      return NextResponse.json({ error: "This requisition is not awaiting HOD authorization." }, { status: 400 })
    }

    if (decision === "reject") {
      update.hod_decision = "rejected"
      update.hod_decided_by = user.id
      update.hod_decided_at = new Date().toISOString()
      update.status = "rejected"
      update.md_decision = "rejected"
    } else {
      const signed = await loadSignature(supabase, user.id)
      const signatureDataUrl = body.hodSignatureDataUrl ?? signed.signatureDataUrl
      const authorization = String(body.hodAuthorization ?? signed.authorization ?? "").trim()
      if (!signatureDataUrl || !authorization) {
        return NextResponse.json(
          { error: "Save your signature in Profile before authorizing as Head of Department." },
          { status: 400 },
        )
      }
      const now = new Date().toISOString()
      update.hod_decision = "approved"
      update.hod_decided_by = user.id
      update.hod_decided_at = now
      update.hod_authorization = authorization
      update.hod_signature_data_url = signatureDataUrl
      update.department_head_signer_id = user.id
      update.department_head_signed_at = now
      update.department_head_signature_data_url = signatureDataUrl
      update.md_decision = "pending"
      update.status = "awaiting_md_approval"
    }
  }
  // Stage 2 — Managing Director only
  else if (
    role === "managing_director" &&
    mdReady &&
    row.md_decision === "pending" &&
    ["approve", "reject"].includes(String(body.decision)) &&
    body.stage !== "hod"
  ) {
    update.md_decision = body.decision === "approve" ? "approved" : "rejected"
    update.md_decided_by = user.id
    update.md_decided_at = new Date().toISOString()
    update.status = body.decision === "approve" ? "awaiting_transport_manager" : "rejected"
  }
  // Stage 3 — Transport Manager / admin assign any active driver; Chief Driver
  // is limited to drivers in his own location or region.
  else if (
    (isTransportManagerRole(role) || isAdminRole(role) || isChiefDriverRole(role)) &&
    row.md_decision === "approved" &&
    body.decision === "assign_driver"
  ) {
    const driverId = String(body.driverId ?? "")
    const vehicleId = String(body.vehicleId ?? "")
    const { data: driver } = await supabase
      .from("user_profiles")
      .select("id,role,is_active,region_id,assigned_location_id,geofence_locations!user_profiles_assigned_location_id_fkey(name)")
      .eq("id", driverId)
      .single()
    if (!driver || driver.role !== "driver" || driver.is_active === false) {
      return NextResponse.json({ error: "Select an active driver from the driver list." }, { status: 400 })
    }
    if (isChiefDriverRole(role)) {
      const actorLocationId = profile?.assigned_location_id ?? null
      const actorRegionId = profile?.region_id ?? null
      const sameLocation = Boolean(actorLocationId && driver.assigned_location_id === actorLocationId)
      const sameRegion = Boolean(!actorLocationId && actorRegionId && driver.region_id === actorRegionId)
      if (!sameLocation && !sameRegion) {
        return NextResponse.json(
          { error: "Chief Drivers can only assign drivers from their own location or region." },
          { status: 403 },
        )
      }
    }
    const { data: vehicle } = await supabase
      .from("transport_vehicles")
      .select("id, registration_number, make, model, capacity, status, assigned_location_id, assigned_region_id")
      .eq("id", vehicleId)
      .maybeSingle()
    if (!vehicle || vehicle.status !== "available") {
      return NextResponse.json({ error: "Select an available vehicle from the fleet list." }, { status: 400 })
    }
    if (Number(vehicle.capacity ?? 0) < Number(row.persons_requiring_transport ?? 0)) {
      return NextResponse.json({ error: "Select a vehicle with enough seats for all passengers." }, { status: 400 })
    }
    if (isChiefDriverRole(role)) {
      const actorLocationId = profile?.assigned_location_id ?? null
      const actorRegionId = profile?.region_id ?? null
      const sameLocation = Boolean(actorLocationId && vehicle.assigned_location_id === actorLocationId)
      const sameRegion = Boolean(!actorLocationId && actorRegionId && vehicle.assigned_region_id === actorRegionId)
      if (!sameLocation && !sameRegion) {
        return NextResponse.json({ error: "Chief Drivers can only assign vehicles from their own location or region." }, { status: 403 })
      }
    }
    // Transport Manager / admin may assign any active driver; drivers at the
    // requisition location are listed first in the assignment dialog.
    update.recommended_driver_id = driverId
    update.recommended_vehicle = `${vehicle.registration_number} - ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
    update.transport_use_date = body.transportUseDate || null
    update.dtm_signature_data_url = body.dtmSignatureDataUrl ?? null
    update.transport_manager_id = user.id
    update.transport_manager_signer_id = user.id
    update.transport_manager_signed_at = new Date().toISOString()
    update.transport_manager_signature_data_url = body.dtmSignatureDataUrl ?? null
    update.status = "assigned"
  } else {
    return NextResponse.json({ error: "This action is not available for your role or the current stage." }, { status: 403 })
  }

  let { error } = await supabase.from("nonregional_transport_requisitions").update(update).eq("id", id)
  if (error && /column .*does not exist|schema cache/i.test(error.message)) {
    const stripped = { ...update }
    for (const key of [
      "hod_decision",
      "hod_decided_by",
      "hod_decided_at",
      "department_head_signer_id",
      "department_head_signed_at",
      "department_head_signature_data_url",
      "transport_manager_signer_id",
      "transport_manager_signed_at",
      "transport_manager_signature_data_url",
    ]) {
      delete stripped[key]
    }
    ;({ error } = await supabase.from("nonregional_transport_requisitions").update(stripped).eq("id", id))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: update.status })
}
