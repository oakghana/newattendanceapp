# Payment Advice Duplicate Prevention

## Overview

This document describes the duplicate prevention mechanism implemented to ensure that leave requests with already-approved payment advice memos are not shown when HR Leave Office staff searches for new leave requests to create payment advice.

## Problem Addressed

Previously, when HR Leave Office staff accessed the payment advice section and selected a month to generate payment memos, the system would:
1. Show ALL approved leave requests for that month
2. Allow creation of new payment memos for requests that already had payment advice generated
3. Result in duplicate payment memos in the database for the same leave request
4. Cause confusion for Finance department with multiple memos to process

## Solution Implemented

A filtering mechanism has been added to the `/api/leave/payment-advice/detect-staff` endpoint that:

1. **Queries approved payment memos** - Checks the `leave_payment_memos` table for approved entries
2. **Identifies already-covered requests** - Cross-references leave request IDs with existing payment memos
3. **Filters them out** - Removes these requests from the search results
4. **Prevents duplication** - Only shows leave requests that don't have approved payment advice yet

## Technical Details

### Modified Endpoint

**File**: `/app/api/leave/payment-advice/detect-staff/route.ts`

### Filtering Logic

```typescript
// Step 1: Get all leave request IDs to check
const leaveRequestIds = (staffOnLeave || []).map((r: any) => r.id).filter(Boolean)

// Step 2: Query for existing approved payment memos
const { data: existingMemos } = await supabase
  .from("leave_payment_memos")
  .select("leave_plan_request_id")
  .in("leave_plan_request_id", leaveRequestIds)
  .eq("status", "approved")  // Only approved memos count as "already processed"

// Step 3: Extract the request IDs that have payment memos
const requestsWithPaymentMemos = existingMemos.map(m => m.leave_plan_request_id)

// Step 4: Filter out these requests from the result
const staffOnLeaveFiltered = staffOnLeave.filter(record =>
  !requestsWithPaymentMemos.includes(record.id)
)
```

## What Gets Filtered

- Leave requests that have **approved payment advice memos** are excluded
- Requests with **pending or rejected** payment memos are NOT filtered (can be retried)
- Requests with **no payment memo** yet are included (normal case)

## Database Tables Involved

1. **`leave_plan_requests`** - Source table for leave requests
2. **`leave_payment_memos`** - Destination table checked for duplicates
3. Only records with `status = "approved"` in `leave_payment_memos` trigger filtering

## Logging

The implementation includes detailed logging:

```
[v0] Found existing approved payment memos for requests: [request-id-1, request-id-2, ...]
[v0] Filtered out N leave requests that already have approved payment memos
```

These logs appear in console/server logs and help administrators track:
- Which requests were excluded
- How many duplicates were prevented in this session

## User Experience

### Before the Fix
1. HR Leave Office searches for payment advice entries for June 2025
2. All 50 approved leave requests for June appear
3. Staff member accidentally selects all and generates payment memos
4. System creates 50 new memos including duplicates for requests that already had payment advice
5. Finance department receives multiple memos for same staff member

### After the Fix
1. HR Leave Office searches for payment advice entries for June 2025
2. Only 35 approved leave requests appear (15 already have approved payment memos)
3. Staff member can only create payment memos for the 35 new requests
4. No duplicates are possible
5. Finance department receives clean, single memos for each staff member

## Implementation Notes

- **Non-breaking change**: Existing payment advice functionality remains unchanged
- **Idempotent**: Can be called multiple times safely
- **Error-tolerant**: If the check fails, a warning is logged but search continues
- **Performance**: Uses a single query to check all affected records at once

## Verification

To verify the duplicate prevention is working:

1. **Check logs** when generating payment advice:
   ```
   [v0] Filtered out X leave requests that already have approved payment memos
   ```

2. **Count results** before and after:
   - First time: All approved leave requests shown
   - Second time for same month: Fewer results (excluding already-processed requests)

3. **Database verification**:
   ```sql
   SELECT leave_plan_request_id, COUNT(*) as memo_count
   FROM leave_payment_memos
   WHERE status = 'approved'
   GROUP BY leave_plan_request_id
   HAVING COUNT(*) > 1;  -- Should return empty (no duplicates)
   ```

## Edge Cases Handled

1. **New leave requests added after first generation**: Will appear in results on second search
2. **Payment memos moved to rejected status**: Request will reappear in search results
3. **Admin manual deletion of memo**: Request will reappear in search results
4. **Multiple payment memos from different months**: Only "approved" ones block the request

## Future Enhancements

Potential improvements:
- Add UI indicator showing "Memo already generated" in search results
- Allow HR Leave Office to view/resend existing memos for a request
- Implement memo regeneration with updated leave details if needed
- Add audit trail of why requests were filtered

## Troubleshooting

**Q: A leave request I expect to see is missing from the search**
A: Check if an approved payment memo exists for it:
```sql
SELECT * FROM leave_payment_memos 
WHERE leave_plan_request_id = 'request-id' 
AND status = 'approved'
```

**Q: I need to regenerate a memo for a leave request**
A: Currently requires admin intervention to either:
1. Delete the existing approved memo (will reappear in search)
2. Or manually reprocess from approved-memos view

**Q: The filtering isn't working**
A: Check server logs for errors in the detect-staff endpoint. Ensure:
1. `SUPABASE_SERVICE_ROLE_KEY` is set
2. Database connectivity is normal
3. `leave_payment_memos` table has the expected data

## Related Documentation

- [Payment Advice Generation Flow](./PAYMENT_ADVICE_GENERATION.md)
- [Leave Payment Memos Schema](../SCHEMA.md#leave_payment_memos)
- [Detecting Staff for Payment Advice](./DETECT_STAFF_API.md)
