/**
 * lib/annual-leave-calculator.ts
 *
 * Centralized annual leave calculation engine.
 * Returns authoritative breakdown: entitlement, enjoyed days, remaining, travelling days, total granted.
 * Used across all annual leave request, balance, export, and memo paths.
 *
 * Formula: annual entitlement - days already enjoyed + travelling days = total granted
 * Example: 36 - 4 + 2 = 34 total granted days
 */

import { resolveEntitlementFromProfile } from "./annual-leave-entitlement"

export interface AnnualLeaveCalculation {
  /** Base annual leave entitlement (e.g., 36 for senior staff) */
  annualEntitlement: number
  /** Days already enjoyed/used this period */
  daysAlreadyEnjoyed: number
  /** Remaining annual leave days: entitlement - enjoyed */
  annualDaysRemaining: number
  /** Travelling days (always 2 for QCC policy) */
  travellingDays: number
  /** Total granted: remaining annual + travelling = 32 + 2 = 34 */
  totalGrantedDays: number
  /** Staff category for context */
  staffCategory: string | null
  /** Years of service for context */
  yearsOfService: number | null
  /** Tier label (e.g., "Senior Staff") */
  tierLabel: string | null
}

/**
 * Calculate annual leave breakdown from a profile and approved requests.
 * @param profile user_profiles row with staff_category, date_of_appointment, years_of_service, position, rank
 * @param daysAlreadyEnjoyed Days already approved/enjoyed in this period (optional, defaults to 0)
 * @param referenceDate For computing years of service (defaults to today)
 * @returns Annual leave calculation with all components
 */
export function calculateAnnualLeaveBreakdown(
  profile: {
    staff_category?: string | null
    date_of_appointment?: string | null
    years_of_service?: number | null
    position?: string | null
    rank?: string | null
  },
  daysAlreadyEnjoyed: number = 0,
  referenceDate: Date = new Date(),
): AnnualLeaveCalculation {
  const entitlement = resolveEntitlementFromProfile(profile, referenceDate)

  const annualEntitlement = entitlement.annualLeaveDays
  const travellingDays = entitlement.travelDays
  const annualDaysRemaining = Math.max(0, annualEntitlement - Math.max(0, daysAlreadyEnjoyed))
  const totalGrantedDays = annualDaysRemaining + travellingDays

  return {
    annualEntitlement,
    daysAlreadyEnjoyed: Math.max(0, daysAlreadyEnjoyed),
    annualDaysRemaining,
    travellingDays,
    totalGrantedDays,
    staffCategory: entitlement.staffCategory,
    yearsOfService: entitlement.yearsOfService,
    tierLabel: entitlement.tierLabel,
  }
}

/**
 * Build human-readable display strings for annual leave.
 * @param calc Result from calculateAnnualLeaveBreakdown
 * @returns Object with display strings for entitled, enjoyed, remaining, and granted
 */
export function getNextWorkingDay(dateValue: string | Date): Date {
  const result = new Date(dateValue)
  result.setDate(result.getDate() + 1)
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1)
  }
  return result
}

/** Count working days after the start date, excluding Saturdays and Sundays. */
export function addAnnualLeaveWorkingDays(startDate: string | Date, workingDays: number): Date {
  const result = new Date(startDate)
  let remaining = Math.max(0, Math.floor(workingDays))
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    if (result.getDay() !== 0 && result.getDay() !== 6) remaining -= 1
  }
  return result
}

export function buildAnnualLeaveDisplay(calc: AnnualLeaveCalculation) {
  const entitledStr =
    calc.travellingDays > 0
      ? `${calc.annualEntitlement} plus ${calc.travellingDays} travelling day${calc.travellingDays !== 1 ? "s" : ""}`
      : String(calc.annualEntitlement)

  const enjoyedStr = calc.daysAlreadyEnjoyed > 0 ? `${calc.daysAlreadyEnjoyed} day(s) already enjoyed` : ""

  const remainingStr = `${calc.annualDaysRemaining} annual leave day${calc.annualDaysRemaining !== 1 ? "s" : ""}`

  const grantedStr =
    calc.travellingDays > 0
      ? `${calc.totalGrantedDays} (${remainingStr} plus ${calc.travellingDays} travelling day${calc.travellingDays !== 1 ? "s" : ""})`
      : String(calc.totalGrantedDays)

  const remarksStr =
    [enjoyedStr, calc.travellingDays > 0 ? `${calc.travellingDays} travelling day${calc.travellingDays !== 1 ? "s" : ""} added` : ""].filter(
      Boolean,
    ).join("; ") || "—"

  return {
    entitled: entitledStr,
    enjoyed: enjoyedStr || "—",
    remaining: remainingStr,
    granted: grantedStr,
    remarks: remarksStr,
  }
}
