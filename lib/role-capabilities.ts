export type AppRole = string

export function normalizeAppRole(role?: string | null): string {
  const normalized = String(role || "staff").toLowerCase().trim().replace(/[\s-]+/g, "_")
  if (normalized === "administrator") return "admin"
  if (["regional_hr_leave_office", "regional_leave_office"].includes(normalized)) return "regional_hr"
  if (normalized === "head_of_department") return "department_head"
  if (normalized === "it_admin") return "it-admin"
  return normalized || "staff"
}

export const REGIONAL_HR_ROLES = ["regional_hr"] as const
export const HR_LEAVE_OFFICE_ROLES = ["hr_leave_office", "hr_office", "director_hr", "manager_hr"] as const
export const ADMIN_ROLES = ["admin", "super_admin", "god"] as const

export function isRegionalHrRole(role?: string | null): boolean {
  return REGIONAL_HR_ROLES.includes(normalizeAppRole(role) as (typeof REGIONAL_HR_ROLES)[number])
}

export function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.includes(normalizeAppRole(role) as (typeof ADMIN_ROLES)[number])
}

export function canAccessMemoConsole(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return ["admin", "secretary", "regional_hr", "managing_director"].includes(normalized)
}

export function canEditProfile(role?: string | null): boolean {
  return Boolean(role)
}

export function canManageLeave(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return ["admin", "regional_hr", ...HR_LEAVE_OFFICE_ROLES].includes(normalized)
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
