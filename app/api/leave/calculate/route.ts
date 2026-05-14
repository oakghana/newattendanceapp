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
import { format } from 'date-fns';

// GET public holidays from database
async function getPublicHolidays(leaveYearPeriod: string): Promise<Date[]> {
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from('ghana_public_holidays')
      .select('holiday_date')
      .gte('holiday_date', `${leaveYearPeriod}-01-01`)
      .lte('holiday_date', `${leaveYearPeriod}-12-31`);

    if (error) {
      console.error('[v0] Supabase error fetching holidays:', error);
      return [];
    }

    return (data || []).map((h: any) => new Date(h.holiday_date));
  } catch (error) {
    console.error('[v0] Error fetching public holidays:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, leaveType, staffCategory, leaveYearPeriod } = body;

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

    // Get entitlement days for this leave type
    const entitlementDays = await getEntitlementDays(leaveType, leaveYearPeriod);
    if (entitlementDays === 0) {
      return NextResponse.json(
        { error: `Unknown leave type: ${leaveType}` },
        { status: 400 }
      );
    }

    // Get public holidays
    const holidays = await getPublicHolidays(leaveYearPeriod);

    // Calculate end date based on business days
    const { endDate, actualLeaveDays } = calculateEndDateFromStartAndDays(
      start,
      entitlementDays,
      holidays
    );

    // Get detailed calculation breakdown
    const calculated = calculateLeaveDuration(start, endDate, holidays);
    const summary = generateCalculationSummary(calculated);

    // Format response
    return NextResponse.json({
      success: true,
      calculation: {
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        daysCount: actualLeaveDays,
        estimatedReturn: format(new Date(endDate.getTime() + 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        businessDays: calculated.businessDays,
        weekendDays: calculated.weekendDays,
        holidayDays: calculated.holidayDays,
        totalCalendarDays: calculated.totalCalendarDays,
        summary: summary,
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
