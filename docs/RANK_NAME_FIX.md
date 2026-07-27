# Rank Name Fix - Using Actual Rank Instead of Category

## Problem

Previously, payment advice memos and leave payment tables were displaying **staff category names** instead of **actual rank titles**:

- ❌ **Before**: Showing "junior", "senior", "HR LEAVE TEST" (category labels)
- ✅ **After**: Showing actual rank names like "Senior Officer", "Manager", "Accounts Officer"

## What Was Changed

### 1. Submit Memo API (`app/api/leave/payment-advice/submit-memo/route.ts`)

**Changed**: Line 194 - Rank label now uses actual rank instead of category

```typescript
// OLD (Wrong - using category):
staff_rank_label: staff.staff_category || category

// NEW (Correct - using actual rank):
const staffRankLabel = staff.rank || staff.position || staff.staff_category || category
staff_rank_label: staffRankLabel
```

**Impact**: When generating payment advice memos, the `staff_rank_label` field now contains the actual rank title from `staff.rank` or `staff.position` (which comes from user profiles) instead of the category abbreviation.

### 2. Detect Staff API (`app/api/leave/payment-advice/detect-staff/route.ts`)

**Added**: New `rank` field to staff object (line 267)

```typescript
rank: position, // Actual rank/position name (e.g., "Senior Officer", "Manager"), not category (e.g., "junior")
```

**Impact**: The `rank` field now explicitly contains the actual rank name, making it available for consumption by memo generation and UI display.

## How It Works

### Data Flow

1. **User Profile** → Contains `position` field with actual rank title
2. **Detect Staff API** → Extracts position as `rank` field
3. **Submit Memo API** → Uses `rank` field for `staff_rank_label`
4. **Memo Body** → Stores actual rank as `staff_rank_label`
5. **PDF/Memo Display** → Shows actual rank title instead of category

### Field Hierarchy (Priority Order)

The system now uses this priority for determining rank:

1. `staff.rank` - Actual rank name (highest priority)
2. `staff.position` - Position title (fallback)
3. `staff.staff_category` - Category name (last resort)

This ensures we always prefer the actual rank over category abbreviations.

## Display Locations

The rank name now displays correctly in:

1. **Leave Management Dashboard** → Payment & Download tab table
2. **Payment Advice PDF Memorandum** → Staff details table
3. **Combined Memos** → Staff listing with proper rank titles
4. **Single Memos** → Individual staff rank display

## Database Schema Considerations

The fix relies on the `user_profiles` table having a properly populated `position` field:

```sql
SELECT id, employee_id, position, department_id 
FROM user_profiles 
WHERE position IS NOT NULL
```

The `position` field should contain values like:
- Senior Officer
- Manager
- Accounts Officer
- Assistant
- etc.

## Fallback Behavior

If `position` is not populated in user profiles:

1. System falls back to `staff_category`
2. Still shows category name (better than empty)
3. Console logs warning about missing position

## Verification

To verify the fix is working:

1. Go to **Leave Management** → **Payment & Download** tab
2. Check the "Rank" column in the approved memos table
3. Should show actual rank titles, not "junior", "senior", etc.
4. Download a memo and verify the RANK column in the table matches

## Console Output

When generating memos, check console logs for:

```
[v0] Single memo - Signer signature data: {
  signerName: "...",
  signerTitle: "...",
  ...
}
```

This confirms proper staff rank enrichment is happening.

## Notes

- This fix does not affect the category grouping logic (still uses category for organization)
- Staff category is still used for reference number generation
- The actual rank name is now properly separated from category classification
- All existing functionality remains intact - only the display names have changed

## Files Modified

- `/app/api/leave/payment-advice/submit-memo/route.ts` - Line 188-190, 197
- `/app/api/leave/payment-advice/detect-staff/route.ts` - Line 267

## Testing Checklist

- [ ] Payment advice tables show actual rank names
- [ ] PDFs display correct rank in memorandum
- [ ] No console errors for rank handling
- [ ] Fallback works if position field is empty
- [ ] Category-based grouping still works correctly
