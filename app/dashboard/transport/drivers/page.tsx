import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DriverLicenseWorkspace } from "@/components/transport/driver-license-workspace"
import { canEditDriverLicenses, canManageTransport, hasNationwideFleetScope, isChiefDriverRole, isRegionalDriverRole, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"
import { isNonRegionalLocation } from "@/lib/location-mappings"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

export default async function DriverLicensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name, districts(region_id))")
    .eq("id", user.id)
    .single()
  const normalizedRole = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isDriver = normalizedRole === "driver"
  const isRegionalDriver = isDriver && isRegionalDriverRole(profile?.role)
  if (!profile || profile.is_active === false || (!canManageTransport(profile.role) && !isDriver)) redirect("/dashboard")
  const assignedLocation = profile.geofence_locations as { districts?: { region_id?: string | null } | null } | null
  const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  // Only Transport Manager and administrators see nationwide driver records.
  // Regional roles see their regional/district pool; HOD/HR Executive roles see only their assigned non-regional office.
  const hasNationwideScope = hasNationwideFleetScope(profile.role)
  const isScopedToRegion = isChiefDriverRole(profile.role) || isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role)
  const ownedLocationIds = isScopedToRegion
    ? await resolveOwnedLocationIdsForRegionalOffice(supabase, profile.assigned_location_id)
    : []
  let driversQuery = supabase.from("transport_drivers").select("*").order("expiry_date")
  const { data: queriedDrivers } = await driversQuery
  const canEdit = !isDriver && canEditDriverLicenses(profile.role)
  // Every non-driver viewer (including read-only regional roles) should see drivers who have not submitted a license, not just those with a record.
  let driversForDisplay = queriedDrivers ?? []
  if (!isDriver) {
    const missingQuery = supabase
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name, districts(region_id))")
      .in("role", ["driver", "regional_driver", "regional_drivers"])
      .eq("is_active", true)
    const { data: driverProfiles } = await missingQuery
    const scopedDriverProfiles = (driverProfiles ?? []).filter((p: any) => {
      if (hasNationwideScope) return true
      if (isScopedToRegion) return ownedLocationIds.includes(p.assigned_location_id)
      return Boolean(profile.assigned_location_id) && p.assigned_location_id === profile.assigned_location_id && isNonRegionalLocation((p.geofence_locations as { name?: string | null } | null)?.name)
    })
    const scopedProfileIds = new Set(scopedDriverProfiles.map((p: any) => p.id))
    const drivers = hasNationwideScope
      ? queriedDrivers ?? []
      : (queriedDrivers ?? []).filter((driver: any) => scopedProfileIds.has(driver.profile_id))
    const registeredProfileIds = new Set(drivers.map((d: any) => d.profile_id))
    const missingRows = scopedDriverProfiles
      .filter((p: any) => !registeredProfileIds.has(p.id))
      .map((p: any) => ({
        id: `missing-${p.id}`,
        profile_id: p.id,
        full_name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.employee_id || "Driver",
        license_number: "",
        expiry_date: null,
        verification_status: "not_submitted",
        license_document_url: null,
      }))
    driversForDisplay = [...drivers, ...missingRows]
  }
  const { data: ownDriver } = isDriver
    ? await supabase.from("transport_drivers").select("*").eq("profile_id", user.id).maybeSingle()
    : { data: null }
  // Regional drivers pick up their trips from transport_requests (assigned_driver_id); non-regional drivers use nonregional_transport_requisitions.
  const { data: assignedTasks } = isRegionalDriver
    ? await supabase
        .from("transport_requests")
        .select("id, purpose, origin, destination, event_date, passenger_count, status, workflow_stage, reference_number, assigned_driver_id")
        .eq("assigned_driver_id", user.id)
        .order("event_date", { ascending: true })
    : isDriver
      ? await supabase.from("nonregional_transport_requisitions").select("id, department, location, origin, destination, purpose, required_at, return_at, persons_requiring_transport, person_names, status, assigned_vehicle, recommended_driver_id, trip_started_at, trip_completed_at, trip_start_note, trip_completion_note").eq("recommended_driver_id", user.id).in("status", ["approved", "assigned", "in_progress", "completed"]).order("required_at", { ascending: true })
      : { data: [] as any[] }
  let driverTasks = assignedTasks
  if (isDriver && !isRegionalDriver && !assignedTasks) {
    const { data: fallbackTasks } = await supabase.from("nonregional_transport_requisitions").select("id, department, location, origin, destination, purpose, required_at, return_at, persons_requiring_transport, person_names, status, assigned_vehicle, recommended_driver_id").eq("recommended_driver_id", user.id).in("status", ["approved", "assigned", "in_progress", "completed"]).order("required_at", { ascending: true })
    driverTasks = fallbackTasks
  }
  // Regional trips (transport_requests) have no self-service start/complete flow yet; Chief Driver / Transport Manager close them out.
  const normalizedTasks = isRegionalDriver
    ? (driverTasks ?? []).map((task: any) => ({ ...task, required_at: task.event_date, persons_requiring_transport: task.passenger_count, department: task.reference_number }))
    : driverTasks ?? []
  return <DriverLicenseWorkspace initialDrivers={isDriver ? (ownDriver ? [ownDriver] : []) : driversForDisplay} canEdit={canEdit} role={isDriver ? "driver" : normalizedRole} assignedTasks={normalizedTasks} readOnlyTasks={isRegionalDriver} />
}
