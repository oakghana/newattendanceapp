# Leave Date Change Workflow - Implementation Guide

## Overview
A simple, modern system for HOD/Regional Manager date change proposals with staff acknowledgment and counter-proposal capabilities.

## System Flow

### 1. HOD/RM Initiates Change
- Views approved leave request
- Clicks "Propose Date Changes" button
- Fills in:
  - New start date
  - New end date
  - Reason for change (required)
- Toast notification: "Date change proposal sent to [Staff Name]"

### 2. Staff Receives Notification
- Sees change proposal notification at top of their leave request
- Shows: Original dates → Proposed dates
- Has 3 options:
  - **✓ Agree with Changes** - Approves new dates, goes to HR
  - **✗ Disagree & Request Original** - Rejects change, keeps original dates
  - **📝 Propose Counter Dates** - Suggests different dates with explanation

### 3. Counter-Proposal Flow
If staff proposes different dates:
- Enters their preferred dates explanation
- Sends back to HOD/RM for review
- Toast: "Your counter-proposal has been sent to the manager"

### 4. Final Processing
- Once staff agrees (or rejects), the leaves goes to HR Leave Office
- If counter-proposed, HOD/RM can review and re-propose
- Clear audit trail of all changes

## Components

### 1. `HodChangeLeaveRequestDialog`
**For HOD/RM to propose changes**

```tsx
<HodChangeLeaveRequestDialog
  isOpen={showChangeDialog}
  onClose={() => setShowChangeDialog(false)}
  leaveRequestId="leave-123"
  staffName="John Doe"
  currentStartDate="2025-06-01"
  currentEndDate="2025-06-10"
  userId={userId}
  userRole="department_head"
  onSuccess={() => {
    toast({ title: "Success" })
    fetchLeaveRequests()
  }}
/>
```

### 2. `LeaveChangeProposalModal`
**For staff to respond to changes**

```tsx
<LeaveChangeProposalModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  leaveRequestId="leave-123"
  staffName="John Doe"
  originalStartDate="2025-06-01"
  originalEndDate="2025-06-10"
  proposedStartDate="2025-06-05"
  proposedEndDate="2025-06-15"
  proposalReason="Operational needs - covering absence"
  userId={userId}
  userRole="staff"
  onSuccess={() => {
    toast({ title: "Request acknowledged" })
    fetchMyLeaves()
  }}
/>
```

### 3. `LeaveChangeNotification`
**Display notification on leave request**

```tsx
{changeProposal?.status === "pending" && (
  <LeaveChangeNotification
    leaveRequestId={leaveRequestId}
    staffName={staffName}
    originalStartDate={changeProposal.originalStartDate}
    originalEndDate={changeProposal.originalEndDate}
    proposedStartDate={changeProposal.proposedStartDate}
    proposedEndDate={changeProposal.proposedEndDate}
    proposalReason={changeProposal.proposalReason}
    proposedByRole="department_head"
    status="pending"
    userId={userId}
    userRole={userRole}
    onRefresh={() => fetchLeaves()}
  />
)}
```

### 4. `LeaveRequestCardWithChanges`
**Complete card with change handling**

```tsx
<LeaveRequestCardWithChanges
  leaveRequestId="leave-123"
  staffName="John Doe"
  staffEmail="john@company.com"
  startDate="2025-06-01"
  endDate="2025-06-10"
  leaveType="Annual Leave"
  status="approved"
  userId={userId}
  userRole={userRole}
  isManagerView={true}
  changeProposal={{
    originalStartDate: "2025-06-01",
    originalEndDate: "2025-06-10",
    proposedStartDate: "2025-06-05",
    proposedEndDate: "2025-06-15",
    proposalReason: "Operational needs",
    proposedByRole: "department_head",
    changeStatus: "pending",
  }}
  onRefresh={() => fetchLeaves()}
/>
```

## API Endpoints

### POST `/api/leave/change-proposal`
**Create or respond to change proposals**

Request body:
```json
{
  "leave_request_id": "uuid",
  "proposed_start_date": "2025-06-05",
  "proposed_end_date": "2025-06-15",
  "reason": "Operational coverage needed",
  "action_type": "propose_change|acknowledge_accept|acknowledge_reject|counter_propose",
  "user_id": "uuid",
  "user_role": "department_head|staff|regional_manager",
  "response_text": "I can start on June 7 instead" // for counter_propose
}
```

Response:
```json
{
  "success": true,
  "data": { /* proposal object */ },
  "message": "Change proposal created successfully"
}
```

### GET `/api/leave/change-proposal`
**Fetch proposals**

Query params:
- `leave_request_id` - Get proposals for a specific leave
- `user_id` - Get proposals created by a user

## Toast Notifications

### For Managers
- "Date change proposal sent to [Staff Name]. They will notify you of their response."
- "Change proposal accepted by [Staff Name]. Request will proceed to HR."
- "Change proposal rejected by [Staff Name]. Original dates retained."
- "Counter-proposal received from [Staff Name]. Please review and respond."

### For Staff
- "You have agreed to the proposed dates. The request will proceed to HR."
- "You have declined the proposed dates. The original dates will be used."
- "Your counter-proposal has been sent to the manager for review."

## Database Table Structure

`leave_change_proposals` table (auto-created):
```sql
- id (uuid, primary key)
- leave_request_id (uuid, foreign key)
- original_start_date (date)
- original_end_date (date)
- proposed_start_date (date)
- proposed_end_date (date)
- proposed_by_user_id (uuid)
- proposed_by_role (text)
- proposal_reason (text)
- action_type (text) - propose_change, acknowledge_accept, acknowledge_reject, counter_propose
- staff_response_text (text) - for counter proposals
- status (text) - pending, accepted, rejected
- created_at (timestamp)
```

## Usage in Leave Management Page

1. Import components at top of leave management client
2. When displaying approved leave requests to managers, add "Propose Date Changes" button
3. When displaying leave requests to staff, check for pending change proposals
4. Show `LeaveChangeNotification` if proposal exists
5. Refresh leave list after action completes

## Error Handling

All operations include:
- Input validation (dates, required fields)
- Try-catch blocks with proper error logging
- User-friendly error messages via toast
- Proper HTTP status codes
- Database constraint checking

## UI/UX Features

- **Modern Design**: Clean cards with color coding (amber for pending, green for accepted, red for rejected)
- **Clear Status**: Visual indicators show change status at a glance
- **Simple Flow**: Max 3 clicks to accept/reject changes
- **Toast Feedback**: Real-time notifications for all actions
- **Counter Proposal**: Easy mechanism for staff to propose alternatives
- **Responsive**: Works on mobile and desktop

## Integration Checklist

- [ ] Create `leave_change_proposals` table in database
- [ ] Copy component files to `components/leave/`
- [ ] Copy API route to `app/api/leave/change-proposal/`
- [ ] Add "Propose Date Changes" button to manager's leave view
- [ ] Add change notification display to staff's leave view
- [ ] Test all flows: propose → accept, reject, counter-propose
- [ ] Verify toast notifications display correctly
- [ ] Test error scenarios (invalid dates, missing fields)
