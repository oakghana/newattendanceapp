// lib/leave-calculation-service.ts
// Service for calculating leave days with business day logic
// Handles weekends, public holidays, and carryover balances

import { format, addDays, isWeekend, isSameDay, isAfter, isBefore } from 'date-fns';

export interface CalculatedLeave {
  startDate: Date;
  endDate: Date;
  totalCalendarDays: number;
  businessDays: number;
  weekendDays: number;
  holidayDays: number;
  holidayDates: string[];
  actualLeaveDays: number;
  summary: string;
}

export interface LeaveBalance {
  currentYearEntitlement: number;
  currentYearUsed: number;
  currentYearRemaining: number;
  previousYearCarryover: number;
  totalAvailable: number;
  usedFromCarryover: number;
}

export interface CalculationSummary {
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  businessDays: number;
  weekendDays: number;
  holidayDays: string[];
  actualLeaveDays: number;
  calculatedAt: string;
}

/**
 * Calculate leave duration between start and end date, accounting for weekends and holidays
 * PUBLIC HOLIDAYS ARE ADDED TO LEAVE (not deducted from entitlement)
 */
export function calculateLeaveDuration(
  startDate: Date,
  endDate: Date,
  holidays: Date[] = [],
  travelingDays: number = 0
): CalculatedLeave {
  if (isAfter(startDate, endDate)) {
    throw new Error('Start date must be before or equal to end date');
  }

  let currentDate = new Date(startDate);
  let businessDays = 0;
  let weekendDays = 0;
  let holidayCount = 0;
  const holidayDates: string[] = [];

  // Calculate total calendar days
  const totalCalendarDays = Math.floor(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1; // +1 to include the start date

  // Normalize holidays to just dates for comparison
  const holidaySet = new Set(
    holidays.map((h) => format(h, 'yyyy-MM-dd'))
  );

  // Count business days vs weekends and holidays
  while (isSameDay(currentDate, endDate) || isBefore(currentDate, endDate)) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');

    if (isWeekend(currentDate)) {
      weekendDays++;
    } else if (holidaySet.has(dateStr)) {
      holidayCount++;
      holidayDates.push(dateStr);
    } else {
      businessDays++;
    }

    currentDate = addDays(currentDate, 1);
  }

  // IMPORTANT: Public holidays and traveling days are ADDED to leave balance, not deducted
  // This means if someone takes leave with holidays, they get the days back
  const actualLeaveDays = businessDays + travelingDays;

  return {
    startDate,
    endDate,
    totalCalendarDays,
    businessDays,
    weekendDays,
    holidayDays: holidayCount,
    holidayDates,
    actualLeaveDays,
    summary: `${businessDays} business days + ${travelingDays} traveling days (${weekendDays} weekend days, ${holidayCount} public holidays excluded from entitlement)`,
  };
}

/**
 * Get the end date for a given start date and number of business days
 * Public holidays within the period are added to leave (not consumed from entitlement)
 */
export function calculateEndDateFromStartAndDays(
  startDate: Date,
  businessDaysNeeded: number,
  holidays: Date[] = [],
  travelingDays: number = 0
): { endDate: Date; actualLeaveDays: number } {
  let currentDate = new Date(startDate);
  let daysConsumed = 0;

  const holidaySet = new Set(
    holidays.map((h) => format(h, 'yyyy-MM-dd'))
  );

  while (daysConsumed < businessDaysNeeded) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');

    if (!isWeekend(currentDate) && !holidaySet.has(dateStr)) {
      daysConsumed++;
    }

    if (daysConsumed < businessDaysNeeded) {
      currentDate = addDays(currentDate, 1);
    }
  }

  // Include traveling days in the total leave days calculation
  const totalLeaveDays = businessDaysNeeded + travelingDays;

  return {
    endDate: currentDate,
    actualLeaveDays: totalLeaveDays,
  };
}

/**
 * Calculate available leave balance for a user
 */
export async function calculateLeaveBalance(
  userId: string,
  leaveType: string,
  leaveYearPeriod: string,
  allRequests: any[] = []
): Promise<LeaveBalance> {
  // Get entitlement from leave policy
  const entitlement = await getEntitlementDays(leaveType, leaveYearPeriod);

  // Get outstanding balance from previous year
  const previousYearCarryover = await getOutstandingBalance(userId, leaveYearPeriod);

  // Calculate used days from approved requests
  const usedDays = calculateUsedDays(allRequests);
  const usedFromCarryover = calculateCarryoverUsed(allRequests);

  return {
    currentYearEntitlement: entitlement,
    currentYearUsed: usedDays,
    currentYearRemaining: entitlement - usedDays,
    previousYearCarryover,
    totalAvailable: entitlement + previousYearCarryover,
    usedFromCarryover,
  };
}

/**
 * Get entitlement days for a leave type from policy
 */
export async function getEntitlementDays(
  leaveType: string,
  leaveYearPeriod: string
): Promise<number> {
  try {
    // This will be called from the database via API
    // Default values for common leave types
    const defaults: { [key: string]: number } = {
      annual: 30,
      annual_leave: 30,
      sick: 30,
      sick_leave: 30,
      maternity: 84, // Normal delivery baseline; CS/twins are resolved from request delivery type.
      maternity_leave: 84,
      paternity: 5,
      paternity_leave: 5,
      compassionate: 7,
      compassionate_leave: 7,
    };

    return defaults[leaveType] || 0;
  } catch (error) {
    console.error('[v0] Error getting entitlement days:', error);
    return 0;
  }
}

/**
 * Get outstanding balance from previous year
 */
export async function getOutstandingBalance(
  userId: string,
  leaveYearPeriod: string
): Promise<number> {
  try {
    // This will be implemented with actual database calls in Phase 5
    // For now, return 0 as placeholder
    return 0;
  } catch (error) {
    console.error('[v0] Error getting outstanding balance:', error);
    return 0;
  }
}

/**
 * Calculate total used days from requests
 */
function calculateUsedDays(requests: any[]): number {
  return requests
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + (r.entitlement_days_used || 0), 0);
}

/**
 * Calculate days used from carryover
 */
function calculateCarryoverUsed(requests: any[]): number {
  return requests
    .filter((r) => r.status === 'approved' && r.is_carry_over_leave)
    .reduce((sum, r) => sum + (r.entitlement_days_used || 0), 0);
}

/**
 * Generate calculation summary for a leave request
 */
export function generateCalculationSummary(calculated: CalculatedLeave): CalculationSummary {
  return {
    startDate: format(calculated.startDate, 'yyyy-MM-dd'),
    endDate: format(calculated.endDate, 'yyyy-MM-dd'),
    totalCalendarDays: calculated.totalCalendarDays,
    businessDays: calculated.businessDays,
    weekendDays: calculated.weekendDays,
    holidayDays: calculated.holidayDates,
    actualLeaveDays: calculated.actualLeaveDays,
    calculatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  };
}

/**
 * Validate leave dates are in the future (optional)
 */
export function validateLeaveDates(startDate: Date, endDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return !isBefore(startDate, today) && !isBefore(endDate, startDate);
}
