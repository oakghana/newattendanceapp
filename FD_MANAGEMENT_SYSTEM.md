# Fixed Deposit (FD) Management System

## Overview

This document describes the Fixed Deposit (FD) Management System integrated into the loan application. The system automates FD calculations and enables a workflow where Accounts Loan Office staff can enter FD information, which is then reviewed and approved by Accounts Executives before being forwarded to the HR Loan Office.

## System Architecture

### Components

#### 1. **FD Entry Form** (`components/loan/fd-entry-form.tsx`)
- **Purpose**: Allows Accounts Loan Office to enter staff FD information
- **Features**:
  - Staff information input (name, staff number, department)
  - Loan details (amount, recovery period, annual salary)
  - Real-time automatic calculations
  - Affordability analysis display
  - Document upload support
  - Form validation

**Key Features**:
- Automatic debounce-based calculation triggering (500ms)
- Real-time display of calculation results
- Visual affordability indicators (color-coded alerts)
- Monthly repayment and total recovery value calculations
- Comprehensive calculation summary display

#### 2. **FD Calculation API** (`app/api/loan/fd-review/calculate/route.ts`)
- **Purpose**: Performs real-time FD calculations
- **Endpoint**: `POST /api/loan/fd-review/calculate`
- **Input Parameters**:
  - `loan_amount_ghc`: Loan amount in Ghana Cedis
  - `recovery_period_months`: Recovery period in months
  - `annual_salary_ghc`: Annual salary in Ghana Cedis

**Output**:
```json
{
  "success": true,
  "data": {
    "monthly_repayment_amount": 1287.50,
    "total_recovery_value": 15450.00,
    "affordability_percentage": 28.45,
    "affordability_status": "affordable",
    "calculation_memo": "Detailed calculation report...",
    "is_valid": true,
    "errors": []
  }
}
```

**Affordability Status Determination**:
- **Affordable** (≤ 30%): Monthly repayment is ≤ 30% of monthly salary
- **At Risk** (31-50%): Monthly repayment is 31-50% of monthly salary
- **Unaffordable** (> 50%): Monthly repayment exceeds 50% of monthly salary

#### 3. **FD Calculation Summary Component** (`components/loan/fd-calculation-summary.tsx`)
- **Purpose**: Displays calculated FD values in a professional format
- **Props**:
  - `loanAmount`: Loan amount
  - `recoveryPeriodMonths`: Recovery period
  - `annualSalary`: Annual salary
  - `monthlyRepayment`: Calculated monthly repayment
  - `totalRecoveryValue`: Total recovery value
  - `affordabilityPercentage`: Affordability ratio percentage
  - `affordabilityStatus`: Status badge
  - `calculationMemo`: Detailed memo (optional)
  - `showMemo`: Show detailed memo (optional)

**Display Elements**:
- Color-coded status badges
- Gradient-colored calculation cards
- Affordability analysis grid
- Detailed calculation report (optional)
- Guidelines for affordability thresholds

#### 4. **FD Audit Log Component** (`components/loan/fd-audit-log.tsx`)
- **Purpose**: Displays action history for each FD request
- **Features**:
  - Chronological audit trail
  - Action type indicators (Submitted, Approved, Rejected, Viewed, Forwarded)
  - Timestamp for each action
  - User and IP tracking
  - Notes and decision details

**Supported Action Types**:
- `submitted`: FD request submitted by Loan Office
- `approved`: FD approved by Accounts Executive
- `rejected`: FD rejected by Accounts Executive
- `viewed`: FD viewed by user
- `forwarded`: FD forwarded to HR Office

#### 5. **Loan Office FD Tab** (`components/loan/loan-office-fd-tab.tsx`)
- **Purpose**: Provides Accounts Loan Office with FD management interface
- **Tabs**:
  - **Pending Review**: FD requests awaiting Accounts Executive review
  - **Completed**: Approved or rejected FD requests

**Features**:
- Create new FD requests via dialog form
- View FD details with all calculations
- Track FD status through workflow
- Refresh/reload FD list

#### 6. **Accounts Executive FD Dashboard** (`components/loan/accounts-executive-fd-dashboard.tsx`)
- **Purpose**: Enables Accounts Executives to review and approve/reject FD requests
- **Features**:
  - Queue of pending FD reviews
  - FD details display
  - Approval/Rejection decision interface
  - Verification memo input
  - Real-time refresh of pending queue

## Database Schema

### loan_fd_review Table

