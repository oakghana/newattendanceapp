import { redirect } from "next/navigation"
import { FleetInventoryWorkspace } from "@/components/transport/fleet-inventory-workspace"
import { createClient } from "@/lib/supabase/server"
import { canEditFleetInventory, canViewFleetInventory, hasNationwideFleetScope, normalizeAppRole } from "@/lib/role-capabilities"

export default async function FleetInventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id").eq("id", user.id).maybeSingle()
  const role = normalizeAppRole(profile?.role)
  if (!profile?.is_active || !canViewFleetInventory(profile.role)) redirect("/dashboard")

  let vehiclesQuery = supabase.from("transport_vehicles").select("*").order("registration_number")
  if (profile.region_id && !hasNationwideFleetScope(profile.role)) vehiclesQuery = vehiclesQuery.eq("assigned_region_id", profile.region_id)
  const { data: vehicles } = await vehiclesQuery
  const { data: locations } = await supabase.from("geofence_locations").select("id, name").eq("is_active", true).order("name")
  const vehicleIds = (vehicles ?? []).map((vehicle) => vehicle.id)
  const { data: bookings } = vehicleIds.length
    ? await supabase.from("transport_vehicle_bookings").select("*").in("vehicle_id", vehicleIds).neq("status", "cancelled").order("starts_at", { ascending: false }).limit(100)
    : { data: [] }
  return <FleetInventoryWorkspace initialVehicles={vehicles ?? []} initialBookings={bookings ?? []} locations={locations ?? []} canEdit={canEditFleetInventory(profile.role)} />
}