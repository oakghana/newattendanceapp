# Memo Signature Status Fix

## Problem Corrected

**Anomaly:** Memos in the "Approved Memos" tab showed "Yet to Sign" status even though they had download buttons and were fully approved with HR signatures.

## Root Cause

The status detection logic was checking only for `memo.approver_signature` or `memo.approval_date` fields, but:
1. These fields weren't being populated in all cases
2. The API wasn't including the HR signature field (`hr_signature_image_url`) in the response
3. The presence of a downloadable memo (`memo_url`) wasn't being considered as proof of approval

## Solution Implemented

### 1. **Updated Status Detection Logic**
- Modified the memo status determination to check for **downloadable memo existence** as primary indicator
- Added logic: `const isSigned = memo.memo_url || memo.approver_signature || memo.approval_date || memo.hr_signature_image_url`
- Now correctly shows "✓ Signed" badge when ANY of these conditions are true

### 2. **Fixed API Response Mapping**
- **HR Executive memos:** Added `hr_signature_image_url` to response payload
- **HOD/RM staff memos:** Added both `hr_signature_image_url` and `hr_approved_at` fields
- Both now properly return the signature evidence needed for status display

### 3. **Database Query Filtering**
- Both API endpoints already filter for `not("hr_signature_image_url", "is", null)`
- This ensures only truly signed memos are returned

## Result

✅ **Memos with download buttons now correctly display "✓ Signed" status**
✅ **Deferment and Recall tabs now populate with truly approved leave data**
✅ **No more "Yet to Sign" inconsistency for approved and signed memos**

## Files Modified
- `/app/dashboard/leave-management/leave-management-client.tsx` - Status detection logic
- `/app/api/leave/staff-approved-memos/route.ts` - API response payloads