**Original Fields**:
- `id`: UUID primary key
- `loan_request_id`: Reference to loan request
- `staff_user_id`: Staff user reference
- `leave_type`: Leave/loan type
- `leave_start_date`: Start date
- `leave_end_date`: End date
- `submitted_by_user_id`: Loan Office user who submitted
- `fd_value`: FD value
- `supporting_docs_url`: Document URL
- `submission_date`: Date submitted
- `submission_memo`: Loan Office notes
- `reviewed_by_user_id`: Accounts Executive who reviewed
- `review_status`: Status (pending_review, approved, rejected)
- `review_decision`: Decision notes
- `fd_verification_memo`: Verification memo
- `review_date`: Review date
- `hr_office_notified_date`: HR notification date
- `hr_office_review_status`: HR review status

**New Calculation Fields** (Added by migration 097):
- `loan_amount_ghc`: Loan amount in GHc
- `recovery_period_months`: Recovery period in months
- `annual_salary_ghc`: Annual salary in GHc
- `monthly_repayment_amount`: Calculated monthly repayment
- `interest_rate`: Interest rate (defaults to 0)
- `total_recovery_value`: Total recovery value
- `affordability_status`: Affordability status (pending, affordable, at_risk, unaffordable)
- `affordability_percentage`: Affordability percentage
- `fd_calculation_memo`: Detailed calculation memo

### loan_fd_review_audit Table

- `id`: UUID primary key
- `fd_review_id`: Reference to FD review
- `action_by_user_id`: User who performed action
- `action_type`: Type of action
- `action_timestamp`: When action occurred
- `ip_address`: IP address of user
- `user_agent`: Browser user agent
- `notes`: Action notes
- `calculation_details`: Calculation JSONB (optional)

## API Routes

### 1. FD Calculation Endpoint
**POST** `/api/loan/fd-review/calculate`

Performs real-time calculations for FD form.

**Request**:
```json
{
  "loan_amount_ghc": 15450,
  "recovery_period_months": 12,
  "annual_salary_ghc": 45360
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "monthly_repayment_amount": 1287.50,
    "total_recovery_value": 15450,
    "affordability_percentage": 28.45,
    "affordability_status": "affordable",
    "calculation_memo": "...",
    "is_valid": true,
    "errors": []
  }
}
```

### 2. FD Review List Endpoint
**GET** `/api/loan/fd-review?status=pending_review&limit=50`

Fetches FD reviews based on user role and status.

**Response**:
```json
{
  "success": true,
  "reviews": [...],
  "count": 5
}
```

**Role-Based Access**:
- **Accounts Executive**: Sees pending reviews
- **Loan Office**: Sees approved, rejected, and pending_hr_action
- **Admin**: Sees all reviews

### 3. FD Review Create Endpoint
**POST** `/api/loan/fd-review`

Creates a new FD review when Loan Office submits.

**Request**:
```json
{
  "loan_request_id": "...",
  "staff_user_id": "...",
  "fd_value": 15450,
  "loan_amount_ghc": 15450,
  "recovery_period_months": 12,
  "annual_salary_ghc": 45360,
  "monthly_repayment_amount": 1287.50,
  "total_recovery_value": 15450,
  "affordability_percentage": 28.45,
  "affordability_status": "affordable",
  "fd_calculation_memo": "...",
  "submission_memo": "Staff notes...",
  "supporting_docs_url": "https://..."
}
```

### 4. FD Review Update Endpoint
**PATCH** `/api/loan/fd-review`

Updates FD review (Accounts Executive approval/rejection).

**Request**:
```json
{
  "review_id": "...",
  "review_status": "approved",
  "fd_verification_memo": "Approved after review",
  "review_decision": "Approved - meets all criteria"
}
```

### 5. FD Audit Log Endpoint
**GET** `/api/loan/fd-review/[id]/audit`

Fetches audit trail for specific FD review.

**Response**:
```json
{
  "success": true,
  "audit": [
    {
      "id": "...",
      "fd_review_id": "...",
      "action_by_user_id": "...",
      "action_type": "submitted",
      "action_timestamp": "2026-07-30T10:30:00Z",
      "notes": "FD request submitted for staff..."
    }
  ],
  "count": 1
}
```

## Workflow

### Step 1: Accounts Loan Office Entry
1. Loan Office staff navigates to FD management
2. Clicks "New FD Request"
3. Enters staff information, loan amount, recovery period, and salary
4. System automatically calculates:
   - Monthly repayment = Loan Amount / Recovery Period
   - Affordability % = (Monthly Repayment / Monthly Salary) × 100
   - Affordability Status based on percentage
5. Reviews calculated summary
6. Submits FD request to Accounts Executive
7. System logs action in audit trail

