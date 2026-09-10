import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DriverLicenseWorkspace } from "@/components/transport/driver-license-workspace"
import { canManageTransport, isRegionalDriverRole, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"

export default async function DriverLicensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(districts(region_id))")
    .eq("id", user.id)
    .single()
  const normalizedRole = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isDriver = normalizedRole === "driver"
  const isRegionalDriver = isDriver && isRegionalDriverRole(profile?.role)
  if (!profile || profile.is_active === false || (!canManageTransport(profile.role) && !isDriver)) redirect("/dashboard")
  const assignedLocation = profile.geofence_locations as { districts?: { region_id?: string | null } | null } | null
  const regionId = profile.region_id ?? assignedLocation?.districts?.region_id ?? null
  let driversQuery = supabase.from("transport_drivers").select("*").order("expiry_date")
  if ((isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role)) && regionId) driversQuery = driversQuery.eq("assigned_region_id", regionId)
  const { data: drivers } = await driversQuery
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
  return <DriverLicenseWorkspace initialDrivers={isDriver ? (ownDriver ? [ownDriver] : []) : (drivers ?? [])} canVerify={!isDriver && (isRegionalHrRole(profile.role) || normalizedRole === "transport_manager")} role={isDriver ? "driver" : normalizedRole} assignedTasks={normalizedTasks} readOnlyTasks={isRegionalDriver} />
}
