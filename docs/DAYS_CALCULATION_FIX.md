# Days Calculation Fix - Eliminating Hardcoded Values

## Problem Statement

Payment advice memos were showing incorrect leave durations because they were using hardcoded day values (e.g., "26 + 2 = 28 days") instead of calculating actual days from the leave period dates in the database.

**Example of the Issue:**
- Memo showed: "26 plus 2 travelling days = 28 total"
- Actual dates: Jul 28, 2026 to Sep 02, 2026
- Correct calculation: 37 calendar days + 2 travelling days = 39 total days

## Root Cause

The `detect-staff` API endpoint was using `adjusted_days` field from the database, which contained hardcoded values rather than calculating from actual dates. The memo generator then used these hardcoded values, resulting in false narratives about leave duration.

## Solution Implemented

### 1. Added Date-Based Calculation Function
Created `calculateLeaveDays()` function in `/app/api/leave/payment-advice/detect-staff/route.ts`:
- Calculates actual calendar days between `preferred_start_date` and `preferred_end_date`
- Validates date formats and handles errors gracefully
- Returns 0 for invalid date inputs with warning logs

### 2. Changed Approved Days Calculation
Updated the `approved_days` field to use:
```typescript
approved_days = calculateLeaveDays(preferred_start_date, preferred_end_date) + travelling_days_added
```

**Before:** `approved_days = year_outstanding_balance + adjusted_days + travelling_days_added`
**After:** `approved_days = calculated_days + travelling_days_added`

This removes any dependence on potentially hardcoded `adjusted_days` field.

### 3. Added Calculated Days Field
Added `calculated_days` to the staff object for transparency:
- Shows the days calculated from actual dates
- Used for audit trail and verification

### 4. Comprehensive Logging
Added validation logging that shows:
- Staff member name
- Leave period (start to end dates)
- Calculated days
- Travelling days
- Total approved days
- Source verification (confirms using database dates, not hardcoded values)

## Files Modified

- `/app/api/leave/payment-advice/detect-staff/route.ts`
  - Added `calculateLeaveDays()` function
  - Updated `approved_days` calculation to use actual dates
  - Added `calculated_days` field to staff object
  - Added comprehensive logging for verification

## Impact

### What Changed
- Memos now show accurate leave duration based on actual dates
- No more hardcoded "26 + 2" values
- All calculations come from the database source of truth (preferred_start_date, preferred_end_date)

### What Stayed the Same
- Travelling days are still added separately (configured in database)
- Reference numbers, rank, and other memo fields unchanged
- Approval workflow and HR Executive submission process unchanged

## Verification

To verify the fix is working:

1. Generate a payment advice memo
2. Check the console logs showing calculated days
3. In the generated memo, verify:
   - "Number of Days Entitled" matches calculation from dates
   - "Number of Days Granted" includes travelling days
   - Date range shows actual leave period

Example of correct calculation:
- Start: 28 Jul 2026
- End: 02 Sep 2026
- Calculated Days: 37 (not hardcoded 26)
- Plus Travelling Days: 2
- **Total Approved Days: 39**

## Testing Checklist

- [ ] Generate memo for leave request with specific date range
- [ ] Verify calculated days match date range (can count manually)
- [ ] Check that travelling days are correctly added
- [ ] Confirm memo displays accurate total
- [ ] Review console logs for source verification
- [ ] Test with multiple staff members (different date ranges)
- [ ] Verify no hardcoded "26" or similar values appear

## Future Improvements

1. Consider rounding up/down rules for partial days
2. Add option to exclude weekends if needed
3. Add holiday exclusion logic if calendar holidays should be excluded
