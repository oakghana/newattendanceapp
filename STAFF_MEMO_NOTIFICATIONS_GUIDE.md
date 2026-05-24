# Staff Dashboard Notifications for Deferrments, Recalls & Payment Advice

## Overview

Staff members can now see real-time notifications on their dashboard when their deferrment, recall, and payment advice memos have been approved by HR. This eliminates the need for staff to manually check tabs or wait for email notifications.

## What's New

### 1. Deferment Approved Notifications
When HR approves a staff member's deferment request:
- A card appears on the "My Requests" tab showing:
  - "Deferment Approved" status
  - Deferment date range
  - Reason for deferment
  - Date approved
- An automatic toast notification appears: "Deferment Approved: You have X approved deferment memo(s) ready"

### 2. Recall Approved Notifications  
When HR approves a staff member's recall request:
- A card appears on the "My Requests" tab showing:
  - "Recall Approved" status
  - Recall effective date
  - Reason for recall
  - Approval details
- An automatic toast notification appears: "Recall Approved: You have X approved recall memo(s) ready"

### 3. Payment Advice Notifications
(Already existed, now integrated with deferment/recall):
- Shows approved payment advice memos
- Downloadable as PDF
- Appears automatically when processed

## Technical Implementation

### New API Endpoints

#### `/api/leave/deferment-memos/my-memos` (GET)
Returns approved deferment memos for the current user:
```json
{
  "memos": [
    {
      "id": "uuid",
      "type": "deferment",
      "title": "Deferment Approved",
      "description": "Your leave deferment from X to Y has been approved",
      "reason": "Financial reasons",
      "approved_at": "2026-05-24T10:30:00Z"
    }
  ],
  "count": 1
}
```

#### `/api/leave/recall-memos/my-memos` (GET)
Returns approved recall memos for the current user:
```json
{
  "memos": [
    {
      "id": "uuid",
      "type": "recall",
      "title": "Recall Approved",
      "description": "Your leave has been recalled effective X",
      "reason": "Business requirement",
      "recall_date": "2026-06-01",
      "approved_at": "2026-05-24T10:30:00Z"
    }
  ],
  "count": 1
}
```

### Dashboard Integration

**State Management:**
```typescript
const [myDefermentMemos, setMyDefermentMemos] = useState<any[]>([])
const [isLoadingMyDefermentMemos, setIsLoadingMyDefermentMemos] = useState(false)
const [myRecallMemos, setMyRecallMemos] = useState<any[]>([])
const [isLoadingMyRecallMemos, setIsLoadingMyRecallMemos] = useState(false)
```

**Fetch Effects:**
- Fetch on component mount
- Fetch when userId changes
- Automatically show toast notifications when memos are found

**UI Sections:**
- Displays on "My Requests" tab only
- Conditional rendering (only shows if memos exist)
- Card-based layout with status badges
- Loading spinners while fetching

## User Experience Flow

### Staff Perspective

1. **HR Approves Deferment/Recall**
   - Staff member is waiting on their dashboard

2. **Automatic Toast Notification**
   - Toast appears: "Deferment Approved: You have 1 approved deferment memo(s) ready"
   - Toast stays for 5 seconds
   - No page refresh needed

3. **Dashboard Card Appears**
   - On "My Requests" tab
   - Shows full details of approved deferment/recall
   - Clearly marked as "Approved"
   - Dates and reasons displayed

4. **Staff Can Take Action**
   - View the memo details
   - Download related PDFs if available
   - Share with their manager/team
   - Print if needed

## Database Queries

The APIs query directly from the leave request tables:

**Deferment Memos:**
```sql
SELECT * FROM leave_deferment_requests
WHERE user_id = $1 
AND hr_office_decision = 'approved'
ORDER BY updated_at DESC
```

**Recall Memos:**
```sql
SELECT * FROM leave_recall_requests
WHERE staff_user_id = $1
AND status = 'approved'
ORDER BY updated_at DESC
```

## Benefits

✓ **Real-time Updates**: Staff see approvals immediately
✓ **Clear Notifications**: Toast alerts + dashboard cards
✓ **No Manual Checking**: Information comes to staff
✓ **Professional Appearance**: Styled cards matching payment advice
✓ **Complete Information**: All relevant details displayed
✓ **Automatic**: Fetched on every page load

## Testing

### Test Deferment Notification:
1. As HR: Create and approve a deferment request for a staff member
2. As staff: Go to dashboard → "My Requests" tab
3. Expected: Toast notification appears + deferment card visible

### Test Recall Notification:
1. As HR: Create and approve a recall request for a staff member
2. As staff: Go to dashboard → "My Requests" tab
3. Expected: Toast notification appears + recall card visible

### Test Toast Timing:
- Toast should appear for ~5 seconds
- Multiple memos should show count: "You have 2 approved deferment memo(s)"

## Integration Points

- **API Layer**: `/api/leave/deferment-memos/my-memos` & `/api/leave/recall-memos/my-memos`
- **Dashboard**: `leave-management-client.tsx` state + rendering
- **Database**: Queries existing leave_deferment_requests & leave_recall_requests tables
- **Toast System**: Uses existing `useToast()` hook from UI library

## Future Enhancements

- Email notifications when memos are approved
- SMS alerts for urgent recalls
- Memo download functionality (currently displays info only)
- Calendar integration to show deferment/recall dates
- Manager notifications when staff approvals are ready
- Archive/history of past deferrments and recalls

---

## Summary

Staff no longer need to manually check the Deferrments or Recalls tabs. When HR approves a deferment or recall request, staff will immediately see:
1. A toast notification alerting them
2. A dashboard card with full details
3. All relevant information about their approved request

This provides a seamless, professional experience and keeps staff informed about their leave status in real-time.
