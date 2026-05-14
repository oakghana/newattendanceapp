export interface LeaveTypePolicy {
  leaveTypeKey: string
  leaveTypeLabel: string
  entitlementDays: number
  leaveYearPeriod: string
  isEnabled: boolean
}

export interface LeavePolicyPayload {
  activePeriod: string
  periods: { value: string; label: string; active: boolean }[]
  leaveTypes: LeaveTypePolicy[]
}

export const DEFAULT_LEAVE_TYPES: LeaveTypePolicy[] = [
  { leaveTypeKey: "annual", leaveTypeLabel: "Annual Leave", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "sick", leaveTypeLabel: "Sick Leave", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "maternity", leaveTypeLabel: "Maternity Leave", entitlementDays: 84, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "paternity", leaveTypeLabel: "Paternity Leave", entitlementDays: 5, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "study_with_pay", leaveTypeLabel: "Study Leave (With Pay)", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "study_without_pay", leaveTypeLabel: "Study Leave (Without Pay)", entitlementDays: 180, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "casual", leaveTypeLabel: "Casual Leave", entitlementDays: 10, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "part_leave", leaveTypeLabel: "Part Leave", entitlementDays: 15, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "compassionate", leaveTypeLabel: "Compassionate Leave", entitlementDays: 7, leaveYearPeriod: "2026/2027", isEnabled: true },
  { leaveTypeKey: "special_unpaid", leaveTypeLabel: "Special / Leave Without Pay", entitlementDays: 30, leaveYearPeriod: "2026/2027", isEnabled: true },
]

export function getLeaveYearPeriods(baseYear = 2026, years = 10) {
  const periods: { value: string; label: string; active: boolean }[] = []
  for (let i = 0; i < years; i++) {
    const start = baseYear + i
    const end = start + 1
    const label = `${start}/${end}`
    periods.push({ value: label, label, active: i === 0 })
  }
  return periods
}

export function computeLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  
  // Calculate working days (exclude weekends - Saturday=6, Sunday=0)
  let workingDays = 0
  const current = new Date(start)
  
  while (current <= end) {
    const dayOfWeek = current.getDay()
    // Only count Monday (1) to Friday (5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDays++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return workingDays
}

export function computeReturnToWorkDate(endDate: string): string {
  const date = new Date(endDate)
  if (Number.isNaN(date.getTime())) return "N/A"
  date.setDate(date.getDate() + 1)
  return date.toISOString().split("T")[0]
}

/**
 * Enhanced: Get entitlement days by category
 * Supports staff category-based entitlements (Junior, Senior, Manager)
 */
export function getEntitlementByCategory(
  staffCategory: string | null,
  leaveType: string,
  baseEntitlement: number = 21
): number {
  // Category-based multipliers (example - customize based on org policy)
  const categoryMultipliers: Record<string, number> = {
    junior: 0.8,
    senior: 1.0,
    manager: 1.2,
    all_staff: 1.0,
  }

  const normalizedCategory = (staffCategory || "all_staff").toLowerCase()
  const multiplier = categoryMultipliers[normalizedCategory] || 1.0

  return Math.round(baseEntitlement * multiplier)
}

/**
 * Enhanced: Validate leave dates with business logic
 */
export function validateLeaveRequest(startDate: Date, endDate: Date): { valid: boolean; error?: string } {
  if (!startDate || !endDate) {
    return { valid: false, error: "Start and end dates are required" }
  }

  if (startDate > endDate) {
    return { valid: false, error: "Start date cannot be after end date" }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (startDate < today) {
    return { valid: false, error: "Cannot request leave in the past" }
  }

  return { valid: true }
}

/**
 * Enhanced: Get yearly carryover allowance
 */
export function getYearlyCarryoverAllowance(leaveType: string): number {
  const carryoverPolicies: Record<string, number> = {
    annual_leave: 5,
    casual_leave: 3,
    study_with_pay: 0,
  }

  return carryoverPolicies[leaveType] || 0
}

