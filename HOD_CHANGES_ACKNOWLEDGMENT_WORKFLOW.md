## HOD Date Changes Acknowledgment Workflow - Complete Implementation

### Overview

This document describes the sleek and professional HOD date changes acknowledgment workflow that has been implemented. When a HOD or Regional Manager proposes changes to a staff member's leave request, the staff member must acknowledge the changes before they proceed to the HR Leave Office.

### Workflow Steps

#### Step 1: HOD Reviews Leave Request
1. HOD/Regional Manager logs into Leave & HR Leave Planning tab
2. Views a leave request in the "HOD Review" tab
3. Sees the current requested dates
4. Can click "Endorse" to approve, or "Adjust Dates" to propose changes

#### Step 2: HOD Proposes Date Changes
1. HOD clicks "Adjust Dates" button
2. Enters new proposed start and end dates
3. Adds a reason/recommendation for the changes
4. Clicks "Submit Review" button

**Behind the scenes:**
- API sets request status to `hod_changes_pending_acceptance`
- Proposed dates stored in database
- Professional email sent to staff member
- In-app notification created

#### Step 3: Staff Receives Notification
1. Staff sees in-app notification: "HOD has proposed changes to your leave"
2. Receives professional HTML email with:
   - Original requested dates clearly shown
   - Proposed dates clearly shown
   - HOD's reason for the change
   - Clear call-to-action to review and respond

#### Step 4: Staff Reviews and Responds

Staff member has two options:

##### Option A: Accept Changes
1. Staff logs into Leave & HR Leave Planning
2. Goes to "My Requests" tab
3. Finds the request with status "Hod Changes Requested"
4. Sees proposed dates in the card
5. Clicks green "✓ Accept Changes" button
6. Status immediately changes to HR Leave Office (hr_office_forwarded)
7. Request moves to HR Leave Office queue
8. Staff sees confirmation message

##### Option B: Counter-Propose Different Dates
1. Staff clicks blue "↻ Counter Propose" button
2. Date picker appears (Start Date, End Date fields)
3. Staff enters their preferred alternative dates
4. Clicks "Send Counter Proposal"
5. Status changes back to "pending_hod_review"
6. HOD receives notification that staff has counter-proposed
7. Request goes back to HOD for further negotiation

### Database Changes

#### New Columns in `leave_plan_requests`
- `hod_proposed_start_date` (date) - Proposed start date by HOD
- `hod_proposed_end_date` (date) - Proposed end date by HOD
- `hod_change_notes` (text) - Reason for proposed changes
- `staff_accepted_hod_changes` (boolean) - Whether staff accepted
- `staff_acceptance_date` (timestamp) - When staff accepted
- `staff_counter_proposed` (boolean) - Whether staff countered
- `staff_counter_dates_start` (date) - Staff's alternative start date
- `staff_counter_dates_end` (date) - Staff's alternative end date
- `staff_counter_proposed_date` (timestamp) - When staff counter-proposed

#### New Status Value
- `hod_changes_pending_acceptance` - Waiting for staff acknowledgment of HOD changes

#### New Table: `hod_change_notifications`
Tracks notifications and staff responses:
- `id` (uuid, PK)
- `leave_plan_request_id` (uuid, FK)
- `hod_user_id` (uuid) - WHO made the changes
- `staff_user_id` (uuid) - WHO needs to acknowledge
- `original_requested_start` (date) - Staff's original request
- `original_requested_end` (date)
- `hod_proposed_start` (date) - HOD's proposed dates
- `hod_proposed_end` (date)
- `hod_notes` (text) - Reason for changes
- `staff_response_status` (enum: pending/accepted/counter_proposed)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### API Endpoints

#### POST /api/leave/planning/review
**When HOD recommends changes:**

Request body:
```json
{
  "leave_plan_request_id": "uuid",
  "action": "recommend_change",
  "adjusted_preferred_start_date": "2026-05-15",
  "adjusted_preferred_end_date": "2026-05-25",
  "recommendation": "Please adjust to avoid peak period"
}
```

Response:
```json
{
  "success": true,
  "status": "hod_changes_pending_acceptance"
}
```

#### POST /api/leave/planning/hod-acknowledge
**When staff responds to HOD changes:**

