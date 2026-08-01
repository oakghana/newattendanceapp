# HOD Delink & Request Lock Integration Guide

## Overview

This guide explains how to integrate:
1. **HOD Delink Feature** - Admin ability to remove HOD linkages from staff
2. **Request Lock Indicator** - Visual component showing lock status to HODs

## Part 1: HOD Delink Feature Integration

### In Staff Management Portal

The `ManageHODLinkagesModal` component replaces the current link-only modal with add/remove capabilities.

**Current Code (Line 1434-1528 in staff-management.tsx):**
```tsx
{/* HOD Linkage Dialog */}
<Dialog open={!!hodLinkStaff} onOpenChange={(open) => {
  if (!open) {
    setHodLinkStaff(null)
    setHodSearchQuery("")
    setHodLinkHodIds([])
    setHodLinkError(null)
  }
}}>
  {/* ... current modal code ... */}
</Dialog>
```

**Replace With:**
```tsx
{/* HOD Linkage Management Dialog */}
<ManageHODLinkagesModal
  open={!!hodLinkStaff}
  onOpenChange={(open) => {
    if (!open) {
      setHodLinkStaff(null)
      setHodSearchQuery("")
      setHodLinkHodIds([])
      setHodLinkError(null)
    }
  }}
  staffMember={hodLinkStaff}
  currentLinks={(hodLinkStaff as any)?.hod_links || []}
  availableHODs={hodCandidates}
  onAddLink={async (hodId: string) => {
    await fetch('/api/admin/link-hod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_hod_linkage_batch',
        staff_user_id: hodLinkStaff?.id,
        hod_user_ids: [hodId],
      }),
    })
  }}
  onRemoveLink={async (hodId: string) => {
    const res = await fetch('/api/admin/delink-hod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_user_id: hodLinkStaff?.id,
        hod_user_id: hodId,
      }),
    })
    if (!res.ok) throw new Error('Failed to delink HOD')
  }}
  loading={hodLinkLoading}
/>
```

### Import the Component

Add to top of `staff-management.tsx`:
```tsx
import { ManageHODLinkagesModal } from './manage-hod-linkages-modal'
```

### API Endpoint

The delink endpoint is available at `/api/admin/delink-hod` with:

**POST Body:**
```json
{
  "staff_user_id": "uuid",
  "hod_user_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "HOD successfully delinked from staff",
  "withdrawnLoans": 5,
  "remainingHods": 2
}
```

**What it does:**
1. Removes HOD linkage from `loan_hod_linkages` table
2. Withdraws all pending requests from that HOD
3. Broadcasts remaining requests to other linked HODs
4. Logs timeline entries for audit trail

## Part 2: Request Lock Indicator Integration

### In HOD Review Pages (loan-app/page.tsx)

#### 1. Import the Component

Add to imports:
```tsx
import { RequestLockIndicator } from '@/components/loan/request-lock-indicator'
```

#### 2. Import Lock API Call

Add helper function:
```tsx
const handleLockRequest = async (loanRequestId: string, action: 'lock' | 'unlock') => {
  try {
    const method = action === 'lock' ? 'POST' : 'DELETE'
    const res = await fetch('/api/loan/lock-request', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loan_request_id: loanRequestId }),
    })
    if (!res.ok) throw new Error(`Failed to ${action} request`)
    await loadData() // Refresh data
    if (action === 'lock') {
      showSuccess('Request locked. You now have exclusive access to edit.')
    }
  } catch (error) {
    showError(`Failed to ${action} request: ${error}`)
  }
}
```

#### 3. Add Lock Indicator to HOD Review Modal

When showing HOD review request details, add above the form:

```tsx
{/* Add this before the form starts */}
{actionType === 'hod_review' && (
  <RequestLockIndicator
    requestId={selectedRequest?.id}
    currentUserId={data?.profile?.id}
    lockedBy={selectedRequest?.hod_reviewer_id}
    linkedHods={selectedRequest?.hod_links || []} // Array of linked HOD names
    onLock={() => handleLockRequest(selectedRequest?.id, 'lock')}
    onUnlock={() => handleLockRequest(selectedRequest?.id, 'unlock')}
  />
)}
```

#### 4. Auto-Lock on Form Open

When HOD opens the review form, auto-lock it:

```tsx
useEffect(() => {
  if (actionType === 'hod_review' && selectedRequest?.id) {
    handleLockRequest(selectedRequest.id, 'lock')
  }
  return () => {
    // Auto-unlock when unmounting the form
    if (actionType === 'hod_review' && selectedRequest?.id) {
      handleLockRequest(selectedRequest.id, 'unlock')
    }
  }
}, [actionType, selectedRequest?.id])
```

#### 5. Prevent Edits if Locked by Other HOD

Add validation before allowing form submission:

