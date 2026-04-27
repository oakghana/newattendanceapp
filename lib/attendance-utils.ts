export type DeptInfo = { code?: string | null; name?: string | null } | undefined | null

/** Subset of RuntimeFlags relevant to time/reason enforcement */
export type AttendanceTimeConfig = {
  latenessReasonDeadline?: string   // "HH:MM" 24 h
  checkoutCutoffTime?: string       // "HH:MM" 24 h
  exemptPrivilegedRolesFromReason?: boolean
}

function normalizeRole(role?: string | null): string {
  return (role || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function isManagerOrAdminRole(role?: string | null): boolean {
  const normalizedRole = normalizeRole(role)
  return [
    "admin",
    "super_admin",
    "it_admin",
    "department_head",
    "head_of_department",
    "regional_manager",
  ].includes(normalizedRole)
}

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
  return isManagerOrAdminRole(role)
}

export function isExemptFromAttendanceReasons(role?: string | null): boolean {
  return isManagerOrAdminRole(role)
}

/**
 * Returns true when a lateness reason SHOULD be required.
 * - Requires reason only on weekdays (Mon-Fri)
 * - Security, Research, Operational, and Transport departments are exempt
 * - Admin, Department heads and regional managers are exempt
 */
export function requiresLatenessReason(
  date: Date = new Date(),
  dept?: DeptInfo,
  role?: string | null,
  config?: AttendanceTimeConfig,
): boolean {
  if (isWeekend(date)) return false
  // Only Security and Transport departments are exempt
  if (isSecurityDept(dept)) return false
  if (isTransportDept(dept)) return false
  // Privileged-role exemption (admin toggle can disable this)
  const exemptRoles = config?.exemptPrivilegedRolesFromReason !== false
  if (exemptRoles && isExemptFromAttendanceReasons(role)) return false
  // Check if current time is past the configured lateness deadline
  const deadlineStr = config?.latenessReasonDeadline ?? "09:00"
  const [deadlineHour, deadlineMin] = deadlineStr.split(":").map(Number)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const isPastDeadline = hours > deadlineHour || (hours === deadlineHour && minutes >= deadlineMin)
  return isPastDeadline
}

/**
 * Returns true when an early-checkout reason should be enforced.
 * - Enforced only when location-level flag is true and it's not a weekend
 * - Only Security and Transport departments are exempt
 * - Admin, Department heads and regional managers are exempt
 */
export function requiresEarlyCheckoutReason(date: Date = new Date(), locationRequires: boolean = true, role?: string | null, dept?: DeptInfo): boolean {
  if (!locationRequires) return false
  if (isWeekend(date)) return false
  // Only Security and Transport departments are exempt
  if (isSecurityDept(dept)) return false
  if (isTransportDept(dept)) return false
  // Admin, department heads and regional managers are exempt
  if (isExemptFromAttendanceReasons(role)) return false
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
 * Check if check-out time is allowed (before 5:40 PM / 17:40)
 * - Weekends: no time restrictions
 * - Admin, Department Heads, Regional Managers: exempt
 * - Operational, Security, and Transport departments are exempt
 * - Regular staff: can only check out before 5:40 PM
 */
export function canCheckOutAtTime(
  date: Date = new Date(),
  dept?: DeptInfo,
  role?: string | null,
  config?: AttendanceTimeConfig,
): boolean {
  // No restrictions on weekends
  if (isWeekend(date)) return true
  if (isExemptFromTimeRestrictions(dept, role)) return true
  const cutoffStr = config?.checkoutCutoffTime ?? "17:40"
  const [cutoffHour, cutoffMin] = cutoffStr.split(":").map(Number)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  return hours < cutoffHour || (hours === cutoffHour && minutes < cutoffMin)
}

export function canAutoCheckoutOutOfRange({
  now = new Date(),
  hasCheckedIn,
  hasCheckedOut,
  isOutOfRange,
  isOnLeave = false,
  hasMetMinimumTime = true,
  hoursWorked = 0,
  minimumHours = 7,
}: {
  now?: Date
  hasCheckedIn: boolean
  hasCheckedOut: boolean
  isOutOfRange: boolean
  isOnLeave?: boolean
  hasMetMinimumTime?: boolean
  hoursWorked?: number
  minimumHours?: number
}): boolean {
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const isAfterCutoff = hours > 16 || (hours === 16 && minutes >= 0)

  return Boolean(
    hasCheckedIn &&
      !hasCheckedOut &&
      isOutOfRange &&
      !isOnLeave &&
      hasMetMinimumTime &&
      hoursWorked >= minimumHours &&
      isAfterCutoff,
  )
}

/**
 * Get check-in deadline time (3 PM for regular staff, anytime for admins/managers)
 */
export function getCheckInDeadline(): string {
  return "3:00 PM"
}

/**
 * Get check-out deadline time (5:40 PM)
 */
export function getCheckOutDeadline(config?: AttendanceTimeConfig): string {
  const cutoffStr = config?.checkoutCutoffTime ?? "17:40"
  const [h, m] = cutoffStr.split(":").map(Number)
  const suffix = h >= 12 ? "PM" : "AM"
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${displayHour}:${m.toString().padStart(2, "0")} ${suffix}`
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
      message: `Check-in is only allowed before ${getCheckInDeadline()}. Check-out is only allowed before ${getCheckOutDeadline()}.`,
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
