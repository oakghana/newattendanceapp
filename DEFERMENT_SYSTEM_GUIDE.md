# Deferment Request System - Implementation Guide

## Overview

A modern, sleek deferment request system has been implemented with a three-tier workflow:
**Staff → HOD/RM Endorsement → HR Leave Office Approval**

## Key Features

### 1. **Submit New Deferment Request** (`SubmitNewDefermentRequest.tsx`)
A beautiful modal dialog where users can submit deferment requests for approved leave.

**Access:**
- **Staff**: Can only see and select their own approved leave requests
- **HOD/RM**: Can see and select all their department staff's approved leave requests
- **HR**: Can submit deferment requests on behalf of staff

**Features:**
- Live search filtering for leave requests
- Leave duration display
- Year-to-year deferment selection (supports 5 future years)
- Optional reason for deferment
- Real-time validation
- Success confirmation with automatic modal close

### 2. **Deferment Workflow**

#### Status Flow:
```
Staff submits request
    ↓
pending_hod_endorsement (awaits HOD/RM review)
    ↓
HOD/RM endorses → pending_hr_approval
                or rejects → hod_rejected
    ↓
HR Leave Office processes
    ↓
hr_approved (approved) or hr_rejected (rejected)
```

#### Key Points:
- Staff requests automatically go to their HOD/RM for endorsement first
- HOD/RM can approve (forwards to HR) or reject
- Only approved requests by HOD/RM are sent to HR Leave Office
- HR makes final decision and generates approval memo if approved

### 3. **HOD/RM Endorsement Modal** (`HodDefermentEndorsementModal.tsx`)

HOD/RM can review pending deferment requests with full context:
- Staff information (name, ID, position, department)
- Leave details (dates, type, duration, reason)
- Deferment details (requested year, submission date)
- Decision options: Approve & Forward to HR or Reject
- Optional notes/rejection reasons

### 4. **Deferment Requests Tracking** (`DefermentRequestsTracking.tsx`)

Comprehensive tracking dashboard with role-based views:

**For Staff:**
- View their own deferment requests
- Tabs: All, Pending, Approved, Rejected
- See status at each stage
- Notes from HOD/RM if rejected

**For HOD/RM:**
- Pending endorsements awaiting their review
- Quick access "Review & Endorse" button
- Staff member details and leave info

**For HR Leave Office:**
- Pending requests awaiting approval
- Tabs: Pending, Approved, Rejected, All
- Complete audit trail
- Status badges with icons

### 5. **API Endpoints**

#### POST `/api/leave/deferment`
Submit a new deferment request
- Determines initial status based on requester role
- Staff requests: `pending_hod_endorsement`
- Manager requests: `pending_hr_approval`

#### PATCH `/api/leave/deferment/hod-endorsement`
HOD/RM endorsement decision
- Update deferment status
- Record HOD/RM decision and notes
- Move to HR approval if approved

#### GET `/api/leave/deferment/hod-endorsement`
Fetch pending deferment requests for HOD/RM

### 6. **Database Schema**

The `leave_deferment_requests` table tracks:
- `id` - Unique identifier
- `user_id` - Staff member whose leave is being deferred
- `leave_plan_request_id` - Associated approved leave
- `requested_deferment_year` - Target year
- `requested_deferment_period` - Format: "2027/2028"
- `reason` - Deferment reason
- `status` - Current workflow status
- `hod_decision` - HOD/RM decision (approved/rejected)
- `hod_decision_note` - HOD/RM notes
- `hod_reviewed_by` - HOD/RM user ID
- `hod_reviewed_at` - HOD/RM review timestamp
- `hr_office_decision` - HR final decision
- `hr_office_decision_note` - HR notes
- `hr_office_reviewed_by` - HR user ID
- `hr_office_reviewed_at` - HR review timestamp
- `created_at` - Submission timestamp
- `updated_at` - Last update timestamp

## UI Integration

### Leave Management Dashboard
The deferment system is integrated into the Leave Management Module with a new tab:
- **Tab Name**: "Deferment & Recall"
- **Icon**: Shuffle icon (orange gradient)
- **Access**: Available to Staff, HOD/RM, and HR

