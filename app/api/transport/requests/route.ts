import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  isAdminRole,
  isChiefDriverRole,
  isRegionalHrRole,
  isRegionalManagerRole,
  isTransportManagerRole,
} from "@/lib/role-capabilities"
import { isAssignableRegionalStage, isCompletableTransportStage, transportStageLabel } from "@/lib/transport-workflow"

/** Best-effort in-app notice; never fails the transport action. */
async function notifyTransportActors(entries: { user_id: string; message: string; type: string; reference_id: string }[]) {
  if (!entries.length) return
  try {
    const admin = await createAdminClient()
    const payload = entries
      .filter((e) => e.user_id)
      .map((e) => ({
        user_id: e.user_id,
        message: e.message,
        type: e.type,
        reference_id: e.reference_id,
        is_read: false,
        created_at: new Date().toISOString(),
      }))
    if (!payload.length) return
    const { error } = await admin.from("staff_notifications").insert(payload)
    if (error) console.warn("[transport] staff_notifications insert skipped:", error.message)
  } catch (error) {
    console.warn("[transport] notification skipped (non-fatal):", error)
  }
}

async function notifyRoleHolders(
  roles: string[],
  message: string,
  type: string,
  referenceId: string,
  excludeUserId?: string,
) {
  try {
    const admin = await createAdminClient()
    const { data: holders } = await admin
      .from("user_profiles")
      .select("id")
      .in("role", roles)
      .eq("is_active", true)
      .limit(40)
    const entries = (holders ?? [])
      .map((h) => h.id as string)
      .filter((id) => id && id !== excludeUserId)
      .map((user_id) => ({ user_id, message, type, reference_id: referenceId }))
    await notifyTransportActors(entries)
  } catch (error) {
    console.warn("[transport] role notify skipped:", error)
  }
}

