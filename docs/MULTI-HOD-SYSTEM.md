# Multi-HOD Broadcast & Request Locking System

## Overview

When a staff member is linked to multiple HODs (Heads of Department/Supervisors), the system now **broadcasts loan and leave requests to ALL linked HODs instantly**. A **request locking mechanism** prevents concurrent edits by ensuring only one HOD can work on a request at a time.

## The Problem (Before)

When staff like "HRLEAVE TEST NAME" were linked to multiple HODs:
- ❌ Only the PRIMARY HOD saw the request
- ❌ Other linked HODs were unaware of requests from that staff
- ❌ Multiple HODs could edit the same request simultaneously (data conflicts)
- ❌ No way to track who was working on what

## The Solution (After)

### 1. Multi-HOD Broadcast

**When staff submits a loan or leave request:**
- ✅ Request appears on **ALL linked HOD tabs** immediately
- ✅ Each HOD gets the same request in their "pending_hod" queue
- ✅ All linked HODs can see it and work on it

**Example Flow:**
```
HRLEAVE TEST NAME submits loan request
                    ↓
          [Checks loan_hod_linkages]
                    ↓
      Finds 2 linked HODs:
      - OHENEBA BOAMAH
      - KWAKU APPIAH GHEMENG
                    ↓
    Request broadcasts to BOTH HODs
                    ↓
    [HOD1 Tab]          [HOD2 Tab]
   ✓ Sees request      ✓ Sees request
    Any can start work
```

### 2. Request Locking Mechanism

**When First HOD Opens Request:**
```
HOD1 clicks on request to review
           ↓
  System locks request to HOD1
  (hod_reviewer_id = HOD1's ID)
           ↓
  HOD1 can freely edit/approve/reject
           ↓
    HOD2 tries to work on same request
           ↓
    Alert: "Locked by OHENEBA BOAMAH"
    Cannot edit until lock is released
```

**Lock Release Scenarios:**
1. **HOD completes action** - Request moves to next stage (lock auto-released)
2. **HOD cancels work** - Explicitly releases lock via "Release Lock" button
3. **Timeout** - System can auto-release stale locks (future feature)

### 3. Visual Indicators for HODs

HODs see different states:

#### Request Available (Unlocked)
```
🔓 This request is available to edit (2 HODs linked to this staff)
[Lock for Editing] button
```
HOD can click "Lock for Editing" to take ownership.

#### Locked by Current HOD
```
🔒 You have locked this request
Other HODs cannot edit it now.
```
Shows that this HOD has exclusive access.

#### Locked by Another HOD
```
⚠️ Locked by OHENEBA BOAMAH
This request is currently being processed by OHENEBA BOAMAH.
You cannot edit it right now.

Other linked HODs for this staff:
[OHENEBA BOAMAH (Processing)]  [KWAKU APPIAH GHEMENG]
```
HOD must wait or contact the other HOD.

## Database Schema Changes

### No Breaking Changes!
The system works with existing tables:
- `loan_hod_linkages` - Already existed, stores staff-HOD relationships
- `loan_requests` - Uses existing `hod_reviewer_id` field for lock
- `leave_plan_requests` - Uses existing `hod_reviewer_id` field for lock

**Key Realization:**
- `hod_reviewer_id` field serves dual purpose:
  1. **Owner** = Who started work on this request
  2. **Lock** = Who can currently edit it

## API Endpoints

### 1. Get HOD Linkages & Lock Status
```
GET /api/loan/hod-linkages?staffId=<id>&requestId=<id>&requestType=loan
```

**Response:**
```json
{
  "staff_id": "xyz",
  "linked_hods_count": 2,
  "linked_hods": [
    {
      "id": "hod1",
      "name": "OHENEBA BOAMAH",
      "position": "Director HR",
      "email": "obeneba@qccgh.com"
    },
    {
      "id": "hod2",
      "name": "KWAKU APPIAH GHEMENG",
      "position": "Manager HR",
      "email": "kwaku@qccgh.com"
    }
  ],
  "lock_status": {
    "locked_by": "hod1",
    "locked_by_name": "OHENEBA BOAMAH",
    "is_locked_by_current_user": false
  }
}
```

### 2. Lock Request
```
POST /api/loan/lock-request

Body:
{
  "requestId": "loan-123",
  "requestType": "loan"  // or "leave"
}
```

**Success Response:**
```json
{
  "success": true,
  "locked_by_you": true,
  "message": "Request locked successfully"
}
```

**Conflict Response (Already Locked):**
```json
{
  "success": false,
  "locked": true,
  "locked_by_other": {
    "id": "hod1",
    "name": "OHENEBA BOAMAH"
  },
  "message": "This request is currently being processed by OHENEBA BOAMAH"
}
```

### 3. Release Lock
```
DELETE /api/loan/lock-request?requestId=<id>&requestType=loan

Success Response:
{
  "success": true,
  "message": "Lock released"
}
```

## Workflow Changes

### Loan Request Workflow

**Before:**
```
Staff Submits
    ↓
[Only Primary HOD sees it]
    ↓
HOD approves/rejects
    ↓
To Loan Office
```

**After:**
```
Staff Submits
    ↓
[ALL Linked HODs see it]
    ↓
First HOD locks it → Others see lock alert
    ↓
That HOD approves/rejects → Lock released
    ↓
To Loan Office
    ↓
Request STILL appears on other HODs' tabs
but marked as "Already Processed"
```

