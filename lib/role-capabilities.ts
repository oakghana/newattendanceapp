export type AppRole = string

export function normalizeAppRole(role?: string | null): string {
  const normalized = String(role || "staff").toLowerCase().trim().replace(/[\s-]+/g, "_")
  if (normalized === "administrator") return "admin"
  if (["regional_hr_leave_office", "regional_leave_office", "regional_hr_office", "regional_hr_officer", "regional_leave_hr"].includes(normalized)) return "regional_hr"
  if (normalized === "head_of_department") return "department_head"
  if (["regional_driver", "regional_drivers"].includes(normalized)) return "driver"
  if (normalized === "it_admin") return "it-admin"
  return normalized || "staff"
}

export const REGIONAL_HR_ROLES = ["regional_hr"] as const
export const HR_LEAVE_OFFICE_ROLES = ["hr_leave_office", "hr_office", "director_hr", "manager_hr"] as const
export const ADMIN_ROLES = ["admin", "super_admin", "god"] as const
export const ATTENDANCE_ONLY_ROLES = ["intern", "nsp"] as const

export function isAttendanceOnlyRole(role?: string | null): boolean {
  return ATTENDANCE_ONLY_ROLES.includes(normalizeAppRole(role) as (typeof ATTENDANCE_ONLY_ROLES)[number])
}

export function isRegionalManagerRole(role?: string | null): boolean {
  return normalizeAppRole(role) === "regional_manager"
}

export const NON_REGIONAL_TRANSPORT_LOCATIONS = ["QCC Head Office", "HEAD OFFICE SWANZY ARCADE", "Awutu Stores", "Nsawam Archives"] as const

export function isTransportManagerRole(role?: string | null): boolean {
  return normalizeAppRole(role) === "transport_manager"
}

export function isChiefDriverRole(role?: string | null): boolean {
  return normalizeAppRole(role) === "chief_driver"
}

export function isDepartmentHeadRole(role?: string | null): boolean {
  return normalizeAppRole(role) === "department_head"
}

export function canManageTransport(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return isRegionalHrRole(role) || isRegionalManagerRole(role) || isChiefDriverRole(role) || isTransportManagerRole(role) || isAdminRole(role) || ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
}

/** Fleet inventory edit (status, details, register): TM nationwide; RM / Regional HR regional only */
export function canEditFleetInventory(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return (
    isTransportManagerRole(role) ||
    isChiefDriverRole(role) ||
    isRegionalManagerRole(role) ||
    isRegionalHrRole(role) ||
    isAdminRole(role) ||
    ["it_admin", "it-admin"].includes(normalizedRole)
  )
}

/** Fleet dashboards / read: editors + MD + department heads */
export function canViewFleetInventory(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return (
    canEditFleetInventory(role) ||
    isDepartmentHeadRole(role) ||
    normalizedRole === "managing_director" ||
    ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  )
}

/** Nationwide fleet (no region filter): Transport Manager, MD, admin */
export function hasNationwideFleetScope(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return (
    isTransportManagerRole(role) ||
    isAdminRole(role) ||
    normalizedRole === "managing_director" ||
    ["it_admin", "it-admin"].includes(normalizedRole)
  )
}

export function canCreateTransportRequest(role?: string | null): boolean {
  // Regional HR / Chief Driver create regional requests for RM → MD.
  // Department Heads create non-regional requisitions (separate API).
  return isRegionalHrRole(role) || isChiefDriverRole(role) || isDepartmentHeadRole(role)
}

export function isRegionalHrRole(role?: string | null): boolean {
  return REGIONAL_HR_ROLES.includes(normalizeAppRole(role) as (typeof REGIONAL_HR_ROLES)[number])
}

export function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.includes(normalizeAppRole(role) as (typeof ADMIN_ROLES)[number])
}

export function canAccessMemoConsole(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return ["admin", "secretary", "hr_records", "hr_records_officer", "hr_records_manager", "regional_hr", "managing_director"].includes(normalized)
}

export function canEditProfile(role?: string | null): boolean {
  return Boolean(role)
}

export function canManageLeave(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return ["admin", "it-admin", "regional_hr", ...HR_LEAVE_OFFICE_ROLES].includes(normalized)
}

export function canViewPersonalAttendance(): boolean {
  return true
}

export function canChangeOwnPassword(): boolean {
  return true
}

export function canManageGlobalPolicies(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return ["admin", "director_hr", "manager_hr", "hr_leave_office", "hr_office"].includes(normalized)
}

export function canManageHolidays(role?: string | null): boolean {
  return canManageGlobalPolicies(role)
}
