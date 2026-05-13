# Leave Deferment Feature - Complete Implementation Guide

## Overview

The Leave Deferment feature allows staff members with approved leave to defer their leave to a future leave year. The workflow ensures proper governance with HOD/Regional Manager approval before HR Leave Office processes the deferment.

## Feature Availability

### Who Can Request Deferment?
- **Staff with approved leave only** (status: `hr_approved`)
- Cannot defer leave that hasn't been approved by HR
- Cannot defer leave that's already been deferred

### Who Can Approve Deferrals?
- **HOD (Department Head)** for their staff
- **Regional Manager** for their staff  
- Can approve, reject, or propose alternative deferment period

### Who Processes Deferrals?
- **HR Leave Office** (leave_admin, hr_office roles)
- Issues official deferment memo
- Provides final approval confirmation

## Complete Workflow

```
STAFF SUBMITS DEFERMENT REQUEST
         ↓
   [Approved Leave Selected]
   [Deferment Year/Period Specified]
   [Optional Reason Provided]
         ↓
HOD/REGIONAL MANAGER REVIEWS
         ↓
   ├─ APPROVE → Goes to HR Leave Office
   ├─ REJECT  → Staff Notified (Can Resubmit)
   └─ REQUEST CHANGES → Staff Can Counter
         ↓
HR LEAVE OFFICE PROCESSES
         ↓
   ├─ APPROVE → Memo Issued (Completed)
   └─ REJECT  → Staff Notified (Can Resubmit)
```

## User Interface

### Staff Portal - Leave Management > Leave Deferment Tab

**When No Approved Leave Exists:**
- Empty state message: "You can only defer leave requests that have been approved by HR"
- Instruction to apply for and get leave approved first

**When Approved Leave Exists:**
- Card-based layout showing each approved leave
- Displays: Leave Type, Dates, Duration
- Blue "Defer Leave" button on each card
- Dialog to enter deferment details:
  - Deferment Year (required): e.g., "2027"
  - Deferment Period (required): e.g., "Q1 2027" or "January 2027"
  - Reason (optional): Why deferring this leave

**Deferment Status Tracking:**
- Shows all submitted deferment requests
- Status indicators: Pending HOD Review → Approved by HOD → HR Approved
- HOD decision with notes (if available)
- HR final decision with notes (if available)
- Color-coded badges for visual clarity

## Database Schema

### Main Tables

**leave_deferment_requests** - Core deferment tracking
- `id` - Unique request ID
- `leave_plan_request_id` - References the approved leave
- `user_id` - Staff member requesting deferment
- `requested_deferment_year` - Target year (e.g., "2027")
- `requested_deferment_period` - Target period (e.g., "Q1 2027")
- `reason` - Optional reason for deferment
- `status` - pending_hod_review | hod_approved | hod_rejected | hod_changes_requested | hr_office_approved | hr_office_rejected | completed
- `hod_reviewer_id` - HOD who reviewed
- `hod_decision` - approved | rejected | request_change
- `hod_notes` - HOD's comments
- `hod_reviewed_at` - When HOD reviewed
- `hod_proposed_deferment_year/period` - If HOD suggests alternative
- `hr_office_reviewer_id` - HR who processed
- `hr_office_decision` - approved | rejected
- `hr_office_notes` - HR comments
- `hr_office_reviewed_at` - When HR processed
- `memo_reference` - Reference to official deferment memo
- `created_at`, `updated_at` - Timestamps

**leave_deferment_notifications** - Audit trail
- Tracks all notifications sent
- Types: staff_submitted, hod_approved, hod_rejected, hr_approved, hr_rejected
- Recipient IDs and messages for audit

## API Endpoints

### POST /api/leave/deferment/request
**Purpose:** Staff submits deferment request

**Request Body:**
```json
{
  "leave_plan_request_id": "uuid",
  "requested_deferment_year": "2027",
  "requested_deferment_period": "Q1 2027",
  "reason": "Personal circumstances"  // optional
}
```

**Response:** `{ success: true, defermentRequest: {...} }`

**Validations:**
- Leave must belong to requesting user
- Leave must have status `hr_approved`
- No existing pending deferment for this leave
- HOD/Regional Manager must exist

**Side Effects:**
- Creates deferment_requests record
- Creates notification entry
- Sends email to HOD/Regional Manager
- Status: pending_hod_review

### POST /api/leave/deferment/hod-approval
**Purpose:** HOD/Regional Manager approves/rejects deferment

**Request Body:**
```json
{
  "deferment_request_id": "uuid",
  "decision": "approved",  // or "rejected" or "request_change"
  "hod_notes": "Looks good",  // optional
  "hod_proposed_deferment_year": "2027",  // only if request_change
  "hod_proposed_deferment_period": "Q2 2027"  // only if request_change
}
```

**Response:** `{ success: true, message: "..." }`

**Authorization:**
- User must be HOD/Regional Manager for the staff member
- Deferment must be in pending_hod_review status

**Status Updates:**
- approved → status becomes `hod_approved`
- rejected → status becomes `hod_rejected`
- request_change → status becomes `hod_changes_requested`

**Side Effects:**
- Creates notification entry
- Sends email to staff member
- Sets hod_reviewed_at timestamp

### POST /api/leave/deferment/hr-approval
**Purpose:** HR Leave Office processes approved deferrals

**Request Body:**
```json
{
  "deferment_request_id": "uuid",
  "decision": "approved",  // or "rejected"
  "memo_reference": "DEFER-2024-001",
  "hr_notes": "Processed successfully"  // optional
}
```

**Response:** `{ success: true, message: "..." }`

