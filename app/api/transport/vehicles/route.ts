import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canEditFleetInventory, canViewFleetInventory, hasNationwideFleetScope, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"
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
  const registrationNumber = String(body.registration_number ?? "").trim().toUpperCase()
  const make = String(body.make ?? "").trim()
  const model = String(body.model ?? "").trim()
  const capacity = Number(body.capacity)
  const assignedLocationId = String(body.assigned_location_id ?? "").trim()
  if (!registrationNumber || !make || !model || !assignedLocationId || !Number.isInteger(capacity) || capacity < 1) return NextResponse.json({ error: "Registration, make, model, location, and a positive capacity are required." }, { status: 400 })
  const scopedLocationIds = await resolveFleetScope(supabase, profile)
  if (scopedLocationIds && !scopedLocationIds.includes(assignedLocationId)) return NextResponse.json({ error: "You can register vehicles only at locations assigned to your office." }, { status: 403 })
  const { data, error } = await supabase.from("transport_vehicles").insert({
    registration_number: registrationNumber, make, model, capacity,
    vehicle_type: String(body.vehicle_type ?? "car").trim() || "car",
    assigned_region_id: profile.region_id ?? null,
    assigned_location_id: assignedLocationId,
    status: "available",
    odometer_reading: body.odometer_reading === "" || body.odometer_reading == null ? null : Number(body.odometer_reading),
    insurance_expiry_date: String(body.insurance_expiry_date ?? "") || null,
    roadworthy_expiry_date: String(body.roadworthy_expiry_date ?? "") || null,
    notes: String(body.notes ?? "").trim() || null,
    created_by: user.id,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That registration number already exists." : "Unable to register vehicle." }, { status: 500 })
  return NextResponse.json({ vehicle: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canEditFleetInventory(profile.role)) return NextResponse.json({ error: "Fleet edit access denied." }, { status: 403 })
  const body = await request.json()
  const id = String(body.id ?? "")
  const status = String(body.status ?? "")
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
  const { data, error } = await supabase.from("transport_vehicles").update({ status, assigned_location_id: assignedLocationId, vehicle_type: body.vehicle_type === undefined ? undefined : String(body.vehicle_type).trim() || "saloon", make: body.make === undefined ? undefined : String(body.make).trim(), model: body.model === undefined ? undefined : String(body.model).trim(), capacity: body.capacity === undefined ? undefined : Number(body.capacity), odometer_reading: body.odometer_reading == null || body.odometer_reading === "" ? undefined : Number(body.odometer_reading), insurance_expiry_date: body.insurance_expiry_date === undefined ? undefined : String(body.insurance_expiry_date) || null, roadworthy_expiry_date: body.roadworthy_expiry_date === undefined ? undefined : String(body.roadworthy_expiry_date) || null, notes: body.notes === undefined ? undefined : String(body.notes).trim() || null, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: "Unable to update vehicle." }, { status: 500 })
  return NextResponse.json({ vehicle: data })
}
