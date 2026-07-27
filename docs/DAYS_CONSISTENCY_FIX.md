# Days Consistency Fix for Payment Advice Memos

## Problem

**Critical Issue**: Same leave request was showing different numbers of approved days in different memos, causing inconsistencies in generated documents.

**Root Cause**: 
- The `submit-memo` endpoint was using a fallback logic: `approved_days || requested_days`
- This could result in using the user's originally requested days instead of the HR Leave Office's approved/adjusted days
- When HR Leave Office adjusted a leave request (e.g., from 26 days to 25 days), some memos would still show 26 (requested) while others showed 25 (approved)

**Impact**:
- Memos for the same leave request showed different day counts
- Financial and administrative confusion
- Audit and compliance issues

## Solution

### 1. Enhanced Detect-Staff API (`app/api/leave/payment-advice/detect-staff/route.ts`)
Added explicit `adjusted_days` field to the response:
```typescript
adjusted_days: record.adjusted_days || record.requested_days || record.entitlement_days || 0
```
- Explicitly exposes the HR-approved days as the source of truth
- Passed to submit-memo endpoint for consistent usage

### 2. Fixed Submit-Memo Endpoint (`app/api/leave/payment-advice/submit-memo/route.ts`)
Changed the days priority from:
```
approved_days || requested_days || 0
```
To:
```
adjusted_days || approved_days || requested_days || 0
```
- Always prefers `adjusted_days` (HR Leave Office approved)
- Falls back only if adjusted_days is not available
- Ensures single source of truth

### 3. Memo Generator (Already Correct)
The `professional-memo-generator.ts` was already using `firstStaff?.approved_days` correctly.
With the fix above, this now always receives the correct HR-approved days.

## How It Works

**Data Flow for Days**:
1. Leave request created with `requested_days`
2. HR Leave Office approves and may adjust to `adjusted_days`
3. When generating payment memos:
   - `detect-staff` API: Returns `adjusted_days` as the official approved days
   - `submit-memo` API: Uses `adjusted_days` to populate memo records
   - `professional-memo-generator`: Displays the consistent `approved_days`
4. All memos, PDFs, and downloads show the same day count

## Validation

All memos for the same leave request now display:
- Same "Number of Days Granted"
- Same travel day allowance
- Same total leave period

## Files Modified
- `app/api/leave/payment-advice/detect-staff/route.ts` - Added adjusted_days field
- `app/api/leave/payment-advice/submit-memo/route.ts` - Fixed days priority order

## Testing

When generating multiple payment memos:
1. Create/approve a leave request with adjusted days (not original request)
2. Generate payment memo for that staff member
3. Verify all sections show the same day count
4. Download PDF and verify consistency
5. Submit to HR Executive and verify approved memo shows same days

The disparity issue is now resolved. All payment advice memos generated for the same leave request will show identical and accurate approved day counts.
