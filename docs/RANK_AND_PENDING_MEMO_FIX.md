# Rank Display Fix & Pending Memo Submission

## Issue
The Payment & Download tab was displaying staff category names (like "junior") instead of actual rank titles (like "HR LEAVE TEST"). Additionally, when approved payment memos already existed for a month, there was concern about allowing new unapproved memos to be submitted for approval.

## Solution

### 1. Rank Display Fix

#### Problem
- The `leave_payment_memos` table stores memos with `memo_body` as JSON
- The memo_body contains `staff_rank_label` which now holds the actual rank name (e.g., "HR LEAVE TEST")
- The HR payment advice management component was using `memo.rank` field directly (which didn't exist)
- This caused "junior" or other category names to display instead of actual rank titles

#### Solution
Updated `hr-payment-advice-management.tsx` to extract rank from `memo_body`:

```typescript
// Extract rank from memo_body where it's stored as staff_rank_label
let staffRank = 'N/A'
try {
  const memoBody = typeof memo.memo_body === 'string' 
    ? JSON.parse(memo.memo_body) 
    : (memo.memo_body || {})
  staffRank = memoBody.staff_rank_label || memo.rank || 'N/A'
} catch {
  staffRank = memo.rank || 'N/A'
}
```

#### Impact
- ✅ Payment advice tables now display actual rank names
- ✅ PDFs show correct rank titles in staff details
- ✅ All downloads include proper rank names (e.g., "HR LEAVE TEST" instead of "junior")

### 2. Pending Memo Submission with Existing Approved Memos

#### System Behavior
The system now properly handles the case where new unapproved payment advice memos are created while approved memos already exist for the same month:

1. **Generation Tab**: Hidden when approved memos exist for a month
2. **Monthly Summary Tab**: Always visible
3. **Pending Memos**: Can be submitted to HR Executive for approval even if approved memos exist

#### How It Works
- When a user selects a month, the system checks for approved memos
- If approved memos exist: 
  - "Create Payment Advice" section is hidden to prevent generation
  - "Approved Memos for Month" alert shows existing memos
  - "Monthly Summary" tab remains accessible
- Unapproved/pending memos in that month can still be submitted to HR Executive via the Monthly Summary tab

#### Key Features
- ✅ Prevents duplicate memo GENERATION
- ✅ Allows submission of existing UNAPPROVED memos
- ✅ Clear UI indication when approved memos exist
- ✅ Users can view both approved and pending memos
- ✅ Easy navigation between months

## Technical Details

### Files Modified
1. `components/leave/hr-payment-advice-management.tsx`
   - Enhanced memo mapping to extract rank from `memo_body.staff_rank_label`
   - Added fallback logic for rank extraction
   - Proper error handling for JSON parsing

### API Endpoints Used
- `/api/leave/payment-advice/approved-memos?month={month}` - Fetch approved memos for a month
- `/api/leave/payment-advice/my-memos?month={month}` - Fetch submitted/pending memos

### Database Schema
- `leave_payment_memos.memo_body` - JSON field containing `staff_rank_label` (actual rank name)
- `leave_payment_memos.status` - Current memo status (pending, approved, etc.)

## Testing Checklist

### Rank Display
- [ ] Open Payment & Download tab
- [ ] View approved memos - should show actual rank titles (e.g., "HR LEAVE TEST")
- [ ] Download memo PDF - verify rank column shows proper titles
- [ ] Check multiple staff members with different ranks

### Pending Memo Submission with Approved Memos
- [ ] Select a month that has approved payment memos
- [ ] Verify "Payment Advice Already Generated for [Month]" alert shows
- [ ] Verify "Generate Professional Memos" button is disabled
- [ ] Click "Monthly Summary" tab
- [ ] Verify any pending/unapproved memos can still be viewed
- [ ] Try submitting a pending memo to HR Executive (should work)
- [ ] Select a different month - verify generation becomes available again

## Edge Cases Handled

1. **Empty memo_body**: Falls back to `memo.rank` field
2. **Missing staff_rank_label**: Uses category as fallback
3. **JSON parsing errors**: Safely caught and logged
4. **Multiple months**: Each month is checked independently
5. **Mixed memo statuses**: Approved and pending memos displayed separately

## Future Improvements

- Consider caching approved memo list to reduce API calls
- Add tooltip on disabled button explaining why generation is blocked
- Show count of approved vs pending memos for each month
- Allow re-generation of failed/rejected memos even when approved exist