### Leave Request Workflow

Same locking logic applies:
- Leave request → Broadcasts to ALL linked HODs
- First HOD locks it → Can process
- Others see lock alert
- Request advances → Lock releases automatically

## HOD Linkage Data Example

Table: `loan_hod_linkages`
```
staff_user_id                    | hod_user_id | hod_rank | staff_rank | location_id
(HRLEAVE TEST NAME ID)          | OHENEBA ID  | director | accounts   | location1
(HRLEAVE TEST NAME ID)          | KWAKU ID    | manager  | accounts   | location1
```

This means:
- HRLEAVE TEST NAME is supervised by 2 HODs
- Both get loan/leave requests from this staff
- Both must approve/acknowledge requests
- Only one can work on each request at a time

## Timeline Logging

Each lock/unlock action is logged:

Table: `loan_request_timeline`
```
{
  "loan_request_id": "req-123",
  "actor_id": "hod1",
  "action_key": "hod_lock",
  "note": "Request locked for processing by HOD",
  "metadata": { "lock_action": true },
  "created_at": "2025-08-01T10:30:00Z"
}
```

Enables audit trail for multi-HOD processing.

## Benefits

1. **Transparency** - All relevant supervisors see all requests
2. **Concurrency Safety** - No overlapping edits or conflicts
3. **Fair Distribution** - Any HOD can work on requests (round-robin capable)
4. **Audit Trail** - Track who locked/worked on what and when
5. **Flexibility** - Works with any number of linked HODs
6. **No Data Loss** - Lock mechanism prevents overwrite conflicts

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| Staff with 1 HOD | Works normally, lock still applied |
| Staff with 5+ HODs | All see request, first-lock-wins |
| HOD loses lock mid-edit | Can release and retry |
| Request auto-advances | Lock auto-releases |
| HOD reassignment | NEW HODs see request on next refresh |
| Staff role change | Updates linkages automatically |

## Component Usage

### RequestLockIndicator Component

```tsx
import { RequestLockIndicator } from "@/components/loan/request-lock-indicator"

export function ReviewRequestPage({ requestId, staffId }) {
  return (
    <div>
      <RequestLockIndicator
        requestId={requestId}
        requestType="loan"
        staffId={staffId}
        onLockStatusChange={(isLocked, lockedBy) => {
          // Handle lock status changes
        }}
      />
      
      {/* Rest of form only enabled if not locked by other */}
    </div>
  )
}
```

## Testing

### Scenario: HRLEAVE TEST NAME (2 HODs)

1. **Setup:**
   - Staff: HRLEAVE TEST NAME
   - HOD1: OHENEBA BOAMAH
   - HOD2: KWAKU APPIAH GHEMENG
   - Both linked in `loan_hod_linkages`

2. **Test Case 1: Request Broadcast**
   - HRLEAVE submits loan request
   - Verify request appears in HOD1 tab ✓
   - Verify request appears in HOD2 tab ✓
   - Request should be identical in both tabs

3. **Test Case 2: Lock Mechanism**
   - HOD1 opens request
   - Verify HOD1 sees "You have locked this request" ✓
   - Verify HOD2 sees "Locked by OHENEBA BOAMAH" ✓
   - HOD2 cannot edit form inputs ✓

4. **Test Case 3: Multiple Leave/Loan Requests**
   - HRLEAVE submits 3 requests (mix of loans and leaves)
   - Verify all 3 appear on both HOD tabs ✓
   - Each can be independently locked ✓

5. **Test Case 4: Lock Release**
   - HOD1 approves request
   - Verify lock auto-releases ✓
   - Request status changes to "hod_approved" ✓
   - Both HOD tabs updated ✓

## Future Enhancements

1. **Timeout-based Lock Release**
   - Auto-release locks after 2 hours of inactivity
   - Prevent deadlocked requests

2. **Lock Escalation**
   - Director can force-release locks
   - Override when HOD is unavailable

3. **HOD Rotation**
   - Smart queue showing whose "turn" it is
   - Track processing time per HOD

4. **Batch Processing**
   - HOD can lock multiple related requests at once
   - Process in batch mode

5. **Mobile Notifications**
   - Push notification when request locks/unlocks
   - Real-time sync across devices

## Troubleshooting

### Issue: Staff linked to HODs but requests don't broadcast

**Cause:** Linkages not in database or incorrect role

**Fix:**
```sql
-- Verify linkages exist
SELECT * FROM loan_hod_linkages 
WHERE staff_user_id = '<staff-id>';

-- Verify HOD role
SELECT id, first_name, role FROM user_profiles
WHERE id IN (
  SELECT DISTINCT hod_user_id FROM loan_hod_linkages
);
```

### Issue: HOD can't see requests from linked staff

**Cause:** HOD doesn't have department_head or regional_manager role

**Fix:**
- Check user_profiles.role = 'department_head' or 'regional_manager'
- Update role if needed

### Issue: Lock shows multiple HODs processing same request

**Cause:** Race condition or stale cache

**Fix:**
- Refresh page (Ctrl+Shift+R)
- Check `hod_reviewer_id` in database
- Should only have one user ID, not multiple

## Questions?

This system fixes the critical multi-HOD anomaly. All linked HODs now work seamlessly on staff requests without data conflicts or missed approvals.
