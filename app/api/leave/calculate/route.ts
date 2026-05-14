// app/api/leave/calculate/route.ts
// API endpoint for calculating leave days based on start date and entitlement

import { NextRequest, NextResponse } from 'next/server';
import {
  calculateLeaveDuration,
  calculateEndDateFromStartAndDays,
  generateCalculationSummary,
  validateLeaveDates,
  getEntitlementDays,
} from '@/lib/leave-calculation-service';
import { createAdminClient } from '@/lib/supabase/server';
import { format, addDays, isWeekend } from 'date-fns';

interface HolidayRecord {
  holiday_date: string;
  holiday_name: string;
}

// GET public holidays from database with names for display
async function getPublicHolidaysWithNames(leaveYearPeriod: string): Promise<HolidayRecord[]> {
  try {
    const admin = await createAdminClient();

    // leaveYearPeriod is in format "2025/2026", extract both years
    const years = leaveYearPeriod.split('/').map((y: string) => y.trim());
    const startYear = years[0] || new Date().getFullYear().toString();
    const endYear = years[1] || startYear;

    const { data, error } = await admin
      .from('ghana_public_holidays')
      .select('holiday_date, holiday_name')
      .gte('holiday_date', `${startYear}-01-01`)
      .lte('holiday_date', `${endYear}-12-31`)
      .order('holiday_date', { ascending: true });

    if (error) {
      console.error('[v0] Supabase error fetching holidays:', error);
      return [];
    }

    return (data || []) as HolidayRecord[];
  } catch (error) {
    console.error('[v0] Error fetching public holidays:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, leaveType, leaveYearPeriod, entitlementDays: callerEntitlementDays } = body;

    // Validate required fields
    if (!startDate || !leaveType || !leaveYearPeriod) {
      return NextResponse.json(
        { error: 'Missing required fields: startDate, leaveType, leaveYearPeriod' },
        { status: 400 }
      );
    }

    // Parse and validate start date
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return NextResponse.json(
        { error: 'Invalid start date format' },
        { status: 400 }
      );
    }

    // Prefer entitlement days passed directly from the client (already loaded
    // from the policy), fall back to the service lookup only as last resort.
    let entitlementDays: number = 0;
    if (typeof callerEntitlementDays === 'number' && callerEntitlementDays > 0) {
      entitlementDays = callerEntitlementDays;
    } else {
      entitlementDays = await getEntitlementDays(leaveType, leaveYearPeriod);
    }

    if (entitlementDays === 0) {
      return NextResponse.json(
        { error: `No entitlement found for leave type: ${leaveType}` },
        { status: 400 }
      );
    }

    // Get public holidays with names so we can display them
    const holidayRecords = await getPublicHolidaysWithNames(leaveYearPeriod);
    const holidays = holidayRecords.map((h) => new Date(h.holiday_date));

    // Build a map of date → name for display
    const holidayNameMap = new Map<string, string>(
      holidayRecords.map((h) => [h.holiday_date, h.holiday_name])
    );

    // Calculate end date by counting forward exactly entitlementDays working days,
    // skipping weekends and public holidays
    const { endDate, actualLeaveDays } = calculateEndDateFromStartAndDays(
      start,
      entitlementDays,
      holidays
    );

    // Get full breakdown: total calendar days, weekend count, holiday count
    const calculated = calculateLeaveDuration(start, endDate, holidays);
    const summary = generateCalculationSummary(calculated);

    // Identify which holidays fall within the leave period (for display)
    const holidaySet = new Map<string, string>();
    holidayRecords.forEach((h) => {
      const d = new Date(h.holiday_date);
      if (d >= start && d <= endDate) {
        holidaySet.set(h.holiday_date, h.holiday_name);
      }
    });
    const holidaysInPeriod = Array.from(holidaySet.entries()).map(([date, name]) => ({
      date,
      name,
    }));

    // Calculate return-to-work date — first working day after leave ends
    const allHolidayDates = new Set(holidayRecords.map((h) => h.holiday_date));
    let returnDate = addDays(endDate, 1);
    while (isWeekend(returnDate) || allHolidayDates.has(format(returnDate, 'yyyy-MM-dd'))) {
      returnDate = addDays(returnDate, 1);
    }

    return NextResponse.json({
      success: true,
      calculation: {
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        daysCount: actualLeaveDays,
        estimatedReturn: format(returnDate, 'yyyy-MM-dd'),
        businessDays: calculated.businessDays,
        weekendDays: calculated.weekendDays,
        holidayDays: calculated.holidayDays,
        totalCalendarDays: calculated.totalCalendarDays,
        holidaysInPeriod,   // named holidays falling inside the leave window
        summary,
      },
    });
  } catch (error) {
    console.error('[v0] Leave calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate leave dates' },
      { status: 500 }
    );
  }
}

// GET endpoint for simple pre-calculation
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const leaveType = searchParams.get('leaveType');
    const leaveYearPeriod = searchParams.get('leaveYearPeriod');

    if (!startDate || !leaveType || !leaveYearPeriod) {
      return NextResponse.json(
        { error: 'Missing query parameters: startDate, leaveType, leaveYearPeriod' },
        { status: 400 }
      );
    }

    // Forward to POST logic
    return POST(
      new NextRequest(
        new URL(request.url),
        {
          method: 'POST',
          body: JSON.stringify({
            startDate,
            leaveType,
            leaveYearPeriod,
          }),
        }
      )
    );
  } catch (error) {
    console.error('[v0] Leave calculation GET error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
