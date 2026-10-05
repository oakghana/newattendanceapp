import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canEditFleetInventory, canViewFleetInventory, hasNationwideFleetScope, isAdminRole, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

async function actor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id, assigned_location_id").eq("id", user.id).maybeSingle()
  return { supabase, user, profile }
}

async function resolveFleetScope(supabase: any, profile: any) {
  if (hasNationwideFleetScope(profile.role)) return null
  if (isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role)) {
    return resolveOwnedLocationIdsForRegionalOffice(supabase, profile.assigned_location_id, profile.region_id)
  }
  return profile.assigned_location_id ? [profile.assigned_location_id] : []
}

export async function GET() {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canViewFleetInventory(profile.role)) return NextResponse.json({ error: "Fleet access denied." }, { status: 403 })

  const scopedLocationIds = await resolveFleetScope(supabase, profile)
  if (scopedLocationIds?.length === 0) return NextResponse.json({ error: "No fleet locations are assigned to this account." }, { status: 403 })
  let vehiclesQuery = supabase.from("transport_vehicles").select("*").order("registration_number")
  if (scopedLocationIds) vehiclesQuery = vehiclesQuery.in("assigned_location_id", scopedLocationIds)
  const { data: vehicles, error } = await vehiclesQuery
  if (error) return NextResponse.json({ error: "Unable to load vehicles." }, { status: 500 })

  const vehicleIds = (vehicles ?? []).map((vehicle) => vehicle.id)
  const { data: bookings } = vehicleIds.length
    ? await supabase.from("transport_vehicle_bookings").select("*").in("vehicle_id", vehicleIds).neq("status", "cancelled").order("starts_at", { ascending: false }).limit(100)
    : { data: [] }
  let locationsQuery = supabase.from("geofence_locations").select("id, name").eq("is_active", true).order("name")
  if (scopedLocationIds) locationsQuery = locationsQuery.in("id", scopedLocationIds)
  const { data: locations } = await locationsQuery
  return NextResponse.json({ vehicles: vehicles ?? [], bookings: bookings ?? [], locations: locations ?? [] })
}