```tsx
const canSubmitForm = () => {
  if (selectedRequest?.hod_reviewer_id && selectedRequest.hod_reviewer_id !== data?.profile?.id) {
    showError('This request is locked by another HOD. You cannot make changes.')
    return false
  }
  return true
}
```

### For Leave Requests (leave-app/page.tsx)

Same integration applies for leave request HOD reviews using:
- `leave_plan_requests` table instead of `loan_requests`
- Same `/api/loan/lock-request` endpoint (handles both loan and leave)

## API Details

### Lock Request Endpoint

**POST /api/loan/lock-request**
```json
{
  "loan_request_id": "uuid"
}
```

Response on success:
```json
{
  "success": true,
  "locked": true,
  "locked_by": "current-user-id",
  "message": "Request locked"
}
```

Response if already locked by another HOD:
```json
{
  "success": false,
  "locked": true,
  "locked_by": "other-hod-id",
  "locked_by_name": "John Doe",
  "message": "Request is locked by another HOD"
}
```

**DELETE /api/loan/lock-request**
- Same URL structure, removes lock

## Database Tables Used

### loan_hod_linkages
- `staff_user_id` - Staff member
- `hod_user_id` - Linked HOD
- When HOD is delinked: row is deleted
- All requests reassigned to remaining HODs

### loan_requests / leave_plan_requests  
- `hod_reviewer_id` - Current lock holder (when set to HOD ID)
- `status` - Request status (e.g., 'pending_hod')
- When locked: `hod_reviewer_id` = current user ID (prevents others from editing)
- When HOD delinked: all their pending requests reassigned to remaining HODs

### loan_request_timeline
- Logs all lock/unlock events and HOD delink actions

## Testing Scenarios

### Scenario 1: Basic Delink
1. Admin views HRLEAVE TEST NAME with 2 linked HODs
2. Admin opens "Manage HOD Linkages"
3. Admin clicks "Remove" on one HOD
4. System:
   - Removes the linkage
   - Withdraws pending requests from that HOD
   - Broadcasts to remaining HODs
   - ✓ Remaining HOD sees the requests again

### Scenario 2: Lock Mechanism
1. Two HODs (OHENEBA and KWAKU) both see request
2. OHENEBA clicks "Review" button
3. System auto-locks to OHENEBA
4. KWAKU's view shows: "Locked by OHENEBA BOAMAH"
5. KWAKU cannot edit
6. OHENEBA completes review → lock releases
7. Request moves to next stage

### Scenario 3: Multi-HOD Broadcast
1. Staff with 3 linked HODs submits loan request
2. All 3 HODs see it in their "pending_hod" tab
3. Any one can work on it (first to open gets lock)
4. Others see lock indicator until first finishes

## Files Provided

1. **API Endpoints:**
   - `/app/api/admin/delink-hod/route.ts` - HOD delink logic
   - `/app/api/loan/lock-request/route.ts` - Already exists (for locking)
   - `/app/api/loan/hod-linkages/route.ts` - Already exists (for lock status)

2. **Components:**
   - `/components/admin/manage-hod-linkages-modal.tsx` - Add/remove HOD UI
   - `/components/loan/request-lock-indicator.tsx` - Already exists (shows lock status)

3. **Documentation:**
   - `/docs/MULTI-HOD-SYSTEM.md` - Complete system architecture
   - `/docs/MULTI-HOD-TESTING.md` - QA testing guide
   - `/docs/HOD-DELINK-AND-LOCK-INTEGRATION.md` - This file

## Common Issues & Fixes

### Issue: "RequestLockIndicator component not found"
**Fix:** Verify `/components/loan/request-lock-indicator.tsx` exists and import path is correct

### Issue: Delink doesn't remove requests from other HODs' tabs
**Fix:** Ensure `loadData()` or equivalent refresh is called after API response

### Issue: Both HODs can edit same request
**Fix:** Check `hod_reviewer_id` before allowing form submit. It should block non-lock-holder HODs.

### Issue: Lock indicator shows wrong HOD name
**Fix:** Verify `loan_hod_linkages` contains correct `hod_user_id` values and profile names are correctly fetched

## Deployment Checklist

- [ ] API endpoint `/api/admin/delink-hod` is running
- [ ] `ManageHODLinkagesModal` component imported in `staff-management.tsx`
- [ ] HOD Linkage Dialog replaced with new modal
- [ ] `RequestLockIndicator` imported in loan review pages
- [ ] Lock indicator displayed above HOD review forms
- [ ] Auto-lock implemented when HOD opens form
- [ ] Form disabled when locked by other HOD
- [ ] Same applied to leave request pages
- [ ] Database tables have required columns
- [ ] Testing scenarios pass QA checklist

## Support

For questions or issues:
1. Check MULTI-HOD-SYSTEM.md for architecture
2. Check MULTI-HOD-TESTING.md for debugging
3. Review console logs with `[v0]` prefix for detailed errors