**Authorization:**
- User must have hr_office or leave_admin role
- Deferment must be in hod_approved status

**Status Updates:**
- approved → status becomes `hr_office_approved` (completed)
- rejected → status becomes `hr_office_rejected`

**Side Effects:**
- Creates notification entry
- Sends final approval email to staff
- Records memo_reference for official documentation

### GET /api/leave/deferment/request?action=approved_leaves
**Purpose:** Get approved leaves available for deferment

**Response:** `{ requests: [ { id, leave_type_key, preferred_start_date, ... } ] }`

**Filters:**
- Status must be `hr_approved`
- User must own the leave
- Leave must not already be deferred (is_deferred = false)

### GET /api/leave/deferment/request
**Purpose:** Get deferment requests (all or user's own)

**Response:** `{ deferments: [ { id, status, hod_decision, ... } ] }`

**Role-Based Access:**
- Admin/HR: Sees all deferments
- Staff: Sees only their own deferments

## Email Notifications

### When Staff Submits Deferment
**Recipient:** HOD/Regional Manager
**Subject:** "Leave Deferment Request from [Staff Name]"

Shows:
- Staff member details
- Original leave dates
- Requested deferment period
- Staff's reason (if provided)
- Link to review in dashboard

### When HOD Approves Deferment
**Recipient:** Staff member
**Subject:** "Your Leave Deferment Has Been Approved"

Shows:
- Leave type and deferment period
- HOD's approval confirmation
- HOD's notes (if provided)
- Notification that HR will process next

### When HOD Rejects Deferment
**Recipient:** Staff member
**Subject:** "Your Leave Deferment Request Was Not Approved"

Shows:
- Leave type details
- Rejection reason from HOD
- Contact suggestion to discuss options

### When HR Approves Final
**Recipient:** Staff member
**Subject:** "Your Leave Deferment Is Approved - Memo Issued"

Shows:
- Deferment confirmation
- Official memo reference
- Link to download memo from dashboard

## Row-Level Security (RLS)

### Database Access Control

**leave_deferment_requests Table:**
- Staff: Can view/insert only their own records
- HOD/Regional Manager: Can view/update records for their staff
- HR: Can view/update all records
- Admin: Full access

**leave_deferment_notifications Table:**
- Recipients: Can view notifications about them
- Creators: Can insert new notifications
- HR/Admin: Can view all for audit

## Integration Points

### With Leave Planning
- Approved leave requests (`hr_approved` status) are available for deferment
- Original leave dates preserved for reference
- Deferment doesn't affect current leave balance

### With Leave Balance
- Deferred leave reduces current leave year balance
- Adds to future leave year balance
- HR memo documents the transfer

### With Leave Calendar
- Deferred leave removed from current calendar
- Added to proposed future calendar with memo reference

## Security Considerations

1. **Authentication:** All endpoints require active user session
2. **Authorization:** Role-based access via RLS policies
3. **Data Validation:** 
   - Year/period format validation
   - Leave ownership verification
   - Status transition validation
4. **Audit Trail:** All actions logged in notifications table
5. **Email Security:** No sensitive data in email subjects, only links to secure dashboard

## Testing Scenarios

### Scenario 1: Staff with No Approved Leave
- Staff tries to access Leave Deferment tab
- See empty state message
- Cannot submit deferment
- ✓ Pass: UI guides to apply for leave first

### Scenario 2: Successful Deferment Request
- Staff selects approved leave
- Enters deferment year/period
- Submits with optional reason
- ✓ Pass: Request created, HOD notified, status pending_hod_review

### Scenario 3: HOD Approves Deferment
- HOD reviews deferment in dashboard
- Clicks approve
- Enters optional notes
- ✓ Pass: Status updated, staff notified, moves to HR queue

### Scenario 4: HOD Requests Changes
- HOD proposes alternative deferment period
- Staff can re-submit with new dates
- ✓ Pass: Staff counter proposal goes back to HOD

### Scenario 5: HR Final Processing
- HR sees approved deferments
- Issues official memo
- Updates leave records
- ✓ Pass: Deferment completed, staff receives final confirmation

## Deployment Checklist

- [x] Database migration applied
- [x] API endpoints deployed
- [x] UI component integrated into Leave Management
- [x] Email notification system configured
- [x] RLS policies applied
- [x] Error handling implemented
- [x] Build passes without errors
- [x] Commits pushed to branch

## Future Enhancements

1. **Bulk Deferments:** Allow staff to defer multiple leaves at once
2. **Partial Deferment:** Split a leave across multiple years
3. **Deferment Expiry:** Automatic deferment expiration if not used by certain date
4. **Deferment Transfer:** Allow staff to transfer deferred leave to another person
5. **Deferment History:** Detailed history of all deferment actions
6. **Analytics:** Reports on deferment trends and patterns

## Support & Troubleshooting

### Staff Can't See Leave Deferment Tab
- Ensure they have approved leave requests (hr_approved status)
- Check that Leave Administration permission is granted
- Verify they're not on a restricted role

### HOD Not Receiving Notifications
- Verify HOD email is configured in user_profiles
- Check email service configuration in environment
- Review notification logs for failures

### Deferment Stuck in Pending Review
- HOD may have missed notification
- Manual follow-up via dashboard recommended
- Admin can check status directly in deferment_requests table

## Configuration

### Environment Variables Needed
- SMTP settings for email notifications (already configured)
- APP_URL for dashboard links in emails

### Feature Flags
- Leave Deferment available for all organizations
- Can be restricted via role-based access if needed

---

**Last Updated:** May 13, 2026  
**Status:** Production Ready  
**Version:** 1.0.0