### Step 2: Accounts Executive Review
1. Accounts Executive views pending FD requests
2. Reviews all FD details and calculations
3. Can approve or reject the request
4. Adds verification memo and decision notes
5. System logs approval/rejection in audit trail
6. If approved, HR Loan Office is notified

### Step 3: HR Loan Office Processing
1. HR Loan Office receives notification
2. Views approved FD requests
3. Processes FD for further action or loan disbursement
4. Can view full audit trail of all decisions

## Database Migration

### Migration File
`supabase/migrations/097_fd_calculations_fields.sql`

**Key Changes**:
1. Adds calculation fields to `loan_fd_review` table
2. Creates trigger function for automatic calculations
3. Replaces calculations trigger with enhanced version
4. Creates `fd_calculation_summary` view
5. Adds performance indexes

**Trigger Function**: `update_fd_calculations()`
- Automatically calculates monthly repayment
- Determines affordability status
- Generates calculation memo
- Updates timestamp on change

## Integration with Existing System

### Role-Based Access Control
- **Accounts Loan Office**: Can create and view FD requests
- **Accounts Executive**: Can review and approve/reject FD requests
- **HR Loan Office**: Can view approved FD requests (read-only)
- **Admin**: Can access all FD records

### Loan Request Integration
- FD requests are linked to `loan_requests` via `loan_request_id`
- FD status affects loan request workflow
- Approvals/rejections are logged in audit trail

### Notification System
- Email sent to Accounts Executive when new FD request is submitted
- Email sent to HR Loan Office when FD is approved
- Optional email to staff if FD is rejected

## Error Handling

### Validation Errors
- Missing required fields
- Invalid numeric values (negative or zero amounts)
- Invalid date ranges
- Missing user authentication

### Calculation Errors
- Division by zero protection
- Invalid affordability calculations
- Null value handling

### Database Errors
- Connection failures
- Permission denied
- Data integrity violations

## Performance Considerations

1. **Calculation Debouncing**: 500ms debounce on form input to reduce unnecessary calculations
2. **Database Indexes**: Performance indexes on frequently queried fields:
   - `loan_fd_review_affordability`
   - `loan_fd_review_calculated`
   - `loan_fd_review_status`
3. **Query Optimization**: Only fetch necessary fields based on user role
4. **Audit Logging**: Async audit logging to prevent blocking requests

## Security Measures

1. **Role-Based Access Control**: Strict role validation on all endpoints
2. **User Authentication**: All endpoints require authenticated user
3. **Row-Level Security**: Database policies restrict access based on role
4. **Input Validation**: All numeric inputs validated and sanitized
5. **Audit Trail**: All actions logged for compliance

## Testing the System

### Create New FD Request
1. Log in as Accounts Loan Office user
2. Navigate to FD Management
3. Click "New FD Request"
4. Fill in staff details:
   - Name: Ahulu Elvis Ngmetey
   - Number: 1150127
   - Department: Audit
5. Fill in loan details:
   - Amount: 15,450 GHc
   - Recovery Period: 12 months
   - Salary: 45,360 GHc
6. Review calculations (should show Affordable)
7. Submit request

### Approve FD Request (as Accounts Executive)
1. Log in as Accounts Executive user
2. View pending FD requests
3. Review FD details and calculations
4. Add approval memo
5. Click Approve
6. Verify audit trail shows approval

### View Audit Trail
1. Navigate to completed FD request
2. Scroll to audit log section
3. Verify all actions are logged with timestamps

## Troubleshooting

### Calculations Not Updating
- Check browser console for errors
- Verify network request to `/api/loan/fd-review/calculate`
- Check that all required fields have values

### FD Request Not Submitting
- Verify calculations are valid (`is_valid: true`)
- Check user role has loan_office permission
- Verify loan_request_id and staff_user_id are valid

### Audit Log Not Showing
- Verify FD request exists in database
- Check user has permission to view audit logs
- Verify audit entries were created by checking database directly

## Future Enhancements

1. **Interest Calculations**: Add support for interest-based calculations
2. **Advanced Affordability Rules**: More complex affordability determination
3. **Bulk Import**: Import FD requests from spreadsheet
4. **Reporting**: Generate FD approval/rejection reports
5. **API Integration**: Export/import with external systems
6. **Mobile Support**: Mobile-friendly FD entry and review

## Support

For issues or questions about the FD Management System, please contact:
- **Development**: v0 Team
- **Support**: See support documentation

---

**Last Updated**: 2026-07-30
**Version**: 1.0
