export type DeptInfo = { code?: string | null; name?: string | null } | undefined | null

export function isWeekend(date: Date = new Date()): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

export function isSecurityDept(dept?: DeptInfo): boolean {
  if (!dept) return false
  const code = (dept.code || "").toString().toLowerCase()
  const name = (dept.name || "").toString().toLowerCase()
  return code === "security" || name.includes("security")
}

export function isResearchDept(dept?: DeptInfo): boolean {
  if (!dept) return false
  const code = (dept.code || "").toString().toLowerCase()
  const name = (dept.name || "").toString().toLowerCase()
  return code === "research" || name.includes("research")
}

export function isOperationalDept(dept?: DeptInfo): boolean {
  if (!dept) return false
  const code = (dept.code || "").toString().toLowerCase()
  const name = (dept.name || "").toString().toLowerCase()
  return code === "operations" || code === "operational" || name.includes("operations") || name.includes("operational")
}

export function isTransportDept(dept?: DeptInfo): boolean {
  if (!dept) return false
  const code = (dept.code || "").toString().toLowerCase()
  const name = (dept.name || "").toString().toLowerCase()
  return code === "transport" || name.includes("transport")
}

export function isExemptFromTimeRestrictions(dept?: DeptInfo, role?: string | null): boolean {
  if (!dept && !role) return false
  // Operational, Security and Transport departments are exempt from time restrictions
  if (isOperationalDept(dept)) return true
  if (isSecurityDept(dept)) return true
  if (isTransportDept(dept)) return true
  // Admin, department/head and regional manager roles are also exempt
  const lowerRole = (role || "").toLowerCase()
  return lowerRole === "admin" || lowerRole === "department_head" || lowerRole === "regional_manager"
}

export function isExemptFromAttendanceReasons(role?: string | null): boolean {
  if (!role) return false
  const lowerRole = role.toLowerCase()
  return lowerRole === "department_head" || lowerRole === "regional_manager"
}

/**
 * Returns true when a lateness reason SHOULD be required.
 * - Requires reason only on weekdays (Mon-Fri)
 * - Security, Research, Operational, and Transport departments are exempt
 * - Admin, Department heads and regional managers are exempt
 */
export function requiresLatenessReason(date: Date = new Date(), dept?: DeptInfo, role?: string | null): boolean {
  if (isWeekend(date)) return false
  // All non-restricted departments are exempt
  if (isExemptFromTimeRestrictions(dept, role)) return false
  if (isResearchDept(dept)) return false
  // Admin role is also exempt
  const lowerRole = (role || "").toLowerCase()
  if (lowerRole === "admin") return false
  return true
}

/**
 * Returns true when an early-checkout reason should be enforced.
 * - Enforced only when location-level flag is true and it's not a weekend
 * - All non-restricted departments (Security, Operational, Transport) are exempt
 * - Admin, Department heads and regional managers are exempt
 */
export function requiresEarlyCheckoutReason(date: Date = new Date(), locationRequires: boolean = true, role?: string | null, dept?: DeptInfo): boolean {
  if (!locationRequires) return false
  if (isWeekend(date)) return false
  // All non-restricted departments are exempt
  if (isExemptFromTimeRestrictions(dept, role)) return false
  if (isResearchDept(dept)) return false
  // Admin role is also exempt
  const lowerRole = (role || "").toLowerCase()
  if (lowerRole === "admin") return false
  return true
}

/**
 * Check if check-in time is allowed
 * - Weekends: no time restrictions
 * - Admins, Regional Managers, Department Heads: can check in anytime
 * - Regular staff: can only check in before 3 PM (15:00)
 * - Operational and Security departments: can check in anytime
 */
export function canCheckInAtTime(date: Date = new Date(), dept?: DeptInfo, role?: string | null): boolean {
  // No restrictions on weekends
  if (isWeekend(date)) return true
  // Exempt roles can check in anytime
  if (isExemptFromTimeRestrictions(dept, role)) return true
  const hours = date.getHours()
  return hours < 15 // Allow check-in only before 3 PM for regular staff
}

/**
 * Check if check-out time is allowed (before 9 PM / 21:00)
 * - Weekends: no time restrictions
 * - Operational and Security departments are exempt
 */
export function canCheckOutAtTime(date: Date = new Date(), dept?: DeptInfo, role?: string | null): boolean {
  // No restrictions on weekends
  if (isWeekend(date)) return true
  if (isExemptFromTimeRestrictions(dept, role)) return true
  const hours = date.getHours()
  return hours < 21 // Allow check-out only before 9 PM
}

/**
 * Get check-in deadline time (3 PM for regular staff, anytime for admins/managers)
 */
export function getCheckInDeadline(): string {
  return "3:00 PM"
}

/**
 * Get check-out deadline time (9 PM)
 */
export function getCheckOutDeadline(): string {
  return "9:00 PM"
}

// -----------------------------------------------------------------------------
// New helpers for exemptions and restriction information
// -----------------------------------------------------------------------------

export type Exemption = {
  type: string
  message: string
}

export type Restriction = {
  type: string
  message: string
}

/**
 * Returns an object containing arrays of exemptions and restrictions
 * based on department/role/date.  This will power the pre-check-in banner.
 */
export function getStaffRestrictions(dept?: DeptInfo, role?: string | null, date: Date = new Date()): {
  exemptions: Exemption[]
  restrictions: Restriction[]
  canCheckIn: boolean
  canCheckOut: boolean
  deadlines: { checkIn: string; checkOut: string }
} {
  const exemptions: Exemption[] = []
  const restrictions: Restriction[] = []

  if (isExemptFromTimeRestrictions(dept, role)) {
    exemptions.push({ type: "time_restriction", message: "Your department is exempt from time restrictions" })
  } else {
    restrictions.push({
      type: "time_restriction",
      message: `Check-in is only allowed before ${getCheckInDeadline()}`,
    })
  }

  if (requiresLatenessReason(date, dept, role)) {
    restrictions.push({ type: "lateness_reason", message: "Lateness reason is required for late check-ins" })
  }

  // location requirement is handled elsewhere; caller can supply a message if needed
  // the banner component will evaluate assigned location and GPS state

  return {
    exemptions,
    restrictions,
    canCheckIn: canCheckInAtTime(date, dept, role),
    canCheckOut: canCheckOutAtTime(date, dept, role),
    deadlines: { checkIn: getCheckInDeadline(), checkOut: getCheckOutDeadline() },
  }
}

/**
 * Return a description string suitable for display given an exemption type.
 */
export function getExemptionDescription(exemptionType: string): string {
  switch (exemptionType) {
    case "time_restriction":
      return "No time limits for attendance."
    case "lateness_reason":
      return "You are not required to provide reasons for being late."
    default:
      return "Exemption granted."
  }
}

/**
 * Return a localized explanation for a given restriction type.
 */
export function getRestrictionReason(restrictionType: string, dept?: DeptInfo, role?: string | null): string {
  switch (restrictionType) {
    case "time_restriction":
      return `Attendance is only allowed before ${getCheckInDeadline()} for your current role/department.`
    case "lateness_reason":
      return `You must provide a reason when checking in after 9:00 AM.`
    case "location_required":
      return `You must be physically present at your assigned location to check in.`
    default:
      return "A restriction applies to your attendance action."
  }
}
