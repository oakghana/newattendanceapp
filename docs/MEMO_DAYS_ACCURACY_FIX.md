# Memo Days Accuracy Fix

## Problem
The payment advice memos were showing hardcoded/incorrect number of days instead of calculating actual days between FROM and TO dates.

**Example Issue:**
- Leave from: 28 July 2026
- Leave to: 2 September 2026
- **Actual days**: 37 (4 days in July + 31 days in August + 2 days in September)
- **Incorrect memo showed**: 28 days (hardcoded from database)

## Root Cause Analysis
The issue was in the priority order when selecting approved_days:
1. `submit-memo` endpoint was checking `staff.adjusted_days` FIRST (hardcoded database value)
2. This prevented using `staff.approved_days` which contains the calculated days from actual dates
3. The fallback chain `adjusted_days || approved_days` ensured hardcoded values were always used

## Solution Implemented

### 1. **Added Date-Based Day Calculator** (`detect-staff` endpoint)
```typescript
const calculateLeaveDays = (startDate: string | Date, endDate: string | Date): number => {
  // Calculates actual calendar days between dates inclusively
  // Returns 0 for invalid dates with logging
}
```

### 2. **Changed Days Calculation Priority** (`detect-staff` endpoint)
```typescript
// OLD: Uses hardcoded adjusted_days first
approved_days: (adjusted_days || requested_days || 0)

// NEW: Uses calculated days from actual dates
approved_days: (calculateLeaveDays(preferred_start_date, preferred_end_date) + travelling_days)
```

### 3. **Fixed Memo Submission Priority** (`submit-memo` endpoint)
```typescript
// OLD: Prioritized hardcoded values
const approvedDaysForMemo = staff.adjusted_days || staff.approved_days || 0

// NEW: Uses calculated days first
const approvedDaysForMemo = staff.approved_days || staff.requested_days || 0
```

### 4. **Added Days Data to Memo Body**
```typescript
memoBody.approved_days = approvedDaysForMemo // Set after calculation
memoBody.travelling_days_added = staff.travelling_days_added || 0
memoBody.calculated_days = staff.calculated_days || 0
```

## Verification
The fix ensures:
- All memos calculate days from database `preferred_start_date` and `preferred_end_date`
- No hardcoded values are used in memo generation
- Console logs verify the source of each calculation
- Accurate narrative in leave advice memos

## Example Result
**After Fix:**
- Leave from: 28 July 2026 to 2 September 2026
- Days calculated: 37 (using calculateLeaveDays function)
- Plus travelling days: 2
- **Correct memo shows**: 37 + 2 = 39 days total (instead of false 28 days)

## Files Modified
1. `/vercel/share/v0-project/app/api/leave/payment-advice/detect-staff/route.ts`
   - Added `calculateLeaveDays()` function
   - Changed `approved_days` calculation to use date-based logic
   - Added comprehensive logging

2. `/vercel/share/v0-project/app/api/leave/payment-advice/submit-memo/route.ts`
   - Fixed priority order to use `approved_days` (calculated) not `adjusted_days` (hardcoded)
   - Added `approved_days` and `travelling_days_added` to `memoBody`
   - Added verification logging

## Testing
- Verify that generate memos now show accurate day counts matching FROM and TO dates
- Check console logs confirm date-based calculations
- Validate memos for multiple leave periods show correct day narratives
