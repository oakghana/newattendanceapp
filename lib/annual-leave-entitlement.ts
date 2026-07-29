/**
 * lib/annual-leave-entitlement.ts
 *
 * Official QCC / COCOBOD annual leave entitlement rules.
 *
 * Senior Staff:              36 days leave + 2 travel days = 38 total
 * Junior Staff by service:
 *   1 – 3 years :            24 days + 2 travel = 26
 *   4 – 5 years :            28 days + 2 travel = 30
 *   6 – 10 years:            32 days + 2 travel = 34
 *   11 years and above:      36 days + 2 travel = 38
 */

export const TRAVEL_DAYS = 2

export type StaffCategory = "senior" | "junior" | "manager"

export interface AnnualLeaveEntitlement {
  /** "senior" | "junior" */
  staffCategory: StaffCategory
  /** Whole years of completed service at submission date */
  yearsOfService: number
  /** Core leave days (excluding travel) */
  annualLeaveDays: number
  /** Travel days (always 2 for QCC) */
  travelDays: number
  /** annualLeaveDays + travelDays */
  totalEntitlement: number
  /** Human-readable tier label */
  tierLabel: string
}

/**
 * Calculate the number of completed whole years between two dates.
 */
export function computeYearsOfService(
  appointmentDate: Date,
  referenceDate: Date = new Date(),
): number {
  const ref = new Date(referenceDate)
  ref.setHours(0, 0, 0, 0)
  const appt = new Date(appointmentDate)
  appt.setHours(0, 0, 0, 0)

  let years = ref.getFullYear() - appt.getFullYear()

  // Subtract 1 if the anniversary hasn't occurred yet this year
  const anniversaryThisYear = new Date(ref.getFullYear(), appt.getMonth(), appt.getDate())
  if (ref < anniversaryThisYear) years--

  return Math.max(0, years)
}

/**
 * Determine annual leave entitlement for a staff member.
 *
 * @param staffCategory  "senior" | "junior"
 * @param yearsOfService  Completed whole years of service
 */
export function computeAnnualLeaveEntitlement(
  staffCategory: StaffCategory,
  yearsOfService: number,
): AnnualLeaveEntitlement {
  let annualLeaveDays: number
  let tierLabel: string

  if (staffCategory === "senior") {
    annualLeaveDays = 36
    tierLabel = "Senior Staff"
  } else {
    // Junior staff — tiered by years of service
    if (yearsOfService >= 11) {
      annualLeaveDays = 36
      tierLabel = "Junior Staff (11+ years)"
    } else if (yearsOfService >= 6) {
      annualLeaveDays = 32
      tierLabel = "Junior Staff (6 – 10 years)"
    } else if (yearsOfService >= 4) {
      annualLeaveDays = 28
      tierLabel = "Junior Staff (4 – 5 years)"
    } else {
      annualLeaveDays = 24
      tierLabel = "Junior Staff (1 – 3 years)"
    }
  }

  return {
    staffCategory,
    yearsOfService,
    annualLeaveDays,
    travelDays: TRAVEL_DAYS,
    totalEntitlement: annualLeaveDays + TRAVEL_DAYS,
    tierLabel,
  }
}

/**
 * Derive staff category from position / rank title.
 * Rules (in order):
 * 1. If contains "MANAGER" → "Manager"
 * 2. If contains "OFFICER" and does NOT start with "ASSISTANT" → "Senior"
 * 3. If starts with "ASSISTANT" → "Junior"
 * Otherwise → null
 */
export function deriveStaffCategoryFromPosition(
  position?: string | null,
  rank?: string | null,
): StaffCategory | null {
  const combined = `${position || ""} ${rank || ""}`.toLowerCase().trim()
  
  // 1. Manager category: any position containing "manager"
  if (combined.includes("manager")) return "manager"
  
  // 2. Senior category: contains "officer" but does NOT start with "assistant"
  if (combined.includes("officer")) {
    if (!combined.startsWith("assistant")) return "senior"
    else return "junior"
  }
  
  // 3. Junior category: starts with "assistant"
  if (combined.startsWith("assistant")) return "junior"
  
  // 4. Senior category: contains "director"
  if (combined.includes("director")) return "senior"
  
  return null
}

/**
 * Resolve entitlement from a user_profiles row.
 * Priority:
 *   1. Explicit staff_category stored in user_profiles ("senior" / "junior")
 *   2. Derived from position / rank keywords (Officer, Manager, Director → Senior)
 *   3. Falls back to "junior" with 1–3-year tier
 *
 * @param profile  Partial user_profiles object
 * @param referenceDate  Defaults to today
 */
export function resolveEntitlementFromProfile(
  profile: {
    staff_category?: string | null
    date_of_appointment?: string | null
    years_of_service?: number | null
    position?: string | null
    rank?: string | null
  },
  referenceDate: Date = new Date(),
): AnnualLeaveEntitlement {
  // Normalise staff category — prefer stored value, then derive from position/rank
  const rawCategory = String(profile.staff_category || "").toLowerCase().trim()
  let staffCategory: StaffCategory =
    rawCategory === "senior" || rawCategory === "senior staff" ? "senior" : "junior"

  // If no explicit category is stored, derive it from position / rank
  if (!rawCategory || rawCategory === "junior") {
    const derivedCategory = deriveStaffCategoryFromPosition(profile.position, profile.rank)
    if (derivedCategory) staffCategory = derivedCategory
  }

  // Years of service — prefer stored value, then calculate from appointment date
  let yearsOfService = 0
  if (typeof profile.years_of_service === "number" && profile.years_of_service > 0) {
    yearsOfService = profile.years_of_service
  } else if (profile.date_of_appointment) {
    const appt = new Date(profile.date_of_appointment)
    if (!isNaN(appt.getTime())) {
      yearsOfService = computeYearsOfService(appt, referenceDate)
    }
  }

  return computeAnnualLeaveEntitlement(staffCategory, yearsOfService)
}

/**
 * Build the HR notification summary block for annual leave.
 */
export function buildAnnualLeaveEntitlementSummary(
  employeeName: string,
  employeeId: string,
  entitlement: AnnualLeaveEntitlement,
  requestedDays: number,
): {
  summary: Record<string, string>
  validationStatus: "Approved Entitlement" | "Exceeds Entitlement"
  exceedsEntitlement: boolean
} {
  const exceedsEntitlement = requestedDays > entitlement.totalEntitlement
  const validationStatus = exceedsEntitlement ? "Exceeds Entitlement" : "Approved Entitlement"

  return {
    summary: {
      "Employee Name": employeeName,
      "Employee ID": employeeId,
      "Staff Category": entitlement.tierLabel,
      "Years of Service": `${entitlement.yearsOfService} year${entitlement.yearsOfService !== 1 ? "s" : ""}`,
      "Eligible Leave Days": `${entitlement.annualLeaveDays} days`,
      "Travel Days": `${entitlement.travelDays} days`,
      "Total Leave Entitlement": `${entitlement.totalEntitlement} days`,
      "Requested Leave Days": `${requestedDays} days`,
      "Validation Status": validationStatus,
    },
    validationStatus,
    exceedsEntitlement,
  }
}