For accepting:
```json
{
  "leave_plan_request_id": "uuid",
  "action": "accept"
}
```

For counter-proposing:
```json
{
  "leave_plan_request_id": "uuid",
  "action": "counter",
  "counter_start_date": "2026-05-10",
  "counter_end_date": "2026-05-20"
}
```

Response:
```json
{
  "success": true,
  "message": "Changes accepted. Request forwarded to HR Leave Office."
}
```

### UI Components

#### LeaveRequestCard - Enhanced

When request status is `hod_changes_pending_acceptance`:

1. **Visual Alert Box** (amber/yellow background)
   - Shows "HOD has proposed changes"
   - Displays: Original dates | Proposed dates | HOD reason
   - Clear, easy to read comparison

2. **Action Buttons**
   - Green "✓ Accept Changes" - Primary action
   - Blue "↻ Counter Propose" - Secondary action
   - Both buttons are clear and professional

3. **Counter-Propose Interface** (appears when button clicked)
   - Clean form with two date fields
   - "Send Counter Proposal" button
   - "Cancel" button
   - No confusing options

#### Status Badge
- Shows "Hod Changes Requested" status
- Amber color indicates action needed
- Clear visual indicator

### Email Notification

**Subject:** "HOD Has Proposed Changes to Your Leave Request"

**Body includes:**
- Professional greeting
- Status badge: "Awaiting Your Acknowledgment"
- Original Request section (dates clearly shown)
- Proposed Dates section (dates clearly shown)
- HOD Notes section (reason for changes)
- Clear instruction text
- "Review & Respond" button linking to app

**Design:** Professional HTML with:
- Consistent color scheme
- Clear sections with headers
- Easy-to-read font and spacing
- Mobile-responsive layout

### Workflow Status Transitions

```
pending_hod_review
       ↓
hod_changes_pending_acceptance (Staff must acknowledge)
       ├→ Accept → hr_office_forwarded → HR Leave Office processes
       └→ Counter → pending_hod_review (Back to HOD for negotiation)
                      ↓
                   (HOD can approve counter or propose different dates)
```

### User Experience

**For Staff:**
- Clear notification when changes are proposed
- Easy-to-understand UI with two simple options
- Professional email with context
- No confusion about what to do next
- Instant feedback when action is taken

**For HOD:**
- Simple "Adjust Dates" button
- Straightforward form to enter new dates and reason
- Can see if staff has accepted or counter-proposed
- Can continue negotiating if needed

**For HR Leave Office:**
- Only receives requests that staff has accepted
- Knows dates are agreed upon by staff and HOD
- No confusion about the workflow

### Testing Checklist

1. HOD proposes date changes
   - Status changes to hod_changes_pending_acceptance ✓
   - Email sent to staff ✓
   - In-app notification created ✓

2. Staff accepts changes
   - Status changes to hr_office_forwarded ✓
   - Request moved to HR Leave Office ✓
   - Dates updated to proposed dates ✓

3. Staff counter-proposes
   - Status changes back to pending_hod_review ✓
   - New dates saved ✓
   - HOD notified ✓

4. HOD reviews counter-proposal
   - Can see staff counter-proposed dates ✓
   - Can approve or propose again ✓

5. No editing during acknowledgment
   - Edit button disabled when status = hod_changes_pending_acceptance ✓
   - Staff must Accept or Counter-Propose ✓

### Key Features

✓ **Professional UI** - Clean, modern interface
✓ **Clear Communication** - Staff always knows what's happening
✓ **Simple Options** - Accept or Counter-Propose, no confusion
✓ **Email Notifications** - Beautiful HTML emails with context
✓ **Audit Trail** - All changes tracked in database
✓ **No Data Loss** - Original dates preserved
✓ **Flexible** - Allows negotiation between HOD and staff
✓ **Scalable** - Works with multiple HODs
✓ **Admin Override** - Admin can still manage workflow

### Future Enhancements

- Multiple counter-proposals allowed before approval
- Automatic escalation if no response after X days
- SMS notification option for time-sensitive changes
- Dashboard showing pending acknowledgments
- Bulk HOD change operations

---

**Status:** ✓ Complete and Ready for Production  
**Last Updated:** 2026-05-13  
**Version:** 1.0
