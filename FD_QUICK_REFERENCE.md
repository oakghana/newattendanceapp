# FD Management System - Quick Reference Guide

## Components Overview

### 1. Form Components

#### FDEntryForm
```tsx
import { FDEntryForm } from '@/components/loan/fd-entry-form'

<FDEntryForm 
  staffId="optional-staff-id"
  onSubmitSuccess={(reviewId) => {
    console.log('Submitted FD review:', reviewId)
  }}
/>
```

**Features**:
- Real-time calculation as user types (500ms debounce)
- Form validation
- Affordability display
- Submit to Accounts Executive

#### FDCalculationSummary
```tsx
import { FDCalculationSummary } from '@/components/loan/fd-calculation-summary'

<FDCalculationSummary
  loanAmount={15450}
  recoveryPeriodMonths={12}
  annualSalary={45360}
  monthlyRepayment={1287.50}
  totalRecoveryValue={15450}
  affordabilityPercentage={28.45}
  affordabilityStatus="affordable"
  calculationMemo="Optional detailed memo"
  showMemo={false}
/>
```

**Props**:
- `loanAmount`: number
- `recoveryPeriodMonths`: number
- `annualSalary`: number
- `monthlyRepayment`: number
- `totalRecoveryValue`: number
- `affordabilityPercentage`: number (0-100)
- `affordabilityStatus`: 'affordable' | 'at_risk' | 'unaffordable'
- `calculationMemo?`: string (optional)
- `showMemo?`: boolean (default: false)

#### FDAuditLog
```tsx
import { FDAuditLog } from '@/components/loan/fd-audit-log'

<FDAuditLog fdReviewId="fd-review-uuid" />
```

**Props**:
- `fdReviewId`: string - UUID of FD review

#### LoanOfficeFDTab
```tsx
import { LoanOfficeFDTab } from '@/components/loan/loan-office-fd-tab'

<LoanOfficeFDTab userId="current-user-id" />
```

**Props**:
- `userId`: string - Current user ID

#### AccountsExecutiveFDDashboard
```tsx
import { AccountsExecutiveFDDashboard } from '@/components/loan/accounts-executive-fd-dashboard'

<AccountsExecutiveFDDashboard userId="current-user-id" />
```

**Props**:
- `userId`: string - Current user ID

---

## API Endpoints

### Calculate FD Values
```bash
POST /api/loan/fd-review/calculate

Request:
{
  "loan_amount_ghc": 15450,
  "recovery_period_months": 12,
  "annual_salary_ghc": 45360
}

Response:
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

### List FD Reviews
```bash
GET /api/loan/fd-review?status=pending_review&limit=50

Response:
{
  "success": true,
  "reviews": [...],
  "count": 5
}
```

**Status Options**:
- `pending_review`: Awaiting Accounts Executive
- `approved`: Approved by Accounts Executive
- `rejected`: Rejected by Accounts Executive
- `pending_hr_action`: Approved, pending HR processing

### Create FD Review
```bash
POST /api/loan/fd-review

Request:
{
  "loan_request_id": "uuid",
  "staff_user_id": "uuid",
  "fd_value": 15450,
  "loan_amount_ghc": 15450,
  "recovery_period_months": 12,
  "annual_salary_ghc": 45360,
  "monthly_repayment_amount": 1287.50,
  "total_recovery_value": 15450,
  "affordability_percentage": 28.45,
  "affordability_status": "affordable",
  "fd_calculation_memo": "...",
  "submission_memo": "Optional notes",
  "supporting_docs_url": "https://..."
}
```

### Update FD Review (Approve/Reject)
```bash
PATCH /api/loan/fd-review

Request:
{
  "review_id": "uuid",
  "review_status": "approved",
  "fd_verification_memo": "Approved memo",
  "review_decision": "Approved - meets all criteria"
}
```

**review_status Options**:
- `approved`: Approve the FD request
- `rejected`: Reject the FD request

### Get FD Audit Trail
```bash
GET /api/loan/fd-review/[id]/audit

Response:
{
  "success": true,
  "audit": [
    {
      "id": "uuid",
      "fd_review_id": "uuid",
      "action_by_user_id": "uuid",
      "action_type": "submitted",
      "action_timestamp": "2026-07-30T10:30:00Z",
      "notes": "FD request submitted"
    }
  ],
  "count": 1
}
```

---

## Calculation Examples

### Example 1: Affordable FD
```
Loan Amount: 15,000 GHc
Recovery Period: 12 months
Annual Salary: 45,000 GHc

Calculations:
- Monthly Salary = 45,000 / 12 = 3,750 GHc
- Monthly Repayment = 15,000 / 12 = 1,250 GHc
- Affordability % = (1,250 / 3,750) × 100 = 33.33%
- Status: AT_RISK (31-50%)
```

### Example 2: At Risk FD
```
Loan Amount: 20,000 GHc
Recovery Period: 12 months
Annual Salary: 45,000 GHc