export async function POST(request: Request) {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canEditFleetInventory(profile.role)) return NextResponse.json({ error: "Fleet edit access denied." }, { status: 403 })
  const body = await request.json()
  if (Array.isArray(body.rows)) {
    if (body.rows.length < 1 || body.rows.length > 1000) return NextResponse.json({ error: "Upload between 1 and 1,000 vehicle rows." }, { status: 400 })
    const scopedLocationIds = await resolveFleetScope(supabase, profile)
    let imported = 0; const errors: string[] = []
    const { data: locations } = await supabase.from("geofence_locations").select("id, name").eq("is_active", true)
    const locationByName = new Map((locations ?? []).map((location) => [String(location.name).trim().toLowerCase(), location.id]))
    const allowedVehicleTypes = ["saloon", "bus", "truck", "pickup", "van"]
    const { data: existingVehicles } = await supabase.from("transport_vehicles").select("registration_number")
    const existingRegistrationNumbers = new Set((existingVehicles ?? []).map((vehicle) => String(vehicle.registration_number ?? "").trim().toUpperCase()))
    const importedRegistrationNumbers = new Set<string>()
    for (let index = 0; index < body.rows.length; index += 1) {
      const row = body.rows[index] ?? {}
      const registrationNumber = String(row.registration_number ?? "").trim().toUpperCase()
      if (!registrationNumber) { errors.push(`Row ${index + 2}: registration_number is required.`); continue }
      if (existingRegistrationNumbers.has(registrationNumber) || importedRegistrationNumbers.has(registrationNumber)) { errors.push(`Row ${index + 2}: registration number ${registrationNumber} already exists in the fleet or appears earlier in this file.`); continue }
      importedRegistrationNumbers.add(registrationNumber)
      const vehicleTypeValue = String(row.vehicle_type ?? "").trim().toLowerCase()
      const vehicleType = allowedVehicleTypes.includes(vehicleTypeValue) ? vehicleTypeValue : null
      const locationValue = String(row.assigned_location_id ?? row.location ?? "").trim()
      const assignedLocationId = locations?.some((location) => location.id === locationValue) ? locationValue : locationByName.get(locationValue.toLowerCase()) ?? null
      if (vehicleTypeValue && !vehicleType) errors.push(`Row ${index + 2}: vehicle_type must be one of ${allowedVehicleTypes.join(", ")}.`)
      if (locationValue && !assignedLocationId) errors.push(`Row ${index + 2}: location was not found: ${locationValue}.`)
      if (assignedLocationId && scopedLocationIds && !scopedLocationIds.includes(assignedLocationId)) errors.push(`Row ${index + 2}: location is outside your assigned fleet scope.`)
      const capacityValue = String(row.capacity ?? "").trim()
      const capacity = capacityValue ? Number(capacityValue) : null
      if (capacityValue && (!Number.isInteger(capacity) || capacity < 1)) errors.push(`Row ${index + 2}: capacity must be a positive whole number.`)
      if ((vehicleTypeValue && !vehicleType) || (locationValue && !assignedLocationId) || (assignedLocationId && scopedLocationIds && !scopedLocationIds.includes(assignedLocationId)) || (capacityValue && (!Number.isInteger(capacity) || capacity < 1))) continue
      const { error } = await supabase.from("transport_vehicles").insert({ registration_number: registrationNumber, make: String(row.make ?? "").trim() || null, model: String(row.model ?? "").trim() || null, capacity, vehicle_type: vehicleType, assigned_region_id: profile.region_id ?? null, assigned_location_id: assignedLocationId, status: ["available", "assigned", "maintenance", "inactive"].includes(String(row.status).toLowerCase()) ? String(row.status).toLowerCase() : "available", chassis_number: String(row.chassis_number ?? "").trim().toUpperCase() || null, vehicle_colour: String(row.vehicle_colour ?? "").trim() || null, insurance_expiry_date: String(row.insurance_expiry_date ?? "") || null, roadworthy_expiry_date: String(row.roadworthy_expiry_date ?? "") || null, notes: String(row.notes ?? "").trim() || null, created_by: user.id })
      if (error) errors.push(`Row ${index + 2}: ${error.code === "23505" ? "registration number already exists." : error.message || "could not be imported."}`); else imported += 1
    }
    return NextResponse.json({ ok: errors.length === 0, imported, errors })
  }
  const registrationNumber = String(body.registration_number ?? "").trim().toUpperCase()
  const make = String(body.make ?? "").trim()
  const model = String(body.model ?? "").trim()
  const capacity = Number(body.capacity)
  const assignedLocationId = String(body.assigned_location_id ?? "").trim()
  const chassisNumber = String(body.chassis_number ?? "").trim().toUpperCase()
  const vehicleColour = String(body.vehicle_colour ?? "").trim()
  const vehicleType = String(body.vehicle_type ?? "saloon").trim().toLowerCase()
  const allowedVehicleTypes = ["saloon", "bus", "truck", "pickup", "van"]
  if (!registrationNumber || !make || !model || !assignedLocationId || !chassisNumber || !vehicleColour || !allowedVehicleTypes.includes(vehicleType) || !Number.isInteger(capacity) || capacity < 1) return NextResponse.json({ error: "Registration, chassis number, colour, make, model, location, valid vehicle type, and a positive capacity are required." }, { status: 400 })
  const scopedLocationIds = await resolveFleetScope(supabase, profile)
  if (scopedLocationIds && !scopedLocationIds.includes(assignedLocationId)) return NextResponse.json({ error: "You can register vehicles only at locations assigned to your office." }, { status: 403 })
  const { data: duplicateVehicle } = await supabase.from("transport_vehicles").select("id").ilike("registration_number", registrationNumber).maybeSingle()
  if (duplicateVehicle) return NextResponse.json({ error: `Registration number ${registrationNumber} already exists in the fleet.` }, { status: 409 })
  const { data, error } = await supabase.from("transport_vehicles").insert({
    registration_number: registrationNumber, make, model, capacity,
    vehicle_type: vehicleType,
    assigned_region_id: profile.region_id ?? null,
    assigned_location_id: assignedLocationId,
    status: "available",
    chassis_number: String(body.chassis_number ?? "").trim().toUpperCase() || null,
    vehicle_colour: String(body.vehicle_colour ?? "").trim() || null,
    insurance_expiry_date: String(body.insurance_expiry_date ?? "") || null,
    roadworthy_expiry_date: String(body.roadworthy_expiry_date ?? "") || null,
    notes: String(body.notes ?? "").trim() || null,
    created_by: user.id,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That registration number already exists." : "Unable to register vehicle." }, { status: 500 })
  return NextResponse.json({ vehicle: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canEditFleetInventory(profile.role)) return NextResponse.json({ error: "Only administrators or Transport Managers can delete vehicles." }, { status: 403 })
  const id = String(new URL(request.url).searchParams.get("id") ?? "")
  if (!id) return NextResponse.json({ error: "Vehicle id is required." }, { status: 400 })
  const scopedLocationIds = isAdminRole(profile.role) ? null : await resolveFleetScope(supabase, profile)
  if (scopedLocationIds?.length === 0) return NextResponse.json({ error: "No fleet locations are assigned to this account." }, { status: 403 })
  let query = supabase.from("transport_vehicles").select("id, registration_number").eq("id", id)
  if (scopedLocationIds) query = query.in("assigned_location_id", scopedLocationIds)
  const { data: vehicle } = await query.maybeSingle()
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found in your assigned scope." }, { status: 404 })
  const { count: bookingCount } = await supabase.from("transport_vehicle_bookings").select("id", { count: "exact", head: true }).eq("vehicle_id", id).neq("status", "cancelled")
  if (bookingCount) return NextResponse.json({ error: "This vehicle has active bookings and cannot be deleted. Mark it inactive instead." }, { status: 409 })
  const { error } = await supabase.from("transport_vehicles").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Unable to delete vehicle." }, { status: 500 })
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(request: Request) {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canEditFleetInventory(profile.role)) return NextResponse.json({ error: "Fleet edit access denied." }, { status: 403 })
  const body = await request.json()
  const id = String(body.id ?? "")
  const status = String(body.status ?? "")
  const requestedVehicleType = body.vehicle_type === undefined ? null : String(body.vehicle_type).trim().toLowerCase()
  if (requestedVehicleType === "motorcycle" || (requestedVehicleType && !["saloon", "bus", "truck", "pickup", "van"].includes(requestedVehicleType))) return NextResponse.json({ error: "Motorcycle is not an available vehicle type." }, { status: 400 })
  if (!id || !["available", "assigned", "maintenance", "inactive"].includes(status)) return NextResponse.json({ error: "A vehicle and valid operational status are required." }, { status: 400 })
  const scopedLocationIds = await resolveFleetScope(supabase, profile)
  if (scopedLocationIds?.length === 0) return NextResponse.json({ error: "No fleet locations are assigned to this account." }, { status: 403 })
  let existingQuery = supabase.from("transport_vehicles").select("id, assigned_region_id").eq("id", id)
  if (scopedLocationIds) existingQuery = existingQuery.in("assigned_location_id", scopedLocationIds)
  const { data: existing } = await existingQuery.maybeSingle()
  if (!existing) return NextResponse.json({ error: "Vehicle not found in your assigned scope." }, { status: 404 })
  const assignedLocationId = body.assigned_location_id === undefined ? undefined : String(body.assigned_location_id ?? "").trim() || null
  if (body.assigned_location_id !== undefined && !assignedLocationId) return NextResponse.json({ error: "Vehicle location is required." }, { status: 400 })
  if (assignedLocationId && scopedLocationIds && !scopedLocationIds.includes(assignedLocationId)) return NextResponse.json({ error: "You can move vehicles only within locations assigned to your office." }, { status: 403 })
  const { data, error } = await supabase.from("transport_vehicles").update({ status, assigned_location_id: assignedLocationId, vehicle_type: body.vehicle_type === undefined ? undefined : String(body.vehicle_type).trim() || "saloon", make: body.make === undefined ? undefined : String(body.make).trim(), model: body.model === undefined ? undefined : String(body.model).trim(), capacity: body.capacity === undefined ? undefined : Number(body.capacity), chassis_number: body.chassis_number === undefined ? undefined : String(body.chassis_number).trim().toUpperCase() || null, vehicle_colour: body.vehicle_colour === undefined ? undefined : String(body.vehicle_colour).trim() || null, insurance_expiry_date: body.insurance_expiry_date === undefined ? undefined : String(body.insurance_expiry_date) || null, roadworthy_expiry_date: body.roadworthy_expiry_date === undefined ? undefined : String(body.roadworthy_expiry_date) || null, notes: body.notes === undefined ? undefined : String(body.notes).trim() || null, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: "Unable to update vehicle." }, { status: 500 })
  return NextResponse.json({ vehicle: data })
}
