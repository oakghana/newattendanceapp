# Payment Advice Duplicate Prevention - Quick Reference

## What Changed?

When HR Leave Office staff searches for leave requests to create payment advice, **leave requests that already have approved payment memos no longer appear** in the search results.

## Why?

To prevent accidental creation of duplicate payment memos for the same leave request, which would confuse the Finance department.

## How It Works

1. HR Leave Office selects a month → "Select Month & Signer for Payment Advice"
2. System queries `/api/leave/payment-advice/detect-staff` 
3. Endpoint checks: "Which approved leave requests don't have approved payment memos yet?"
4. Only those requests appear in the list
5. No duplicates possible

## What Gets Filtered?

✅ **FILTERED OUT** (won't appear):
- Leave requests with an **approved** payment memo

✅ **STILL VISIBLE** (can generate memo):
- Leave requests with **no** payment memo
- Leave requests with **pending** or **rejected** payment memo
- New leave requests just approved

## Database Check

```sql
-- See which leave requests have approved payment memos
SELECT leave_plan_request_id, COUNT(*) as memo_count
FROM leave_payment_memos
WHERE status = 'approved'
GROUP BY leave_plan_request_id;

-- Verify no duplicates (should be empty)
SELECT leave_plan_request_id
FROM leave_payment_memos
WHERE status = 'approved'
GROUP BY leave_plan_request_id
HAVING COUNT(*) > 1;
```

## Console Logs

When searching, watch for:
```
[v0] Found existing approved payment memos for requests: [id1, id2, ...]
[v0] Filtered out X leave requests that already have approved payment memos
```

## Manual Override Needed?

If you need to regenerate a memo for an already-covered request:

1. **Option A**: Delete the existing memo from database (risky)
2. **Option B**: Admin manually processes from approved-memos view
3. **Option C**: Contact administrator for memo regeneration

## API Details

**Endpoint**: `POST /api/leave/payment-advice/detect-staff`

**Request**:
```json
{ "month": "2025-06" }
```

**Response**:
```json
{
  "success": true,
  "staff": [...],  // Only includes requests without approved payment memos
  "count": 35      // Fewer than total approved leaves
}
```

## Files Modified

- `/app/api/leave/payment-advice/detect-staff/route.ts` - Added duplicate filtering

## Testing

**Scenario 1: First payment advice generation**
- Generate payment advice for June 2025
- All approved June leaves appear
- System creates memos

**Scenario 2: Second generation attempt (same month)**
- Search again for June 2025
- Same requests don't appear (already have approved memos)
- Only NEW leaves or those with failed memos appear

## Common Questions

**Q: Why did my search result count go down?**
A: Some requests now have approved payment memos. That's working as intended.

**Q: Can I create another memo for the same leave?**
A: No, the duplicate prevention blocks it. Delete the old memo first if needed.

**Q: Will new leaves added after the first memo generation appear?**
A: Yes, they'll appear automatically when searching again.

**Q: What if a memo is rejected?**
A: Rejected memos don't block requests—they'll still appear in search results.

## Rollback (if needed)

To disable duplicate prevention:
1. Remove the filtering logic from `/app/api/leave/payment-advice/detect-staff/route.ts` (lines 120-149)
2. Redeploy

(Not recommended—duplicates would resume)

## Need Help?

- Check server logs for filtering activity
- Verify `leave_payment_memos` table has expected data
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set
- Review full documentation: `PAYMENT_ADVICE_DUPLICATE_PREVENTION.md`
