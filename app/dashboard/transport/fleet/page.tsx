import { redirect } from "next/navigation"
import { FleetInventoryWorkspace } from "@/components/transport/fleet-inventory-workspace"
import { createClient } from "@/lib/supabase/server"
import { canEditFleetInventory, canViewFleetInventory, hasNationwideFleetScope, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

export default async function FleetInventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, assigned_location_id").eq("id", user.id).maybeSingle()
  if (!profile?.is_active || !canViewFleetInventory(profile.role)) redirect("/dashboard")

  let vehiclesQuery = supabase.from("transport_vehicles").select("*").order("registration_number")
  const scopedLocationIds = hasNationwideFleetScope(profile.role)
    ? []
    : (isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role))
      ? await resolveOwnedLocationIdsForRegionalOffice(supabase, profile.assigned_location_id)
      : profile.assigned_location_id ? [profile.assigned_location_id] : []
  if (!hasNationwideFleetScope(profile.role)) {
    if (scopedLocationIds.length) vehiclesQuery = vehiclesQuery.in("assigned_location_id", scopedLocationIds)
    else vehiclesQuery = vehiclesQuery.eq("id", "00000000-0000-0000-0000-000000000000")
  }
  const { data: vehicles } = await vehiclesQuery
  let locationsQuery = supabase.from("geofence_locations").select("id, name").eq("is_active", true).order("name")
  if (!hasNationwideFleetScope(profile.role)) locationsQuery = locationsQuery.in("id", scopedLocationIds)
  const { data: locations } = await locationsQuery
  const vehicleIds = (vehicles ?? []).map((vehicle) => vehicle.id)
  const { data: bookings } = vehicleIds.length
    ? await supabase.from("transport_vehicle_bookings").select("*").in("vehicle_id", vehicleIds).neq("status", "cancelled").order("starts_at", { ascending: false }).limit(100)
    : { data: [] }
  return <FleetInventoryWorkspace initialVehicles={vehicles ?? []} initialBookings={bookings ?? []} locations={locations ?? []} canEdit={canEditFleetInventory(profile.role)} />
}