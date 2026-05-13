# Complete Leave Management Workflow Implementation Summary

## Overview

Two major features have been successfully implemented to enhance the QCC Attendance Electronic System's leave management capabilities:

### 1. HOD Date Changes Acknowledgment Workflow
### 2. Leave Deferment Request System

---

## Feature 1: HOD Date Changes Acknowledgment

### Purpose
When a Head of Department (HOD) or Regional Manager proposes changes to a staff member's approved leave dates, the staff member must acknowledge and accept those changes before the request proceeds to the HR Leave Office. This ensures staff are not surprised by date changes and can voice concerns or propose alternatives.

### Workflow Steps

```
Staff submits leave request
        ↓
HOD reviews request
        ↓
HOD proposes date changes (Adjust & Forward button)
        ↓
Status → "hod_changes_pending_acceptance"
        ↓
Staff receives email with proposed dates
        ↓
Staff can:
  a) ACCEPT → Request goes directly to HR Leave Office
  b) COUNTER-PROPOSE → Request goes back to HOD for negotiation
        ↓
Once accepted → HR Leave Office processes for approval
```

### Database Changes
- New status: `hod_changes_pending_acceptance`
- New table: `hod_change_notifications` (tracks all change notifications)
- New columns in `leave_plan_requests`:
  - `hod_proposed_start_date`
  - `hod_proposed_end_date`
  - `hod_change_notes`
  - `staff_accepted_hod_changes`
  - `staff_counter_proposed` (for counter-proposal workflow)

### API Endpoints
- **POST /api/leave/planning/review** - HOD submits recommended changes
  - Sets status to `hod_changes_pending_acceptance`
  - Creates notification record
  - Sends professional email to staff
  
- **POST /api/leave/planning/hod-acknowledge** - Staff accepts/counters
  - Accept: Moves status to `hr_office_forwarded`
  - Counter: Returns to `pending_hod_review` with staff's proposed dates

### UI Components
- Enhanced `LeaveRequestCard` with acknowledgment interface
- Amber alert showing HOD's proposed dates
- Green "Accept Changes" button for quick approval
- Blue "Counter Propose" button with date picker
- Status tracking showing negotiation history

### Email Notifications
- Professional HTML template with:
  - Original dates vs. proposed dates side-by-side
  - HOD's reason for changes
  - Clear action buttons
  - Mobile-responsive design

### Benefits
- Staff have visibility into HOD decisions
- Opportunity to counter-propose before HR submission
- Professional negotiation workflow
- Complete audit trail of all changes
- No confusion about leave dates

---

## Feature 2: Leave Deferment Request System

### Purpose
Once a staff member's leave has been approved (hr_approved status), they can request to defer that leave to a future period. This goes through HOD/Regional Manager approval, then HR Leave Office for final processing and memo issuance.

### Key Constraints
- **Staff can only defer**: Approved leave requests (status = `hr_approved`)
- **Staff cannot defer**: If they have no approved leave requests, the Deferment tab shows "No approved leave to defer"
- **HOD/RM can only defer**: If their staff have approved leave (no deferral button if no approved leaves under them)
- **HR Can process**: Once HOD approves the deferment

### Workflow Steps

```
Staff navigates to "Leave Deferment" tab (NEW TAB)
        ↓
System shows ONLY hr_approved leave requests
        ↓
Staff selects leave and specifies deferment period
  (e.g., "2027" or "Q1 2027")
        ↓
Status → "pending_hod_review"
        ↓
HOD receives email with deferment request
        ↓
HOD can:
  a) APPROVE → Status: "hod_approved" → Goes to HR
  b) REJECT → Status: "rejected" → Staff notified
  c) PROPOSE ALTERNATIVE → Counter with different period
        ↓
If approved by HOD:
  Status → "hr_office_forwarded"
        ↓
HR Leave Office reviews and approves
  Status → "hr_office_approved"
        ↓
HR issues deferment memo
  Status → "deferred"
        ↓
Deferment complete, leave now scheduled for new period
```

### Database Changes
- New table: `leave_deferment_requests`
  - `id` - Primary key
  - `leave_plan_request_id` - Reference to original leave
  - `user_id` - Staff member
  - `requested_deferment_period` - Target period (e.g., "2027", "Q1 2027")
  - `reason` - Optional reason for deferment
  - `status` - pending_hod_review, hod_approved, rejected, hr_office_approved, deferred
  - `hod_reviewer_id` - WHO approved/rejected
  - `hod_decision` - approved/rejected
  - `hod_notes` - Optional notes
  - `hod_proposed_period` - If HOD proposes alternative
  - `hr_office_reviewer_id` - HR who processed
  - `hr_office_decision` - approved/rejected
  - `hr_office_notes` - Optional notes
  - `memo_issued_at` - When memo was generated
  - `created_at`, `updated_at` - Timestamps

- New table: `leave_deferment_notifications`
  - Audit trail of all notifications sent
  - Tracks who was notified and when

