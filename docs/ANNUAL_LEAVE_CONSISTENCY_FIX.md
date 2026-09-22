# Annual Leave Letter Consistency Fix

## Problem Statement
Different annual leave advice memos were being generated for the same leave request, showing inconsistent leave dates and potentially different day counts. For example:
- Same staff member (MAMA LEE-SERWAA)
- Same leave period (28 Jul - 20 Aug 2026)
- **Memo 1**: Shows 26 + 2 travelling days = 28 days
- **Memo 2**: Shows different date formatting or calculations

## Root Cause Analysis

### Issue 1: Multiple Date Field Sources (Lines 234-255 in submit-memo/route.ts - NOW FIXED)
The original code attempted to use multiple fallback date fields in this priority order:
```
[staff.leave_start_date, staff.preferred_start_date, staff.start_date]
[staff.leave_end_date, staff.preferred_end_date, staff.end_date]
```

This fallback chain meant:
- If one memo submission had `leave_start_date` undefined, it would pick `preferred_start_date`
- Another memo submission might have both available, picking `leave_start_date` first
- Result: Same leave request showing different dates in different memos

### Issue 2: Database Field Naming
The `detect-staff` endpoint was correctly returning both:
- `preferred_start_date` and `preferred_end_date` (from `leave_plan_requests` table - source of truth)
- `leave_start_date` and `leave_end_date` (aliases pointing to same values)

But the submit-memo endpoint didn't enforce using the authoritative source.

## Solution Implemented

### Single Source of Truth
Changed submit-memo to **ONLY use**:
```typescript
staff.preferred_start_date  // From leave_plan_requests table
staff.preferred_end_date    // From leave_plan_requests table
```

### Code Change (submit-memo/route.ts)
**Before** (lines 234-255):
```typescript
const startDateCandidates = [staff.leave_start_date, staff.preferred_start_date, staff.start_date]
const endDateCandidates = [staff.leave_end_date, staff.preferred_end_date, staff.end_date]
// Try multiple sources with fallback...
```

**After** (lines 229-258):
```typescript
// CRITICAL: Use ONLY the database source of truth for dates
// preferred_start_date and preferred_end_date come directly from leave_plan_requests table
if (staff.preferred_start_date && staff.preferred_start_date !== "NaN" && staff.preferred_start_date !== "NaN-NaN-NaN") {
  const parsed = new Date(staff.preferred_start_date)
  if (!isNaN(parsed.getTime())) {
    leave_start = staff.preferred_start_date
  }
}
```

### Enhanced Logging
Added console logging to verify consistency:
```typescript
console.log("[v0] Creating payment memo with database values:", {
  staff_name: staff.full_name,
  leave_period_start: leave_start,
  leave_period_end: leave_end,
  approved_days: approvedDaysForMemo,
  source_verification: {
    preferred_start_date: staff.preferred_start_date,
    preferred_end_date: staff.preferred_end_date,
    adjusted_days: staff.adjusted_days,
  }
})
```

## Which Memo is Right?
After this fix, **both memos will be identical** because:

1. **Data Source**: Both pull from `leave_plan_requests.preferred_start_date` and `.preferred_end_date`
2. **Calculations**: Both use `adjusted_days` (HR Leave Office approved days)
3. **Validation**: Missing dates now trigger warnings for data quality investigation

## Data Integrity Verification Checklist
- ✅ No hardcoded annual leave records (all from database)
- ✅ Single source of truth for dates (`leave_plan_requests` table)
- ✅ Consistent date field selection across all memos
- ✅ Logging captures memo data for audit trail
- ✅ Pre-validation before memo generation

## Testing Recommendations
1. Generate multiple memos for the same leave request
2. Compare memo dates - should be identical
3. Check console logs for "[v0] Creating payment memo" entries
4. Verify approved_days consistency across memos
5. Confirm no "NaN" or invalid dates in memo dates

## Related Fixes
- Days consistency fix (uses `adjusted_days` for day counts)
- Rank name fix (uses actual rank, not category)
- Approved memo indicators (visual feedback on processed requests)
