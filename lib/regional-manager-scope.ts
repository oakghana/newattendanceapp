import type { SupabaseClient } from "@supabase/supabase-js"
import { isNonRegionalLocation } from "./location-mappings"

export type LocationHierarchyRow = {
  id: string
  name?: string | null
  location_type?: string | null
  parent_location_id?: string | null
  district_id?: string | null
}

/**
 * Resolve the regional office that owns a staff work location.
 * District offices are linked via parent_location_id to their regional office.
 * Staff at the regional office itself resolve to that same location.
 */
export function resolveRegionalOfficeIdFromLocation(
  location: LocationHierarchyRow | null | undefined,
  locationsById?: Map<string, LocationHierarchyRow> | Record<string, LocationHierarchyRow> | null,
): string | null {
  if (!location?.id) return null
  if (isNonRegionalLocation(location.name)) return null

  const type = String(location.location_type || "").toLowerCase().trim()
  if (type === "regional_office") return location.id

  const parentId = location.parent_location_id ? String(location.parent_location_id) : null
  if (parentId) {
    if (!locationsById) return parentId
    const parent =
      locationsById instanceof Map ? locationsById.get(parentId) : locationsById[parentId]
    if (!parent) return parentId
    if (isNonRegionalLocation(parent.name)) return null
    const parentType = String(parent.location_type || "").toLowerCase().trim()
    if (parentType === "regional_office" || !parentType) return parent.id
    if (parent.parent_location_id) return String(parent.parent_location_id)
    return parent.id
  }

  // Already at a regional-named site without explicit type, or unknown type with no parent.
  if (type === "district_office" || type === "facility") return null
  return location.id
}

/** Locations where a Regional Manager for this staff location may legitimately sit. */
export function regionalManagerEligibleLocationIds(
  staffLocation: LocationHierarchyRow | null | undefined,
  locationsById?: Map<string, LocationHierarchyRow> | Record<string, LocationHierarchyRow> | null,
): string[] {
  if (!staffLocation?.id) return []
  if (isNonRegionalLocation(staffLocation.name)) return []

  const ids = new Set<string>()
  ids.add(String(staffLocation.id))

  const regionalOfficeId = resolveRegionalOfficeIdFromLocation(staffLocation, locationsById)
  if (regionalOfficeId) ids.add(String(regionalOfficeId))

  return Array.from(ids)
}

export function isRegionalManagerLocationMatch(
  staffLocationId: string | null | undefined,
  staffLocation: LocationHierarchyRow | null | undefined,
  managerLocationId: string | null | undefined,
  locationsById?: Map<string, LocationHierarchyRow> | Record<string, LocationHierarchyRow> | null,
): boolean {
  const managerLoc = String(managerLocationId || "")
  if (!managerLoc) return false
  const eligible = regionalManagerEligibleLocationIds(
    staffLocation || (staffLocationId ? { id: String(staffLocationId) } : null),
    locationsById,
  )
  return eligible.includes(managerLoc)
}

export async function loadLocationHierarchyMap(
  admin: SupabaseClient,
  locationIds: Array<string | null | undefined>,
): Promise<Map<string, LocationHierarchyRow>> {
  const ids = Array.from(new Set(locationIds.map((id) => String(id || "")).filter(Boolean)))
  const map = new Map<string, LocationHierarchyRow>()
  if (ids.length === 0) return map

  const { data, error } = await admin
    .from("geofence_locations")
    .select("id, name, location_type, parent_location_id, district_id")
    .in("id", ids)

  if (error) throw error
  for (const row of data || []) {
    map.set(String((row as any).id), row as LocationHierarchyRow)
  }

  // Also load parents so district → regional office resolution works in one pass.
  const parentIds = Array.from(
    new Set(
      (data || [])
        .map((row: any) => String(row.parent_location_id || ""))
        .filter((id: string) => id && !map.has(id)),
    ),
  )
  if (parentIds.length > 0) {
    const { data: parents, error: parentError } = await admin
      .from("geofence_locations")
      .select("id, name, location_type, parent_location_id, district_id")
      .in("id", parentIds)
    if (parentError) throw parentError
    for (const row of parents || []) {
      map.set(String((row as any).id), row as LocationHierarchyRow)
    }
  }

  return map
}

/**
 * Find active Regional Managers who cover a staff location:
 * same location OR the parent regional office for district staff.
 */
export async function findRegionalManagersForLocation(
  admin: SupabaseClient,
  locationId: string | null | undefined,
  options?: { limit?: number },
): Promise<Array<{ id: string; assigned_location_id?: string | null; role?: string | null; position?: string | null }>> {
  if (!locationId) return []
  const limit = options?.limit ?? 20
  const locations = await loadLocationHierarchyMap(admin, [locationId])
  const staffLocation = locations.get(String(locationId)) || { id: String(locationId) }
  const eligibleIds = regionalManagerEligibleLocationIds(staffLocation, locations)
  if (eligibleIds.length === 0) return []

  const { data, error } = await admin
    .from("user_profiles")
    .select("id, role, assigned_location_id, position, created_at")
    .in("assigned_location_id", eligibleIds)
    .eq("role", "regional_manager")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) throw error
  return data || []
}