function buildHrExecutiveRejoinderMemo(row: {
  purpose?: string | null
  origin?: string | null
  destination?: string | null
  event_date?: string | null
  passenger_count?: number | null
  memo_subject?: string | null
  memo_body?: string | null
  memo_reference?: string | null
  memo_date?: string | null
  memo_amendments?: string | null
}) {
  const purpose = String(row.purpose ?? "approved transport request").trim() || "approved transport request"
  const origin = String(row.origin ?? "").trim() || "the origin"
  const destination = String(row.destination ?? "").trim() || "the destination"
  const passengerCount = Number(row.passenger_count ?? 0) || 0
  const eventDate = row.event_date
    ? new Date(`${row.event_date}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "the approved date"
  let regionalManagerComment: string | null = null
  let hrAmendments = ""
  try {
    const amendments = row.memo_amendments
      ? (JSON.parse(row.memo_amendments) as Record<string, unknown>)
      : null
    if (amendments && typeof amendments === "object" && !Array.isArray(amendments)) {
      regionalManagerComment =
        typeof amendments.regional_manager_comment === "string"
          ? amendments.regional_manager_comment
          : null
      hrAmendments = typeof amendments.text === "string" ? amendments.text : ""
    }
  } catch {
    /* keep empty amendments */
  }
  const cleanSubject = String(row.memo_subject ?? purpose)
    .trim()
    .replace(/^\s*(re:\s*)+/i, "")
  const memoSubject = `RE: ${cleanSubject || purpose}`
  const memoBody =
    String(row.memo_body ?? "").trim() ||
    [
      `Management has approved transportation support for the ${purpose.toLowerCase()} in the ${destination} District Office.`,
      `The approved vehicle support is for the transportation of ${passengerCount} passengers from ${origin} to ${destination} on ${eventDate}.`,
      hrAmendments ? `Regional HR Office remarks: ${hrAmendments}` : "",
      regionalManagerComment
        ? `Regional Manager's approval comment: ${regionalManagerComment}`
        : "",
      "Kindly make the necessary arrangements to facilitate the approved transportation.",
      "You can count on our usual cooperation.",
    ]
      .filter(Boolean)
      .join("\n\n")
  const memoReference =
    String(row.memo_reference ?? "").trim() ||
    `HR/TR/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`
  const memoDate =
    String(row.memo_date ?? "").trim() || new Date().toISOString().slice(0, 10)
  return { memoSubject, memoBody, memoReference, memoDate }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(district_id, districts(region_id))")
    .eq("id", user.id)
    .single()
  const isRegionalHr = isRegionalHrRole(profile?.role)
  const isChiefDriver = isChiefDriverRole(profile?.role)
  // Regional HR Office and Chief Driver raise regional requests; Regional Manager endorses, then MD approves.
  if (!profile?.is_active || (!isRegionalHr && !isChiefDriver)) {
    return NextResponse.json(
      { error: "Only active Regional HR Office users or Chief Drivers can create regional transport requests." },
      { status: 403 },
    )
  }
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
  const { data: signer } = await supabase.from("user_profiles").select("signature_data_url").eq("id", user.id).single()
  const signedAt = new Date().toISOString()
  const insertPayload: Record<string, unknown> = {
    requester_id: user.id,
    request_type: "regional_transport",
    purpose,
    origin,
    destination,
    event_date: eventDate,
    passenger_count: passengerCount,
    status: "submitted",
    workflow_stage: "regional_manager_endorsement",
    supporting_documents: supportingDocuments,
    assigned_region_id: assignedRegionId,
    linked_district_id: linkedDistrictId,
    origin_location_id: originLocationId,
  }
  if (isChiefDriver) {
    insertPayload.chief_driver_id = user.id
  } else {
    insertPayload.regional_hr_signer_id = user.id
    insertPayload.regional_hr_signed_at = signedAt
    insertPayload.regional_hr_signature_data_url = signer?.signature_data_url ?? null
  }
  let { data, error } = await supabase.from("transport_requests").insert(insertPayload).select("id").single()
  // Older DBs may lack chief_driver_id; retry without it so create still works.
  if (error && isChiefDriver && /column .*does not exist|schema cache/i.test(error.message)) {
    const { chief_driver_id: _omit, ...fallback } = insertPayload
    ;({ data, error } = await supabase.from("transport_requests").insert(fallback).select("id").single())
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Non-fatal: alert regional managers that a new request needs endorsement
  void notifyRoleHolders(
    ["regional_manager"],
    `New regional transport request awaiting endorsement: ${purpose} (${origin} → ${destination}).`,
    "transport_pending_rm",
    data.id,
    user.id,
  )
  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(district_id, districts(region_id))").eq("id", user.id).single()
  const role = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(role)
  const isRegionalHr = ["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(role)
  const isManagingDirector = role === "managing_director"
  const isHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(role)
  const isManager = isRegionalManagerRole(profile?.role)
  const isChiefDriver = isChiefDriverRole(profile?.role)
  const isTransportManager = isTransportManagerRole(profile?.role)
  const isAdmin = isAdminRole(profile?.role) || ["it_admin", "it-admin", "administrator"].includes(role)
  if (
    !profile?.is_active ||
    (!isManager &&
      !isChiefDriver &&
      !isHrRecords &&
      !isRegionalHr &&
      !isManagingDirector &&
      !isHrExecutive &&
      !isTransportManager &&
      !isAdmin)
  ) {
    return NextResponse.json({ error: "You do not have permission to process this request." }, { status: 403 })
  }
  const body = await request.json()
  const decision = String(body.decision ?? "")
  const bulkIds = Array.isArray(body.ids) ? [...new Set(body.ids.map((id: unknown) => String(id).trim()).filter(Boolean))] : []
  if (bulkIds.length > 0) {
    if (!((isManagingDirector && ["approve", "reject"].includes(decision)) || (isHrExecutive && ["approve_hr_memo", "reject"].includes(decision)))) return NextResponse.json({ error: "Bulk approval is not available for this role or decision." }, { status: 403 })
    if (bulkIds.length > 100) return NextResponse.json({ error: "Select no more than 100 requests at a time." }, { status: 400 })
    const requiredStage = isManagingDirector ? "managing_director_approval" : "hr_executive_signing"
    const { data: selectedRows, error: selectedError } = await supabase.from("transport_requests").select("id, request_type, purpose, origin, destination, event_date, passenger_count, workflow_stage, memo_subject, memo_body, memo_reference, memo_date, memo_amendments, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url").in("id", bulkIds)
    if (selectedError) return NextResponse.json({ error: selectedError.message }, { status: 500 })
    if (!selectedRows || selectedRows.length !== bulkIds.length) return NextResponse.json({ error: "One or more selected requests could not be found." }, { status: 404 })
    const invalid = selectedRows.find((row) => row.workflow_stage !== requiredStage || (isHrExecutive && (row.request_type !== "regional_transport" || row.hr_executive_signed_at || row.hr_executive_signer_id || row.hr_executive_signature_data_url)))
    if (invalid) return NextResponse.json({ error: "Every selected request must be in the current HR Executive signing queue and unsigned." }, { status: 409 })
    const now = new Date().toISOString()
    if (isManagingDirector) {
      const update = { status: "pending_hr_executive", workflow_stage: "hr_executive_signing", updated_at: now }
      const { error: updateError } = await supabase.from("transport_requests").update(update).in("id", bulkIds).eq("workflow_stage", requiredStage)
      if (updateError) return NextResponse.json({ error: `Unable to process selected requests: ${updateError.message}` }, { status: 500 })
      await supabase.from("transport_request_events").insert(selectedRows.map((row) => ({ request_id: row.id, actor_id: user.id, action: `transport_bulk_${decision}`, from_stage: row.workflow_stage, to_stage: update.workflow_stage, comment: String(body.comment ?? `Transport request ${decision.replace(/_/g, " ")}.`) })))
      return NextResponse.json({ ok: true, processed: bulkIds.length })
    }
    if (decision === "reject") {
      const update = { status: "rejected", workflow_stage: "closed", updated_at: now }
      const { error: updateError } = await supabase.from("transport_requests").update(update).in("id", bulkIds).eq("workflow_stage", requiredStage)
      if (updateError) return NextResponse.json({ error: `Unable to process selected requests: ${updateError.message}` }, { status: 500 })
      await supabase.from("transport_request_events").insert(selectedRows.map((row) => ({ request_id: row.id, actor_id: user.id, action: `transport_bulk_${decision}`, from_stage: row.workflow_stage, to_stage: update.workflow_stage, comment: String(body.comment ?? `Transport request ${decision.replace(/_/g, " ")}.`) })))
      return NextResponse.json({ ok: true, processed: bulkIds.length })
    }
    const [{ data: hrProfile }, { data: registrySignature }] = await Promise.all([
      supabase.from("user_profiles").select("signature_data_url, first_name, last_name, position").eq("id", user.id).single(),
      supabase.from("approval_signature_registry").select("signature_data_url").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
    ])
    const resolvedSignatureDataUrl = registrySignature?.signature_data_url ?? hrProfile?.signature_data_url ?? null
    const signerName = `${hrProfile?.first_name ?? ""} ${hrProfile?.last_name ?? ""}`.trim()
    for (const row of selectedRows) {
      const rejoinder = buildHrExecutiveRejoinderMemo(row)
      let priorAmendments: Record<string, unknown> = {}
      let priorAmendmentText = row.memo_amendments ?? ""
      try {
        const parsed = row.memo_amendments ? (JSON.parse(row.memo_amendments) as Record<string, unknown>) : null
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          priorAmendments = parsed
          priorAmendmentText = typeof parsed.text === "string" ? parsed.text : ""
        }
      } catch {
        /* keep plain text */
      }
      const update = {
        status: "approved",
        workflow_stage: row.request_type === "regional_transport" ? "referenced" : "transport_manager_assignment",
        memo_subject: rejoinder.memoSubject,
        memo_body: rejoinder.memoBody,
        memo_reference: rejoinder.memoReference,
        memo_date: rejoinder.memoDate,
        hr_executive_signer_id: user.id,
        hr_executive_signed_at: now,
        hr_executive_signature_data_url: resolvedSignatureDataUrl,
        hr_executive_handoff_by: user.id,
        hr_executive_handoff_at: now,
        memo_amendments: JSON.stringify({
          ...priorAmendments,
          text: priorAmendmentText || String(body.memoAmendments ?? ""),
          hr_executive_signer_id: user.id,
          hr_executive_signed_at: now,
          hr_executive_signature_data_url: resolvedSignatureDataUrl,
          hr_executive_signer_name: signerName || null,
          hr_executive_signer_position: hrProfile?.position ?? "HUMAN RESOURCES MANAGER",
        }),
        updated_at: now,
      }
      const { error: updateError } = await supabase.from("transport_requests").update(update).eq("id", row.id).eq("workflow_stage", requiredStage)
      if (updateError) return NextResponse.json({ error: `Unable to process selected requests: ${updateError.message}` }, { status: 500 })
      await supabase.from("transport_request_events").insert({
        request_id: row.id,
        actor_id: user.id,
        action: `transport_bulk_${decision}`,
        from_stage: row.workflow_stage,
        to_stage: update.workflow_stage,
        comment: String(body.comment ?? `Transport request ${decision.replace(/_/g, " ")}.`),
      })
    }
    return NextResponse.json({ ok: true, processed: bulkIds.length })
  }
  const requestId = String(body.id ?? "")
  if (!requestId) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
  const { data: row } = await supabase
    .from("transport_requests")
    .select(
      "id, request_type, purpose, origin, destination, event_date, passenger_count, assigned_region_id, linked_district_id, origin_location_id, workflow_stage, status, requester_id, assigned_driver_id, assigned_vehicle_id, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, hr_records_amended_by, hr_records_amended_at, hr_executive_signer_id, hr_executive_signed_at, hr_executive_signature_data_url",
    )
    .eq("id", requestId)
    .single()
  if (!row) return NextResponse.json({ error: "Transport request not found." }, { status: 404 })
  const assignedLocation = profile.geofence_locations as { district_id?: string | null; districts?: { region_id?: string | null } | null } | null

  // Complete trip: Chief Driver, Transport Manager, or admin — frees vehicle
  if (decision === "complete_trip") {
    if (!(isChiefDriver || isTransportManager || isAdmin)) {
      return NextResponse.json({ error: "Only Chief Driver, Transport Manager, or admin can complete a trip." }, { status: 403 })
    }
    if (!isCompletableTransportStage(row.workflow_stage, row.status)) {
      return NextResponse.json({ error: "Only assigned trips can be marked completed." }, { status: 409 })
    }
    if (isChiefDriver && !isAdmin && !isTransportManager) {
      const locationId = profile.assigned_location_id ?? null
      const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
      const inScope = Boolean(
        (locationId && row.origin_location_id === locationId) ||
          (!locationId && regionId && row.assigned_region_id === regionId) ||
          (regionId && row.assigned_region_id === regionId),
      )
      if (!inScope) return NextResponse.json({ error: "This trip is outside your assigned office." }, { status: 403 })
    }
    const completedAt = new Date().toISOString()
    const notes = String(body.comment ?? body.tripNotes ?? "").trim() || null
    const completePayload: Record<string, unknown> = {
      status: "completed",
      workflow_stage: "completed",
      updated_at: completedAt,
      trip_completed_at: completedAt,
      trip_completion_notes: notes,
      trip_completed_by: user.id,
    }
    let { error } = await supabase.from("transport_requests").update(completePayload).eq("id", requestId)
    if (error && /column .*does not exist|schema cache/i.test(error.message)) {
      const { trip_completed_at: _a, trip_completion_notes: _b, trip_completed_by: _c, ...stripped } = completePayload
      ;({ error } = await supabase.from("transport_requests").update(stripped).eq("id", requestId))
    }
    if (error) return NextResponse.json({ error: `Unable to complete trip: ${error.message}` }, { status: 500 })
    if (row.assigned_vehicle_id) {
      await supabase
        .from("transport_vehicles")
        .update({ status: "available", updated_at: completedAt })
        .eq("id", row.assigned_vehicle_id)
    }
    await supabase.from("transport_request_events").insert({
      request_id: requestId,
      actor_id: user.id,
      action: "transport_complete_trip",
      from_stage: row.workflow_stage,
      to_stage: "completed",
      comment: notes || "Trip marked completed; vehicle released.",
    })
    if (row.requester_id) {
      void notifyTransportActors([
        {
          user_id: row.requester_id,
          message: `Transport trip completed: ${row.purpose} (${row.origin} → ${row.destination}).`,
          type: "transport_trip_completed",
          reference_id: requestId,
        },
      ])
    }
    return NextResponse.json({ ok: true })
  }

  // Assign vehicle + driver for regional (referenced / TM assignment) or local (chief driver)
  if (decision === "assign_local_driver" || decision === "assign_vehicle") {
    const canAssignOps = isChiefDriver || isTransportManager || isAdmin
    if (!canAssignOps) {
      return NextResponse.json({ error: "You do not have permission to assign vehicles for this request." }, { status: 403 })
    }
    const locationId = profile.assigned_location_id ?? null
    const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
    const isLocalPath =
      row.request_type === "regional_local" && row.workflow_stage === "chief_driver_assignment"
    const isReleasedRegional =
      (row.request_type === "regional_transport" || !row.request_type) &&
      isAssignableRegionalStage(row.workflow_stage)
    if (!isLocalPath && !isReleasedRegional) {
      return NextResponse.json(
        { error: "This request is not ready for vehicle assignment yet." },
        { status: 409 },
      )
    }
    if (isChiefDriver && !isTransportManager && !isAdmin) {
      const inScope = Boolean(
        (locationId && row.origin_location_id === locationId) ||
          (!locationId && regionId && row.assigned_region_id === regionId) ||
          (regionId && row.assigned_region_id === regionId),
      )
      if (!inScope) return NextResponse.json({ error: "This request is outside your assigned office." }, { status: 403 })
      if (isLocalPath === false && !isReleasedRegional) {
        return NextResponse.json({ error: "Chief Driver can only assign ready regional or local dispatch requests." }, { status: 409 })
      }
    }
    const driverId = String(body.driverId ?? "")
    const vehicleId = String(body.vehicleId ?? "")
    if (!driverId || !vehicleId) {
      return NextResponse.json({ error: "Select both a driver and a vehicle." }, { status: 400 })
    }
    const { data: driver } = await supabase
      .from("user_profiles")
      .select("id, role, region_id, assigned_location_id, is_active")
      .eq("id", driverId)
      .maybeSingle()
    const driverRole = String(driver?.role ?? "").toLowerCase()
    if (!driver || driverRole !== "driver" || driver.is_active === false) {
      return NextResponse.json({ error: "Select an active driver." }, { status: 400 })
    }
    const [{ data: activeRegionalTrip }, { data: activeNonregionalTrip }] = await Promise.all([
      supabase
        .from("transport_requests")
        .select("id")
        .eq("assigned_driver_id", driverId)
        .neq("id", requestId)
        .eq("workflow_stage", "assigned")
        .in("status", ["assigned", "in_progress"])
        .limit(1)
        .maybeSingle(),
      supabase
        .from("nonregional_transport_requisitions")
        .select("id")
        .eq("recommended_driver_id", driverId)
        .in("status", ["assigned", "in_progress"])
        .limit(1)
        .maybeSingle(),
    ])
    if (activeRegionalTrip || activeNonregionalTrip) {
      return NextResponse.json({ error: "This driver is already assigned to an active trip and is unavailable." }, { status: 409 })
    }
    if (isChiefDriver && !isTransportManager && !isAdmin) {
      if (
        (locationId && driver.assigned_location_id !== locationId) ||
        (!locationId && regionId && driver.region_id !== regionId)
      ) {
        return NextResponse.json({ error: "Select an active regional driver from your location." }, { status: 400 })
      }
    }
    const { data: vehicle } = await supabase
      .from("transport_vehicles")
      .select("id, status, assigned_region_id")
      .eq("id", vehicleId)
      .maybeSingle()
    if (!vehicle || vehicle.status !== "available") {
      return NextResponse.json({ error: "Select an available vehicle." }, { status: 400 })
    }
    if (isChiefDriver && !isTransportManager && !isAdmin && regionId && vehicle.assigned_region_id && vehicle.assigned_region_id !== regionId) {
      return NextResponse.json({ error: "Select an available vehicle from your regional fleet." }, { status: 400 })
    }
    const assignedAt = new Date().toISOString()
    const { error } = await supabase
      .from("transport_requests")
      .update({
        assigned_driver_id: driverId,
        assigned_vehicle_id: vehicleId,
        status: "assigned",
        workflow_stage: "assigned",
        local_dispatch_notes: String(body.comment ?? "").trim() || null,
        updated_at: assignedAt,
      })
      .eq("id", requestId)
    if (error) return NextResponse.json({ error: `Unable to assign vehicle: ${error.message}` }, { status: 500 })
    await supabase.from("transport_vehicles").update({ status: "assigned", updated_at: assignedAt }).eq("id", vehicleId)
    await supabase.from("transport_request_events").insert({
      request_id: requestId,
      actor_id: user.id,
      action: isLocalPath ? "chief_driver_assigned_local_dispatch" : "transport_assign_vehicle",
      from_stage: row.workflow_stage,
      to_stage: "assigned",
      comment: String(body.comment ?? "Vehicle and driver assigned."),
    })
    void notifyTransportActors(
      [
        {
          user_id: driverId,
          message: `You were assigned a transport trip: ${row.purpose} (${row.origin} → ${row.destination}) on ${row.event_date || "TBD"}.`,
          type: "transport_driver_assigned",
          reference_id: requestId,
        },
        row.requester_id
          ? {
              user_id: row.requester_id,
              message: `Vehicle assigned for your transport request: ${row.purpose}.`,
              type: "transport_request_assigned",
              reference_id: requestId,
            }
          : null,
      ].filter(Boolean) as { user_id: string; message: string; type: string; reference_id: string }[],
    )
    return NextResponse.json({ ok: true })
  }
  if (isManager) {
    const locationId = profile.assigned_location_id ?? null
    const districtId = assignedLocation?.district_id ?? null
    const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
    const inScope = Boolean((locationId && row.origin_location_id === locationId) || (!row.origin_location_id && districtId && row.linked_district_id === districtId) || (!row.origin_location_id && !districtId && regionId && row.assigned_region_id === regionId))
    if (!inScope) return NextResponse.json({ error: "This request is outside your assigned office." }, { status: 403 })
    if (row.workflow_stage !== "regional_manager_endorsement" || !["endorse", "deny"].includes(decision)) return NextResponse.json({ error: "This request is not awaiting Regional Manager action." }, { status: 409 })
  } else if (isHrRecords) {
    if (!["hr_records_review", "hr_records"].includes(row.workflow_stage) || !["preview_memo", "save_memo", "correct", "return_for_correction", "forward_to_md"].includes(decision)) return NextResponse.json({ error: "This request is not awaiting HR Records action." }, { status: 409 })
  } else if (isManagingDirector) {
    if (row.workflow_stage !== "managing_director_approval" || !["approve", "reject"].includes(decision)) return NextResponse.json({ error: "This request is not awaiting Managing Director action." }, { status: 409 })
  } else if (isHrExecutive) {
    if (row.request_type !== "regional_transport" || row.workflow_stage !== "hr_executive_signing" || row.hr_executive_signed_at || row.hr_executive_signer_id || row.hr_executive_signature_data_url || !["save_memo", "approve_hr_memo"].includes(decision)) return NextResponse.json({ error: "This regional request has already been signed or is not awaiting HR Executive memo signing." }, { status: 409 })
  } else if (isRegionalHr) {
    if (row.workflow_stage !== "regional_hr_correction" || decision !== "correct") return NextResponse.json({ error: "This request is not awaiting Regional HR correction." }, { status: 409 })
  } else if (isTransportManager || isAdmin) {
    // Ops roles only use assign_vehicle / complete_trip (handled above). Block other decisions.
    return NextResponse.json({ error: "Transport Manager actions are limited to vehicle assignment and trip completion." }, { status: 403 })
  }
  if (decision === "forward_to_md" && (!row.memo_body || !row.memo_reference || !row.memo_date || !row.hr_records_amended_at)) return NextResponse.json({ error: "Preview and save the amended memo before forwarding it to the Managing Director." }, { status: 409 })
  let update: Record<string, unknown>
  if (decision === "preview_memo") update = { memo_subject: String(body.memoSubject ?? row.memo_subject ?? `Request for vehicle support: ${row.purpose}`), memo_body: String(body.memoBody ?? row.memo_body ?? ""), memo_reference: String(body.memoReference ?? row.memo_reference ?? ""), memo_date: String(body.memoDate ?? row.memo_date ?? new Date().toISOString().slice(0, 10)), updated_at: new Date().toISOString() }
  else if (decision === "save_memo") { const enteredSubject = String(body.memoSubject ?? row.memo_subject ?? row.purpose).trim().replace(/^\s*(re:\s*)+/i, ""); const memoSubject = isHrExecutive ? `RE: ${enteredSubject}` : enteredSubject; const amendmentText = String(body.memoAmendments ?? "").trim(); let mergedAmendments = amendmentText; try { const prior = row.memo_amendments ? JSON.parse(row.memo_amendments) as Record<string, unknown> : null; if (prior && typeof prior === "object" && !Array.isArray(prior)) mergedAmendments = JSON.stringify({ ...prior, text: amendmentText || (typeof prior.text === "string" ? prior.text : "") }) } catch { /* keep plain amendment text */ } update = { memo_reference: String(body.memoReference ?? "").trim(), memo_date: String(body.memoDate ?? "").trim(), memo_subject: memoSubject, memo_body: String(body.memoBody ?? "").trim(), memo_amendments: mergedAmendments, ...(isHrExecutive ? {} : { hr_records_amended_by: user.id, hr_records_amended_at: new Date().toISOString() }), updated_at: new Date().toISOString() } }
  else if (decision === "approve_hr_memo") {
    const rejoinder = buildHrExecutiveRejoinderMemo(row)
    const [{ data: signerProfile }, { data: registrySignature }] = await Promise.all([
      supabase.from("user_profiles").select("signature_data_url, first_name, last_name, position").eq("id", user.id).single(),
      supabase.from("approval_signature_registry").select("signature_data_url").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
    ])
    const resolvedSignatureDataUrl = registrySignature?.signature_data_url ?? signerProfile?.signature_data_url ?? null
    const signerName = `${signerProfile?.first_name ?? ""} ${signerProfile?.last_name ?? ""}`.trim()
    let priorAmendments: Record<string, unknown> = {}
    let priorAmendmentText = row.memo_amendments ?? ""
    try {
      const parsed = row.memo_amendments ? (JSON.parse(row.memo_amendments) as Record<string, unknown>) : null
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        priorAmendments = parsed
        priorAmendmentText = typeof parsed.text === "string" ? parsed.text : ""
      }
    } catch {
      /* keep plain text */
    }
    const signedAt = new Date().toISOString()
    update = {
      status: "approved",
      workflow_stage: row.request_type === "regional_transport" ? "referenced" : "transport_manager_assignment",
      memo_subject: rejoinder.memoSubject,
      memo_body: rejoinder.memoBody,
      memo_reference: rejoinder.memoReference,
      memo_date: rejoinder.memoDate,
      hr_executive_signer_id: user.id,
      hr_executive_signed_at: signedAt,
      hr_executive_signature_data_url: resolvedSignatureDataUrl,
      memo_amendments: JSON.stringify({
        ...priorAmendments,
        text: priorAmendmentText,
        hr_executive_signer_id: user.id,
        hr_executive_signed_at: signedAt,
        hr_executive_signature_data_url: resolvedSignatureDataUrl,
        hr_executive_signer_name: signerName || null,
        hr_executive_signer_position: signerProfile?.position ?? "HUMAN RESOURCES MANAGER",
      }),
      hr_executive_handoff_by: user.id,
      hr_executive_handoff_at: signedAt,
      updated_at: signedAt,
    }
  }
  else if (decision === "send_to_hr_executive") update = { status: "approved", workflow_stage: "hr_records_review", hr_executive_handoff_by: user.id, hr_executive_handoff_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  else if (decision === "endorse") { const { data: signer } = await supabase.from("approval_signature_registry").select("signature_data_url").eq("user_id", user.id).eq("is_active", true).maybeSingle(); const signedAt = new Date().toISOString(); let priorAmendments: Record<string, unknown> = {}; try { priorAmendments = row.memo_amendments ? JSON.parse(row.memo_amendments) as Record<string, unknown> : {} } catch { /* keep empty prior amendments */ } update = { status: row.request_type === "regional_local" ? "approved" : "endorsed", workflow_stage: row.request_type === "regional_local" ? "chief_driver_assignment" : "managing_director_approval", regional_manager_signer_id: user.id, regional_manager_signed_at: signedAt, regional_manager_signature_data_url: signer?.signature_data_url ?? null, memo_amendments: JSON.stringify({ ...priorAmendments, regional_manager_comment: String(body.comment ?? "").trim() || null, regional_manager_signer_id: user.id, regional_manager_signed_at: signedAt, regional_manager_signature_data_url: signer?.signature_data_url ?? null }), updated_at: signedAt } }
  else if (decision === "deny" || decision === "reject") update = { status: "rejected", workflow_stage: "closed", updated_at: new Date().toISOString() }
  else if (decision === "return_for_correction") update = { status: "returned_for_correction", workflow_stage: "regional_hr_correction", updated_at: new Date().toISOString() }
  else if (decision === "forward_to_md") update = { status: "pending_md_approval", workflow_stage: "managing_director_approval", updated_at: new Date().toISOString() }
  else if (decision === "approve") update = { status: "pending_hr_executive", workflow_stage: "hr_executive_signing", updated_at: new Date().toISOString() }
  else if (decision === "correct") update = { purpose: String(body.purpose ?? "").trim(), origin: String(body.origin ?? "").trim(), destination: String(body.destination ?? "").trim(), event_date: String(body.eventDate ?? "").trim(), passenger_count: Number(body.passengerCount), status: "endorsed", workflow_stage: "hr_records_review", updated_at: new Date().toISOString() }
  else return NextResponse.json({ error: "Unsupported decision." }, { status: 400 })
  if (decision === "correct" && (!update.purpose || !update.origin || !update.destination || !update.event_date || !Number.isInteger(update.passenger_count) || Number(update.passenger_count) < 1)) return NextResponse.json({ error: "Complete all correction fields." }, { status: 400 })
  const { error } = await supabase.from("transport_requests").update(update).eq("id", requestId)
  if (error && /column .*does not exist|schema cache/i.test(error.message)) {
    // Older databases may not have the regional_manager_* signature columns yet
    // (see migration 109_transport_regional_manager_signature.sql). Retry without
    // them — the endorsement stays preserved inside memo_amendments.
    const stripped = { ...update }
    for (const key of ["regional_manager_signer_id", "regional_manager_signed_at", "regional_manager_signature_data_url"]) delete stripped[key]
    const { error: retryError } = await supabase.from("transport_requests").update(stripped).eq("id", requestId)
    if (retryError) return NextResponse.json({ error: `Unable to process this request: ${retryError.message}` }, { status: 500 })
  } else if (error) return NextResponse.json({ error: `Unable to process this request: ${error.message}` }, { status: 500 })
  await supabase.from("transport_request_events").insert({ request_id: requestId, actor_id: user.id, action: `transport_${decision}`, from_stage: row.workflow_stage, to_stage: update.workflow_stage, comment: String(body.comment ?? `Transport request ${decision.replace(/_/g, " ")}.`) })

  // Non-fatal stage notifications (does not affect auth/login)
  const toStage = String(update.workflow_stage ?? "")
  const purposeLabel = `${row.purpose} (${row.origin} → ${row.destination})`
  if (decision === "endorse" && toStage === "managing_director_approval") {
    void notifyRoleHolders(
      ["managing_director"],
      `Regional transport awaiting MD approval: ${purposeLabel}.`,
      "transport_pending_md",
      requestId,
      user.id,
    )
  } else if (decision === "endorse" && toStage === "chief_driver_assignment") {
    void notifyRoleHolders(
      ["chief_driver"],
      `Local transport ready for dispatch: ${purposeLabel}.`,
      "transport_pending_chief_driver",
      requestId,
      user.id,
    )
  } else if (decision === "approve" && toStage === "hr_executive_signing") {
    void notifyRoleHolders(
      ["hr_executive", "manager_hr", "director_hr", "hr"],
      `Regional transport ready for HR Executive signature: ${purposeLabel}.`,
      "transport_pending_hr_exec",
      requestId,
      user.id,
    )
  } else if (decision === "approve_hr_memo" && (toStage === "referenced" || toStage === "transport_manager_assignment")) {
    void notifyRoleHolders(
      ["transport_manager", "chief_driver", "regional_manager"],
      `Transport memo signed and released: ${purposeLabel}. Ready for assignment.`,
      "transport_released_to_region",
      requestId,
      user.id,
    )
    if (row.requester_id) {
      void notifyTransportActors([
        {
          user_id: row.requester_id,
          message: `Your transport request was signed and released: ${purposeLabel}.`,
          type: "transport_request_released",
          reference_id: requestId,
        },
      ])
    }
  } else if ((decision === "deny" || decision === "reject") && row.requester_id) {
    void notifyTransportActors([
      {
        user_id: row.requester_id,
        message: `Transport request was not approved: ${purposeLabel}.`,
        type: "transport_request_rejected",
        reference_id: requestId,
      },
    ])
  }

  return NextResponse.json({ ok: true })
}