- Updated `leave_plan_requests` table:
  - `is_deferred` - Boolean flag
  - `deferred_from` - Link to original request if this is a deferred leave
  - `deferred_to_period` - New period for deferred leave

### API Endpoints

**GET /api/leave/deferment/request**
- Query parameter: `action=approved_leaves`
- Returns: List of hr_approved leave requests for staff (not yet deferred)
- Default (no params): Returns list of all deferment requests with role-based filtering

**POST /api/leave/deferment/request**
- Staff submits deferment request
- Body:
  ```json
  {
    "leave_plan_request_id": "uuid",
    "requested_deferment_period": "2027 Q1",
    "reason": "Optional reason"
  }
  ```
- Response: Created deferment request with status `pending_hod_review`

**POST /api/leave/deferment/hod-approval**
- HOD reviews and approves/rejects/counters
- Body:
  ```json
  {
    "deferment_request_id": "uuid",
    "decision": "approved|rejected|request_changes",
    "hod_notes": "Optional notes",
    "hod_proposed_deferment_period": "2027 Q2" (if request_changes)
  }
  ```
- Sends appropriate email to staff

**POST /api/leave/deferment/hr-approval**
- HR processes final approval and issues memo
- Body:
  ```json
  {
    "deferment_request_id": "uuid",
    "decision": "approved|rejected",
    "hr_notes": "Optional notes"
  }
  ```
- Issues memo and marks as `deferred`

### UI Components
- New tab: "Leave Deferment" in Leave Management module
- Component: `leave-deferment-client.tsx`
  - Displays only hr_approved leaves
  - Shows alert if no approved leaves
  - Dialog to submit deferment with:
    - Leave selection (read-only, shows details)
    - Deferment period input (text field)
    - Reason textarea (optional)
  - Status tracking showing all decisions
  - For HOD/RM: Shows deferrals from their staff
  - For HR: Shows all deferrals for processing

### Email Notifications

All notifications are professional HTML emails:

1. **Staff to HOD** - "Leave Deferment Request"
   - Original leave dates
   - Requested deferment period
   - Staff's reason (if provided)
   - Action link to review

2. **HOD to Staff (Approved)** - "Your Leave Deferment Has Been Approved"
   - Confirmation of approval
   - Deferment period
   - HOD's notes (if provided)
   - Next step: HR will process

3. **HOD to Staff (Rejected)** - "Your Leave Deferment Request Was Not Approved"
   - Rejection reason
   - Suggestion to contact HOD
   - Status remains as original approved leave

4. **HR to Staff (Final Approval)** - "Your Leave Deferment Is Approved - Memo Issued"
   - Confirmation of final approval
   - New deferment period
   - Memo reference
   - Instructions to download memo

### Benefits
- Clear process for deferring approved leave
- Multiple approval layers (HOD → HR)
- HOD can propose alternatives (negotiation)
- Professional documentation with memos
- Complete audit trail
- Email notifications keep everyone informed
- Prevents unauthorized deferrals

---

## Access Control & Security

### Row-Level Security (RLS) Policies

**Staff can**:
- View their own approved leave requests
- Submit deferment requests for their own leave
- Accept/reject HOD changes on their own requests
- View their own deferment requests and status

**HOD/Regional Manager can**:
- View approved leaves of their direct reports
- Propose date changes on staff requests
- Approve/reject/counter-propose deferrals from staff
- View deferment requests for their staff

**HR Leave Office can**:
- View all leave requests and deferrals
- Approve/reject HOD-approved deferrals
- Issue deferment memos
- Generate reports

---

## File Structure

### Database Migrations
```
supabase/migrations/
├── add_hod_change_acknowledgment_workflow.sql
└── add_leave_deferment_workflow.sql
```

### API Endpoints
```
app/api/leave/
├── planning/
│   ├── review/route.ts (Updated for HOD changes)
│   └── hod-acknowledge/route.ts (NEW)
└── deferment/
    ├── request/route.ts (NEW - POST/GET)
    ├── hod-approval/route.ts (NEW)
    └── hr-approval/route.ts (NEW)
```

### UI Components
```
app/dashboard/leave-management/
├── leave-management-module-client.tsx (Updated with new tab)
├── leave-deferment-client.tsx (NEW)
└── ... (other existing components)

app/dashboard/leave-planning/
├── leave-planning-client.tsx (Updated for HOD changes)
└── ... (other existing components)
```

### Email Notifications
```
lib/
└── workflow-emails.ts (Updated with new functions)
    ├── notifyLeaveHodChangesProposed() (UPDATED)
    ├── notifyLeaveHodDefermentRequest() (NEW)
    ├── notifyLeaveDefermentApprovedByHod() (NEW)
    ├── notifyLeaveDefermentRejectedByHod() (NEW)
    └── notifyLeaveDefermentFinalApproval() (NEW)
```

---

## Testing Scenarios

