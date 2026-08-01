# FD Approval Workflow for Accounts Executive

## Overview

The FD Approval Workflow enables Accounts Executives to review and approve Financial Data (FD) calculations submitted by the Loan Office before they proceed to the HR Loan Office for final processing.

## Workflow Architecture

### Three-Stage FD Processing Pipeline

```
Loan Office (Creates FD)
        ↓
Accounts Executive (Reviews & Approves/Rejects)
        ↓
HR Loan Office (Final Processing if approved)
        ↓
Loan Disbursement
```

## User Interface

### FD Approval Tab

- **Location**: Loan App Dashboard → "FD Approval" tab
- **Visibility**: Only visible to users with `accounts_executive` role
- **Purpose**: Central hub for reviewing pending FD calculations

### Two-Path Review System

#### Path 1: Good FD (Score ≥ 39)

```
Display:
├─ Normal amber border and "Pending" badge
├─ FD Value clearly displayed
├─ FD Score in green (✓ acceptable)
├─ Supporting documentation link
└─ "Review & Approve" button

Action: Click "Review & Approve"
├─ Opens verification dialog
├─ Allows Accounts Executive to enter verification memo
├─ Requires decision notes before approval
└─ On approval: Sent to HR Loan Office with memo
```

#### Path 2: Poor FD (Score < 39)

```
Display:
├─ Red border highlighting poor quality
├─ "Poor FD" badge in red
├─ "Action Required" indicator
├─ FD Score in red (✗ rejected)
├─ Warning box explaining threshold failure
└─ "Auto-Reject Poor FD" button

Action: Click "Auto-Reject Poor FD"
├─ Automatic rejection message sent
├─ Message: "Auto-rejected: FD score below acceptable threshold (< 39)"
├─ Returned to Loan Office immediately
└─ No manual review required
```

## Data Flow

### FD Review Record

```typescript
interface FDReview {
  id: string
  loan_request_id: string
  staff_user_id: string
  leave_type: string
  leave_start_date: string
  leave_end_date: string
  fd_value: number                    // Amount claimed
  fd_score?: number                   // Quality score (0-100)
  fd_good?: boolean                   // Pre-assessment flag
  supporting_docs_url: string
  submission_date: string
  submission_memo: string             // Loan Office notes
  review_status: 'pending_review' | 'approved' | 'rejected'
  fd_verification_memo: string        // Accounts Exec notes
  review_decision: string             // Approval/rejection reason
}
```

### FD Quality Determination

```javascript
const isPoorFD = (review) => {
  return (
    review.fd_good === false ||  // Explicitly marked poor
    (typeof review.fd_score === 'number' && review.fd_score < 39)  // Below threshold
  )
}
```

## API Endpoints

### GET /api/loan/fd-review

**Purpose**: Fetch pending FD reviews for Accounts Executive

**Query Parameters**:
- `status`: 'pending_review' | 'approved' | 'rejected' (default: 'pending_review')
- `limit`: number (default: 50)

**Response**:
```json
{
  "success": true,
  "reviews": [...],
  "count": 15
}
```

**Access Control**: Accounts Executive, Loan Office, Admin

### PATCH /api/loan/fd-review

**Purpose**: Submit FD approval or rejection decision

**Request Body**:
```json
{
  "review_id": "uuid",
  "review_status": "approved" | "rejected",
  "fd_verification_memo": "Verification findings...",
  "review_decision": "Reason for decision..."
}
```

**Response**:
```json
{
  "success": true,
  "review": {...},
  "message": "FD request approved. HR Leave Office will be notified."
}
```

**Access Control**: Accounts Executive, Admin only

## Automatic Rejection Logic

### Trigger Conditions

Poor FD is automatically detected when:

1. **FD Score Below Threshold**: `fd_score < 39`
2. **Explicit Poor Flag**: `fd_good === false`

### Auto-Rejection Process

```
1. System detects poor FD
2. Display alert box with score and threshold
3. Show "Auto-Reject Poor FD" button
4. On click:
   ├─ PATCH /api/loan/fd-review with status: 'rejected'
   ├─ Auto-generates rejection memo (score-based reason)
   ├─ Records decision with audit trail
   ├─ Notifies Loan Office of rejection
   └─ Triggers Loan Office resubmission workflow
```

### Rejection Notification

**Message Format**:
```
Title: "Auto-Rejected"
Description: "Poor FD (Score: 38) automatically rejected and returned to Loan Office"
Message: "Auto-rejected: FD score below acceptable threshold (< 39). 
         Loan Office must resubmit with corrected calculations."
```

## Manual Approval Process

### Step-by-Step for Good FD

1. **Select Review**: Click "Review & Approve" button on good FD card
2. **Verification Dialog Opens**:
   - Shows leave period
   - Displays FD value claimed
   - Shows original Loan Office memo
   - Provides fields for verification findings
3. **Enter Memos**:
   - **FD Verification Memo**: Document your verification calculations
   - **Decision Notes**: Explain why you're approving
4. **Validation**: Both fields required before approval button enables
5. **Submit Approval**: Click "Approve" button
6. **Outcome**:
   - Toast: "FD request approved and sent to HR Leave Office"
   - Dashboard refreshes
   - Record moves to approved status
   - HR Loan Office notified

