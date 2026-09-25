export type AppRole = string

export function normalizeAppRole(role?: string | null): string {
  const normalized = String(role || "staff").toLowerCase().trim().replace(/[\s-]+/g, "_")
  if (normalized === "administrator") return "admin"
  if (["regional_hr_leave_office", "regional_leave_office", "regional_hr_office", "regional_hr_officer", "regional_leave_hr"].includes(normalized)) return "regional_hr"
  if (normalized === "head_of_department") return "department_head"
  if (["regional_driver", "regional_drivers"].includes(normalized)) return "driver"
  if (normalized === "regional_chief_driver") return "chief_driver"
  if (normalized === "it_admin") return "it-admin"
  return normalized || "staff"
}

export const REGIONAL_HR_ROLES = ["regional_hr"] as const
export const HR_LEAVE_OFFICE_ROLES = ["hr_leave_office", "hr_office", "director_hr", "manager_hr"] as const
export const HR_EXECUTIVE_ROLES = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "hr_manager", "hr_director"] as const
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
  return ["chief_driver", "regional_chief_driver"].includes(normalizeAppRole(role))
}

/** Regional drivers are stored as a distinct raw role but normalize to "driver" for permission checks.
 *  Use this to keep regional vs non-regional driver dashboards/data scoped separately. */