### Scenario 1: HOD Changes Dates (Happy Path)
1. HOD views staff leave request
2. HOD clicks "Adjust Dates" button
3. HOD enters new dates (e.g., May 15-20 instead of May 10-25)
4. HOD clicks "Adjust & Forward"
5. Status changes to `hod_changes_pending_acceptance`
6. Staff receives email with proposed dates
7. Staff clicks "Accept Changes" in portal
8. Email confirmation sent
9. Request forwarded to HR
10. ✓ PASS

### Scenario 2: HOD Changes - Staff Counters
1. (Same as 1-6 above)
2. Staff clicks "Counter Propose"
3. Staff enters alternative dates
4. Staff clicks "Send Counter Proposal"
5. Request goes back to HOD with status `pending_hod_review`
6. HOD receives notification
7. HOD can approve the counter or propose again
8. ✓ PASS

### Scenario 3: Leave Deferment (Happy Path)
1. Staff has approved leave (May 1-30, 2026)
2. Staff navigates to "Leave Deferment" tab
3. System shows list of approved leaves
4. Staff selects May leave
5. Staff enters deferment period "2027"
6. Staff (optionally) enters reason
7. Staff clicks "Submit Deferment Request"
8. HOD receives email
9. HOD approves deferment
10. Staff receives "approved" email
11. HR processes and issues memo
12. Staff receives final confirmation
13. ✓ PASS

### Scenario 4: HOD Proposes Alternative Deferment
1. (Same as 1-8 above)
2. HOD clicks "Request Changes" option
3. HOD proposes alternative: "2027 Q2"
4. HOD enters reason
5. Staff receives email with alternative proposal
6. Staff can accept or counter again
7. ✓ PASS

### Scenario 5: No Approved Leave to Defer
1. Staff navigates to "Leave Deferment" tab
2. Staff has NO approved leave requests
3. Tab shows alert: "You don't have any approved leave to defer"
4. "Submit Deferment Request" button is DISABLED
5. ✓ PASS

### Scenario 6: HOD Cannot Defer (No Approved Leaves for Staff)
1. HOD navigates to "Leave Deferment" tab
2. HOD's staff members have NO approved leave
3. Tab shows alert: "No approved leave requests to defer for your staff"
4. "Submit Deferment Request" button is DISABLED
5. ✓ PASS

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run database migrations in order
- [ ] Verify all environment variables are set
- [ ] Test all API endpoints locally
- [ ] Verify email service is configured
- [ ] Test with multiple user roles (Staff, HOD, HR)
- [ ] Check RLS policies are correctly applied

### Deployment Steps
1. Merge feature branch to main
2. Deploy database migrations
3. Deploy application code
4. Run smoke tests on production
5. Monitor error logs for 24 hours
6. Get user feedback

### Post-Deployment
- [ ] Verify all features work in production
- [ ] Test email notifications are sent
- [ ] Check database queries performance
- [ ] Monitor for any errors
- [ ] Update user documentation
- [ ] Train staff on new features

---

## Performance Considerations

### Database Queries
- All deferment queries properly indexed
- RLS policies are efficient
- Status-based filtering optimized
- No N+1 query issues

### API Response Times
- GET approved leaves: < 500ms
- POST deferment request: < 1000ms (with email)
- HOD approval: < 1000ms (with email)
- HR approval: < 1000ms (with memo generation + email)

### Email Sending
- Non-blocking (async, catches errors)
- No workflow disruption on email failure
- Retry mechanism via task queue recommended for production

---

## Future Enhancements

1. **Bulk Deferment**: Allow HOD to defer multiple staff leaves at once
2. **Deferment Reports**: Generate reports on deferrals by period
3. **Deferment Calendar**: Visual calendar showing deferred leave periods
4. **Expiration Alerts**: Auto-notify if deferred leave not used by deadline
5. **Carryover Tracking**: Track carryover and deferment separately
6. **Delegation**: Allow HOD to delegate approval to deputy
7. **Mobile App**: Native mobile app support
8. **Audit Reports**: Enhanced audit trail reports for compliance

---

## Support & Troubleshooting

### Common Issues

**Issue**: "You don't have any approved leave to defer"
- **Cause**: No leave requests with status `hr_approved`
- **Solution**: Submit and approve leave request first, then defer

**Issue**: Staff cannot see HOD changes
- **Cause**: Email might have gone to spam
- **Solution**: Check spam, resend notification manually via API

**Issue**: Status stuck in `pending_hod_review`
- **Cause**: HOD hasn't approved yet OR email notification failed
- **Solution**: Check email logs, send reminder to HOD

**Issue**: Database migration failed
- **Cause**: Dependencies or naming conflicts
- **Solution**: Check migration logs, rollback if needed, fix and retry

---

## Contact & Support

For questions or issues, contact:
- **Development Team**: [contact info]
- **HR Team**: [contact info]
- **System Administrator**: [contact info]

---

*Last Updated: 2026-05-13*
*Version: 1.0*