### Rejection (Manual)

For good FD scores that need rejection (e.g., missing documentation):

1. Open review dialog
2. Enter **Decision Notes** explaining rejection reason
3. Click "Reject" button
4. Record status changes to 'rejected'
5. Loan Office notified for resubmission

## Dashboard Statistics

The FD Approval tab displays:

- **Total Pending FD Reviews**: Count of all pending_review status records
- **Good FD**: Ready for approval (green indicator)
- **Poor FD**: Requiring auto-rejection (red indicator)
- **Submission Date**: When Loan Office submitted
- **FD Score**: Visual indicator of quality

## Audit Trail

All FD approval activities are logged:

```
Table: loan_fd_review_audit
├─ fd_review_id: which FD was reviewed
├─ action_by_user_id: which Accounts Exec took action
├─ action_type: 'approved' | 'rejected' | 'submitted'
├─ notes: detailed reason/memo
└─ created_at: timestamp
```

## Integration with Loan Processing

### After Approval

Approved FD proceeds through this flow:

```
FD Approved by Accounts Executive
  ↓
Status changed to: 'awaiting_director_hr' or similar
  ↓
Loan forwarded to HR Loan Office
  ↓
HR processes with confidence in FD data
  ↓
Faster approval pathway
```

### After Rejection

Rejected FD goes back to Loan Office:

```
FD Rejected by Accounts Executive
  ↓
Status changed to: 'rejected_fd'
  ↓
Loan Office notified of rejection reason
  ↓
Loan Office resubmits corrected FD
  ↓
Cycle repeats with new FD review
```

## Performance Benefits

1. **Automatic Processing**: Poor FD auto-rejects without human intervention
2. **Reduced Manual Overhead**: Clear FD quality indicators
3. **Faster Approvals**: Good FD gets expedited to HR
4. **Error Prevention**: FD validation before HR processing
5. **Audit Trail**: Complete history of all decisions

## Error Handling

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "No pending FD reviews" | All current FDs processed | Wait for new Loan Office submissions |
| FD score not displaying | Data missing from Loan Office | Contact Loan Office to ensure FD score submitted |
| Can't approve good FD | Memo fields empty | Fill both verification memo and decision notes |
| Auto-reject failed | API error | Retry with "Auto-Reject Poor FD" button |

## Role-Based Access

| Role | View FD Approval Tab | Can Approve | Can Reject | Can See Auto-Reject |
|------|:---:|:---:|:---:|:---:|
| Accounts Executive | ✓ | ✓ | ✓ | ✓ |
| Loan Office | ✗ | ✗ | ✗ | ✗ |
| HR Loan Office | ✗ | ✗ | ✗ | ✗ |
| Admin | ✓ | ✓ | ✓ | ✓ |
| Other Roles | ✗ | ✗ | ✗ | ✗ |

## Technical Implementation

### Component: AccountsExecutiveFDDashboard

**File**: `components/loan/accounts-executive-fd-dashboard.tsx`

**Key Methods**:
- `fetchPendingReviews()`: Loads pending FD records from API
- `isPoorFD(review)`: Detects FD quality issues
- `handleAutoRejectPoorFD()`: Processes automatic rejection
- `handleApprove()`: Processes manual approval
- `handleReject()`: Processes manual rejection

**State Management**:
- `reviews`: Array of FDReview records
- `selectedReview`: Currently opened review in dialog
- `loading`: Fetch loading state
- `submitting`: Submission in progress state

### Integration Point: Loan App Page

**File**: `app/dashboard/loan-app/page.tsx`

**Changes**:
- Import: `AccountsExecutiveFDDashboard` component
- Tab Definition: Add "FD Approval" tab when `isAccountsExecutive === true`
- Tab Content: `<TabsContent value="fd-approval"><AccountsExecutiveFDDashboard /></TabsContent>`

## Future Enhancements

1. **Pending Count Badge**: Display number of pending FDs on tab label
2. **FD Score Analytics**: Dashboard showing FD score distribution
3. **Approval Metrics**: Track approval rate, average review time
4. **FD Templates**: Pre-fill common verification notes
5. **Bulk Operations**: Process multiple FDs at once
6. **Email Notifications**: Auto-email Loan Office on rejection
7. **Appeal Process**: Allow Loan Office to appeal rejections

## Testing Checklist

- [ ] FD Approval tab appears for Accounts Executive users
- [ ] Tab hidden for other roles
- [ ] Good FD (score ≥ 39) shows normal display
- [ ] Poor FD (score < 39) shows red alert
- [ ] Auto-reject button triggers rejection process
- [ ] Review & Approve opens verification dialog
- [ ] Approval saves and notifies HR
- [ ] Rejection saves and notifies Loan Office
- [ ] API returns correct pending FD list
- [ ] Audit trail records all actions

## Deployment Notes

1. Ensure API endpoint `/api/loan/fd-review` is deployed and accessible
2. Verify `loan_fd_review` table exists in database
3. Confirm `loan_fd_review_audit` table for audit trail
4. Test role-based access control for Accounts Executive
5. Load test with large number of pending FDs