export function isRegionalDriverRole(role?: string | null): boolean {
  const raw = String(role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return ["regional_driver", "regional_drivers"].includes(raw)
}

export function isNonRegionalDriverRole(role?: string | null): boolean {
  return normalizeAppRole(role) === "driver" && !isRegionalDriverRole(role)
}

export function isDepartmentHeadRole(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return normalizedRole === "department_head" || normalizedRole === "accounts_executive" || HR_EXECUTIVE_ROLES.includes(normalizedRole as (typeof HR_EXECUTIVE_ROLES)[number])
}

/** True when loan_hod_linkages lists this user as hod_user_id, regardless of role. */
export function isAssignedHod(isLinkedHod?: boolean | null): boolean {
  return Boolean(isLinkedHod)
}

/** Role HOD/RM or an explicit HOD linkage assignment. */
export function isActingHod(role?: string | null, isLinkedHod?: boolean | null): boolean {
  return isDepartmentHeadRole(role) || isRegionalManagerRole(role) || isTransportManagerRole(role) || isAssignedHod(isLinkedHod)
}

export type TransportDeptInfo = { code?: string | null; name?: string | null } | null | undefined

export function isTransportDepartment(dept?: TransportDeptInfo): boolean {
  if (!dept) return false
  const code = String(dept.code || "").toLowerCase()
  const name = String(dept.name || "").toLowerCase()
  return code === "transport" || name.includes("transport")
}

/**
 * Transport department staff who are also HOD (role or linkage) keep TM dashboard
 * features and gain HOD loan/leave/transport capabilities.
 */
export function isTransportDepartmentHod(
  role?: string | null,
  dept?: TransportDeptInfo,
  isLinkedHod?: boolean | null,
): boolean {
  return isTransportDepartment(dept) && (isDepartmentHeadRole(role) || isAssignedHod(isLinkedHod))
}

export function isDualTransportHod(
  role?: string | null,
  dept?: TransportDeptInfo,
  isLinkedHod?: boolean | null,
): boolean {
  const actingHod = isActingHod(role, isLinkedHod)
  if (!actingHod) return false
  return isTransportManagerRole(role) || isTransportDepartmentHod(role, dept, isLinkedHod)
}

export function canManageTransport(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return isRegionalHrRole(role) || isRegionalManagerRole(role) || isChiefDriverRole(role) || isTransportManagerRole(role) || isAdminRole(role) || ["it-admin", "hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
}

/** Driver license register edit/verify: Transport Manager (nationwide) and Chief Driver (their location/region) only.
 *  Regional Manager / Regional HR get read-only access via canManageTransport. */
export function canEditDriverLicenses(role?: string | null): boolean {
  return isTransportManagerRole(role) || isAdminRole(role) || normalizeAppRole(role) === "it-admin"
}

/** Fleet inventory edit: Transport Manager nationwide; administrators retain emergency control. */
export function canEditFleetInventory(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return isTransportManagerRole(role) || isAdminRole(role) || ["it_admin", "it-admin"].includes(normalizedRole)
}

/** Fleet dashboards / read: editors + MD + department heads */
export function canViewFleetInventory(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return (
    canEditFleetInventory(role) ||
    isChiefDriverRole(role) ||
    isRegionalHrRole(role) ||
    isRegionalManagerRole(role) ||
    isDepartmentHeadRole(role) ||
    normalizedRole === "managing_director" ||
    ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  )
}

/** Nationwide fleet (no location filter): Transport Manager and administrators only. */
export function hasNationwideFleetScope(role?: string | null): boolean {
  const normalizedRole = normalizeAppRole(role)
  return (
    isTransportManagerRole(role) ||
    isAdminRole(role) ||
    normalizedRole === "it-admin"
  )
}

export function canCreateTransportRequest(role?: string | null, isLinkedHod?: boolean | null): boolean {
  // Every active non-regional staff member may submit a request. Approval, driver,
  // and fleet capabilities remain separate and are enforced by their own routes.
  const normalizedRole = normalizeAppRole(role)
  if (["intern", "nsp", "regional_manager", "transport_manager"].includes(normalizedRole)) {
    return normalizedRole === "transport_manager" && isAssignedHod(isLinkedHod)
  }
  if (["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)) return false
  return (
    (Boolean(normalizedRole) && normalizedRole !== "driver") ||
    isRegionalHrRole(role) ||
    isChiefDriverRole(role) ||
    isDepartmentHeadRole(role) ||
    isAssignedHod(isLinkedHod)
  )
}

export function isRegionalHrRole(role?: string | null): boolean {
  return REGIONAL_HR_ROLES.includes(normalizeAppRole(role) as (typeof REGIONAL_HR_ROLES)[number])
}

export function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.includes(normalizeAppRole(role) as (typeof ADMIN_ROLES)[number])
}

export function canAccessDisbursementConfirmation(role?: string | null): boolean {
  return isAdminRole(role) || [
    "accounts", "accounts_executive", "hr_executive",
    "loan_office", "hr_loan_office", "accounts_loan_office",
  ].includes(normalizeAppRole(role))
}

/**
 * Recommended and authorized roles to sign off & confirm loan disbursement/repayment.
 * Only Accounts Executive, Accounts Officers, Accounts Loan Office, and System Admin
 * are authorized to click "Confirm Received" / financial sign-off.
 * All other roles (HR Executive, Loan Office, HR Leave Office) have Read-Only view access.
 */
export function canConfirmDisbursement(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return isAdminRole(role) || [
    "accounts", "accounts_executive", "accounts_loan_office",
  ].includes(normalized)
}

export function canManageOwnSignature(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return (
    isAdminRole(normalized) ||
    [
      "department_head",
      "hod",
      "accounts_executive",
      "transport_manager",
      "regional_manager",
      "managing_director",
      "hr",
      "hr_executive",
      "hr_executive_officer",
      "manager_hr",
      "director_hr",
      "hr_manager",
      "hr_director",
    ].includes(normalized)
  )
}

export function isHrExecutiveRole(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  const raw = String(role || "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  return HR_EXECUTIVE_ROLES.includes(normalized as (typeof HR_EXECUTIVE_ROLES)[number]) || ["hr_executive", "hr_executive_officer"].includes(raw)
}

export function canAccessMemoConsole(role?: string | null): boolean {
  const normalized = normalizeAppRole(role)
  return (
    isHrExecutiveRole(normalized) ||
    ["admin", "secretary", "hr_records", "hr_records_officer", "hr_records_manager", "regional_hr", "managing_director"].includes(normalized)
  )
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