Calculations:
- Monthly Salary = 45,000 / 12 = 3,750 GHc
- Monthly Repayment = 20,000 / 12 = 1,666.67 GHc
- Affordability % = (1,666.67 / 3,750) × 100 = 44.44%
- Status: AT_RISK (31-50%)
```

### Example 3: Unaffordable FD
```
Loan Amount: 30,000 GHc
Recovery Period: 12 months
Annual Salary: 45,000 GHc

Calculations:
- Monthly Salary = 45,000 / 12 = 3,750 GHc
- Monthly Repayment = 30,000 / 12 = 2,500 GHc
- Affordability % = (2,500 / 3,750) × 100 = 66.67%
- Status: UNAFFORDABLE (> 50%)
```

---

## Database Tables

### loan_fd_review
**Key Calculation Fields**:
- `loan_amount_ghc`: DECIMAL(12,2)
- `recovery_period_months`: INTEGER
- `annual_salary_ghc`: DECIMAL(12,2)
- `monthly_repayment_amount`: DECIMAL(12,2) [AUTO]
- `affordability_percentage`: DECIMAL(5,2) [AUTO]
- `affordability_status`: VARCHAR(50) [AUTO]
- `total_recovery_value`: DECIMAL(12,2) [AUTO]
- `fd_calculation_memo`: TEXT [AUTO]

**[AUTO]** = Automatically calculated by database trigger

### loan_fd_review_audit
**Key Fields**:
- `action_type`: 'submitted' | 'approved' | 'rejected' | 'viewed' | 'forwarded'
- `action_timestamp`: TIMESTAMP
- `action_by_user_id`: UUID
- `notes`: TEXT

---

## Integration Checklist

- [ ] Database migration applied
- [ ] FD entry form integrated in Loan Office dashboard
- [ ] Calculations API tested
- [ ] Accounts Executive dashboard displays pending FD
- [ ] Approve/Reject functionality working
- [ ] Audit trail logging correctly
- [ ] HR Office notifications sent
- [ ] Role-based access verified
- [ ] User testing completed
- [ ] Production deployment

---

## Common Issues & Solutions

### Issue: Calculations not updating
**Solution**: Check browser console for errors, verify network tab shows requests to `/api/loan/fd-review/calculate`

### Issue: FD request not submitting
**Solution**: Ensure all required fields filled, calculations are valid (`is_valid: true`), user has loan_office role

### Issue: Audit log shows no entries
**Solution**: Verify FD review exists in database, check user role has audit view permission

### Issue: Affordability status incorrect
**Solution**: Verify calculation formula: (Monthly Repayment / Monthly Salary) × 100, check affordability thresholds

---

## Role Permissions

### Accounts Loan Office
- ✓ Create FD requests
- ✓ View own FD submissions
- ✓ See Accounts Executive decisions
- ✗ Cannot approve/reject FD

### Accounts Executive
- ✓ View pending FD requests
- ✓ Approve/reject FD requests
- ✓ Add verification memos
- ✓ View all FD details
- ✗ Cannot create FD (Loan Office role required)

### HR Loan Office
- ✓ View approved FD requests
- ✓ Access audit trails
- ✓ Process approved FD
- ✗ Cannot approve/reject FD

### Admin
- ✓ Full access to all FD records
- ✓ Can override decisions
- ✓ Full audit trail access

---

## Useful SQL Queries

### Get all pending FD reviews
```sql
SELECT * FROM loan_fd_review 
WHERE review_status = 'pending_review'
ORDER BY submission_date ASC;
```

### Get FD by affordability status
```sql
SELECT * FROM loan_fd_review 
WHERE affordability_status = 'affordable'
ORDER BY submission_date DESC;
```

### Get audit trail for specific FD
```sql
SELECT * FROM loan_fd_review_audit
WHERE fd_review_id = 'specific-uuid'
ORDER BY action_timestamp ASC;
```

### Calculate FD statistics
```sql
SELECT 
  affordability_status,
  COUNT(*) as count,
  AVG(monthly_repayment_amount) as avg_repayment,
  AVG(affordability_percentage) as avg_affordability_pct
FROM loan_fd_review
GROUP BY affordability_status;
```

---

## File Locations

**Components**:
- `/components/loan/fd-entry-form.tsx`
- `/components/loan/fd-calculation-summary.tsx`
- `/components/loan/fd-audit-log.tsx`
- `/components/loan/loan-office-fd-tab.tsx`
- `/components/loan/accounts-executive-fd-dashboard.tsx`

**API Routes**:
- `/app/api/loan/fd-review/route.ts` (GET, POST, PATCH)
- `/app/api/loan/fd-review/calculate/route.ts` (POST)
- `/app/api/loan/fd-review/[id]/audit/route.ts` (GET)

**Database**:
- `/supabase/migrations/097_fd_calculations_fields.sql`

**Documentation**:
- `/FD_MANAGEMENT_SYSTEM.md` (Complete documentation)
- `/FD_IMPLEMENTATION_SUMMARY.md` (Implementation overview)
- `/FD_QUICK_REFERENCE.md` (This file)

---

**Last Updated**: 2026-07-30
**Version**: 1.0
