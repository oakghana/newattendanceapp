import { normalizeAppRole } from "./role-capabilities"
import { resolveOwnedLocationIdsForRegionalOffice } from "./regional-manager-scope"

export const IT_ADMIN_CREATABLE_ROLES = [
  "staff",
  "contract",
  "intern",
  "nsp",
  "regional_manager",
  "driver",
  "chief_driver",
] as const

export type ItAdminScope = "regional_it_admin" | "head_office_it_admin"

export function normalizeItAdminScope(scope?: string | null): ItAdminScope | null {
  const normalized = String(scope || "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  return normalized === "regional_it_admin" || normalized === "head_office_it_admin" ? normalized : null
}

export function getEffectiveItAdminScope(admin: AdminProfile): ItAdminScope | null {
  const explicitScope = normalizeItAdminScope(admin.it_admin_scope)
  if (explicitScope) return explicitScope
  // Legacy regional IT Admins may not have the new scope column populated yet.
  // A region plus assigned office is sufficient to preserve regional access; head-office
  // access must remain explicitly assigned by an Administrator.
  return admin.assigned_location_id ? "regional_it_admin" : null
}

export async function resolveItAdminRegionId(
  adminDb: AdminClient,
  admin: AdminProfile,
): Promise<string | null> {
  if (admin.region_id) return String(admin.region_id)
  if (!admin.assigned_location_id) return null
  const { data: location } = await adminDb
    .from("geofence_locations")
    .select("district_id")
    .eq("id", admin.assigned_location_id)
    .maybeSingle()
  if (!location?.district_id) return null
  const { data: district } = await adminDb
    .from("districts")
    .select("region_id")
    .eq("id", location.district_id)
    .maybeSingle()
  return district?.region_id ? String(district.region_id) : null
}

export function canItAdminCreateRole(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return IT_ADMIN_CREATABLE_ROLES.includes(normalized as (typeof IT_ADMIN_CREATABLE_ROLES)[number])
}

export function getItAdminCreatableRoleOptions<T extends readonly [string, string][]>(options: T): T[number][] {
  return options.filter(([value]) => canItAdminCreateRole(value))
}

type AdminProfile = {
  role?: string | null
  it_admin_scope?: string | null
  assigned_location_id?: string | null
  region_id?: string | null
}

type StaffProfile = {
  id?: string | null
  role?: string | null
  it_admin_scope?: string | null
  it_admin_update_restricted?: boolean | null
  assigned_location_id?: string | null
  region_id?: string | null
}

type AdminClient = {
  from: (table: string) => any
}

export async function canUpdateStaffByITAdmin(
  adminDb: AdminClient,
  admin: AdminProfile,
  staff: StaffProfile,
  nextAssignedLocationId?: string | null,
): Promise<{ allowed: boolean; reason?: string; scope?: ItAdminScope }> {
  const normalizedRole = normalizeAppRole(admin.role)
  if (normalizedRole !== "it-admin") return { allowed: false, reason: "Only an IT Admin can use this policy." }
  if (staff.it_admin_update_restricted) return { allowed: false, reason: "This staff profile is restricted from IT Admin updates." }

  const scope = getEffectiveItAdminScope(admin)
  if (!scope) return { allowed: false, reason: "An Administrator must assign an explicit IT Admin scope before this account can update staff." }

  if (scope === "head_office_it_admin") return { allowed: true, scope }

  const adminRegionId = await resolveItAdminRegionId(adminDb, admin)
  if (!adminRegionId) return { allowed: false, reason: "Regional IT Admin is missing an assigned region." }

  const locationIds = [staff.assigned_location_id, nextAssignedLocationId].filter(
    (value): value is string => Boolean(value && value !== "none"),
  )
  if (locationIds.length === 0) return { allowed: false, reason: "The staff profile must have an assigned location." }

  let ownedLocationIds: string[]
  try {
    ownedLocationIds = await resolveOwnedLocationIdsForRegionalOffice(
      adminDb as any,
      admin.assigned_location_id,
      adminRegionId,
    )
  } catch {
    return { allowed: false, reason: "Unable to verify the staff location scope." }
  }
  if (ownedLocationIds.length === 0 || locationIds.some((locationId) => !ownedLocationIds.includes(locationId))) {
    return { allowed: false, reason: "Regional IT Admins may update only staff whose assigned location, district, and parent region match their assigned region." }
  }
  return { allowed: true, scope }
}

export async function canViewStaffByITAdmin(
  adminDb: AdminClient,
  admin: AdminProfile,
  staff: StaffProfile,
): Promise<{ allowed: boolean; reason?: string; scope?: ItAdminScope }> {
  return canUpdateStaffByITAdmin(adminDb, admin, { ...staff, it_admin_update_restricted: false })
}
