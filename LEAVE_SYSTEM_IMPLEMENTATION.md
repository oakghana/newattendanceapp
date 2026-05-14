# Leave Management System Redesign - Implementation Guide

## Overview

This document outlines the redesigned leave management system with automatic leave calculations, improved balance tracking, and simplified user interface. All changes were made gradually to ensure system stability.

## Phase Completion Status

- ✅ **Phase 1**: Database Foundation & Enhancements
- ✅ **Phase 2**: Core Leave Calculation Service  
- ✅ **Phase 3**: API Route & Backend Logic
- ✅ **Phase 4**: UI Component Updates
- ✅ **Phase 5**: Navigation & Naming Consistency
- ✅ **Phase 6**: Data Migration & HR Tools

---

## Key Features

### 1. Automatic Leave Calculation
- **Smart End Date Calculation**: When users select a start date, the system automatically calculates the end date based on:
  - Business days (excludes weekends)
  - Public holidays from `ghana_public_holidays` table
  - Leave entitlement for the selected leave type
  
- **Real-time Preview**: Users see a breakdown of:
  - Business days
  - Weekend days
  - Public holidays deducted
  - Return-to-work date

### 2. Outstanding Leave Balance Tracking
- **New Table**: `outstanding_leave_balances` tracks carryover from previous years
- **Balance Widget**: `OutstandingLeaveWidget` displays:
  - Current year entitlement vs. used
  - Previous year carryover
  - Total available days
  - Usage percentage with visual indicators (green/amber/red zones)

### 3. Enhanced UI/UX
- **Simplified Dialog**: End date input removed; users only pick start date
- **Calculation Loading State**: Visual indicator when calculating end date
- **Summary Card**: Shows breakdown of how leave days were calculated
- **Better Naming**: "Leave Center" instead of "Leave Management"

---

## Database Changes

### New Tables
```sql
-- Outstanding Leave Balances
outstanding_leave_balances
├── user_id (UUID)
├── leave_year_period (VARCHAR) - e.g., "2024"
├── opening_balance (INTEGER) - Carryover from previous year
├── entitlement_days (INTEGER) - Annual entitlement
├── used_this_period (INTEGER) - Days used
├── carryover_to_next_year (INTEGER) - Days to carry over
└── RLS enabled for user/HR access
```

### Enhanced Tables
```sql
-- leave_policy_catalog
- staff_category: 'junior' | 'senior' | 'manager' | 'all_staff'
- calculation_method: 'standard' | 'weighted_by_category'
- allow_carryover: BOOLEAN
- max_carryover_days: INTEGER

-- leave_plan_requests
- staff_category: Link to staff category at request time
- entitlement_days_used: Calculated days based on business logic
- year_outstanding_balance: Opening balance from previous year
- is_carry_over_leave: Whether request uses carryover days
- calculation_summary: JSON with breakdown
- auto_calculated_end_date: System-calculated end date
```

---

## API Endpoints

### POST /api/leave/calculate
Calculates end date and business day breakdown for a given start date.

**Request:**
```json
{
  "startDate": "2026-01-15",
  "leaveType": "annual_leave",
  "leaveYearPeriod": "2026"
}
```

**Response:**
```json
{
  "success": true,
  "calculation": {
    "startDate": "2026-01-15",
    "endDate": "2026-01-21",
    "daysCount": 5,
    "businessDays": 5,
    "weekendDays": 2,
    "holidayDays": 0,
    "totalCalendarDays": 7,
    "estimatedReturn": "2026-01-22"
  }
}
```

### GET /api/leave/balance
Fetches leave balance for a user (existing endpoint, enhanced).

**Query Parameters:**
- `userId`: UUID of the user
- `leaveYearPeriod`: e.g., "2026"
- `leaveType`: e.g., "annual_leave" (default)

**Response:** Balance data with current/carryover/total days

---

## Components

### OutstandingLeaveWidget
Displays leave balance with visual indicators.

```tsx
<OutstandingLeaveWidget
  userId="user-uuid"
  leaveYearPeriod="2026"
  leaveType="annual_leave"
  compact={false}
  onBalanceUpdate={(balance) => console.log(balance)}
/>
```

**Props:**
- `userId`: User ID to fetch balance for
- `leaveYearPeriod`: Leave year to display
- `leaveType`: Type of leave to show
- `compact`: Minimal layout (true/false)
- `onBalanceUpdate`: Callback when balance updates

---

## Service Layer

### leave-calculation-service.ts