### Tab Location
The tab appears in the main leave management module between "Memo Management" and "Balance & Calendar" tabs.

## Components Tree

```
LeaveManagementModuleClient
├── Tabs with Deferment & Recall tab
└── TabsContent
    └── DefermentRequestsTracking
        ├── SubmitNewDefermentRequest (modal)
        └── HodDefermentEndorsementModal (modal)
```

## Usage Instructions

### For Staff Members:
1. Navigate to Leave Management → Deferment & Recall tab
2. Click "Pending" tab to see current requests
3. View tracking of all your deferment requests
4. Wait for HOD/RM and HR approval

### For HOD/RM:
1. Navigate to Leave Management → Deferment & Recall tab
2. View pending endorsements for your staff
3. Click "Review & Endorse" on a request
4. Provide decision (approve/reject) and optional notes
5. Approved requests are forwarded to HR automatically

### For HR Leave Office:
1. Navigate to Leave Management → Deferment & Recall tab
2. View "Pending" tab for requests awaiting approval
3. Review staff and leave details
4. Make final decision (approve/reject)
5. Generate approval memo if approved

## Design Features

### Visual Design
- **Color Scheme**: Modern gradients (orange for deferment)
- **Status Indicators**: Color-coded badges with icons
- **Typography**: Clean, readable hierarchy
- **Spacing**: Generous whitespace for readability
- **Responsiveness**: Mobile-first design

### Interactive Elements
- Smooth transitions and hover effects
- Loading states with spinners
- Success/error alerts
- Disabled states for invalid actions
- Real-time search filtering

### Accessibility
- Semantic HTML
- ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly
- Clear focus indicators

## Files Created/Modified

### Created:
1. `/components/leave-management/submit-new-deferment-request.tsx` - Main deferment modal
2. `/components/leave-management/hod-deferment-endorsement-modal.tsx` - HOD endorsement modal
3. `/components/leave-management/deferment-requests-tracking.tsx` - Tracking dashboard
4. `/app/api/leave/deferment/hod-endorsement/route.ts` - HOD endorsement API

### Modified:
1. `/app/api/leave/deferment/route.ts` - Updated to include role-based status logic
2. `/app/dashboard/leave-management/leave-management-module-client.tsx` - Added Deferment & Recall tab
3. `/app/dashboard/leave-management/leave-management-client.tsx` - Added modal integration

## Status Reference

| Status | Stage | Next Action |
|--------|-------|-------------|
| `pending_hod_endorsement` | Staff submitted, awaiting HOD/RM review | HOD/RM endorsement |
| `pending_hr_approval` | HOD/RM approved, awaiting HR decision | HR approval/rejection |
| `approved`/`hr_approved` | HR approved | Memo generation |
| `hod_rejected` | HOD/RM rejected | Request ends |
| `hr_rejected` | HR rejected | Request ends |

## Error Handling

The system includes comprehensive error handling:
- Network error recovery
- Validation on client and server
- User-friendly error messages
- Loading state management
- Permission checks at each stage

## Future Enhancements

Potential improvements:
1. Email notifications at each stage
2. Automatic memo generation and distribution
3. Bulk deferment requests
4. Deferment expiry management
5. Leave year calendar visualization
6. Advanced filtering and sorting options
7. Export/report generation

## Troubleshooting

### Issue: Approved leaves not showing
**Solution**: Ensure leave request status is marked as "approved" or "hr_approved" in the database.

### Issue: HOD/RM can't see staff requests
**Solution**: Verify HOD/RM linkage exists in the database (loan_hod_linkages table).

### Issue: Modal not opening
**Solution**: Check browser console for errors, ensure `showSubmitDefermentModal` state is properly managed.

### Issue: Status not updating
**Solution**: Verify API permissions and Supabase RLS policies allow the operation.

## Testing Checklist

- [ ] Staff can submit deferment requests
- [ ] Staff only see their own approved leaves
- [ ] HOD/RM see all their department staff's leaves
- [ ] HOD/RM can endorse/reject requests
- [ ] HR can see pending requests
- [ ] Status updates correctly at each stage
- [ ] Notifications are sent (when implemented)
- [ ] Mobile responsive design works
- [ ] Error messages display properly
- [ ] Loading states show correctly