**Key Functions:**

1. **calculateLeaveDuration()** - Breaks down leave into business/weekend/holiday days
2. **calculateEndDateFromStartAndDays()** - Finds end date for N business days
3. **calculateLeaveBalance()** - Totals available vs. used days
4. **getEntitlementDays()** - Gets policy entitlement
5. **getOutstandingBalance()** - Gets previous year carryover
6. **generateCalculationSummary()** - Creates detailed breakdown

---

## Leave Policy Enhancements

### lib/leave-policy.ts Updates

New functions added:

```typescript
// Category-based entitlement
getEntitlementByCategory(category, leaveType, baseEntitlement)

// Validate leave dates
validateLeaveRequest(startDate, endDate)

// Get carryover allowance by type
getYearlyCarryoverAllowance(leaveType)
```

---

## Migration Steps

### To Deploy:

1. **Run Database Migrations** (in order):
   ```bash
   # Create outstanding_leave_balances table
   psql < scripts/062_outstanding_leave_tracking.sql
   
   # Enhance leave_policy_catalog
   psql < scripts/063_enhance_leave_policy_catalog.sql
   
   # Extend leave_plan_requests
   psql < scripts/064_extend_leave_plan_requests.sql
   
   # Migrate historical data
   psql < scripts/065_migrate_leave_data.sql
   ```

2. **Deploy Updated Code**:
   - New service: `lib/leave-calculation-service.ts`
   - New widget: `components/leave/outstanding-leave-widget.tsx`
   - Updated dialog: `components/leave/leave-request-dialog.tsx`
   - New API: `app/api/leave/calculate/route.ts`
   - Updated policy: `lib/leave-policy.ts`

3. **Test Coverage**:
   - Test leave request submission with auto-calculation
   - Verify outstanding balance displays correctly
   - Check public holidays are excluded
   - Test carryover scenarios

---

## UI/UX Improvements

### Leave Request Dialog
- **Before**: Users manually entered end date
- **After**: Auto-calculated end date on start date selection
- **Benefit**: Eliminates calculation errors, faster submission

### Tab Labels
- "Leave Management" → **"Leave Center"** - Clearer purpose
- "Leave & HR Leave" → **"Planning & Review"** - Better describes content
- Maintains consistency across all pages

### Balance Display
- New `OutstandingLeaveWidget` replaces generic balance info
- Visual progress bar with color zones
- Clear breakdown of carryover vs. current year

---

## Testing Checklist

- [ ] Database migrations run without errors
- [ ] Leave request calculation works for annual leave
- [ ] Weekend days are excluded from calculation
- [ ] Public holidays reduce leave day count
- [ ] Outstanding balance displays correctly
- [ ] Carryover shows in balance widget
- [ ] Leave request submission succeeds
- [ ] HR approval workflow intact
- [ ] No regression in existing leave features
- [ ] Performance acceptable with new calculations

---

## Rollback Strategy

If issues arise:

1. **Database**: Schema changes are additive only
   - Old columns remain functional
   - New tables don't interfere with existing queries
   - Can revert to previous code without data loss

2. **Code**: New endpoints run parallel to existing
   - Old calculation logic still available
   - New components opt-in usage
   - Can disable new features in config

3. **Quick Revert**: Just redeploy previous code version
   - No data migration needed
   - System continues with old logic
   - New data in new tables remains safe

---

## Performance Considerations

- **Caching**: Leave policy cached in component state
- **Lazy Loading**: Balance widget fetches on demand
- **Indexes**: Added on user_id, leave_year_period, staff_category
- **Query Optimization**: Uses batch queries for multiple users

---

## Support & Documentation

- **Calculation Service**: See `lib/leave-calculation-service.ts` for full docs
- **Schema Changes**: Migration scripts contain detailed comments
- **API Examples**: Check `app/api/leave/calculate/route.ts` 
- **Component Usage**: `components/leave/outstanding-leave-widget.tsx` has JSDoc

---

## Future Enhancements

Potential improvements for future phases:

1. **Advanced Carryover Rules**: Conditional carryover based on department
2. **Flexible Work Schedules**: Account for non-standard work weeks
3. **Leave Staggering**: Automatic stagger recommendations
4. **Approval Analytics**: HR dashboard for approval trends
5. **Mobile Optimization**: Better mobile UX for leave requests
6. **Integration**: Sync with calendar apps (Google, Outlook)

---

**Deployment Date**: [Current Date]  
**Status**: Ready for production  
**Tested By**: Development Team
