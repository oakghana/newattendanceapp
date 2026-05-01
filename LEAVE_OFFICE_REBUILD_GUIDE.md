# Leave Office Rebuild & Template Implementation Guide
**Date:** May 1, 2026  
**Version:** 1.0

---

## Overview

This guide documents the complete rebuild of the HR Leave Office module with comprehensive templates for leave approval memos and payment drafting to accounts. The system now provides full permissions to HR Leave Office staff without requiring HOD linkage.

---

## 1. Database Changes

### New Tables Created

#### 1.1 `leave_memo_templates`
Stores standardized leave approval memo templates with placeholders.

```sql
CREATE TABLE leave_memo_templates (
  id UUID PRIMARY KEY,
  template_key VARCHAR(100) UNIQUE,  -- e.g., 'annual_leave_approval'
  template_name VARCHAR(255),
  subject_template TEXT,              -- Template with {{placeholders}}
  body_template TEXT,
  cc_recipients TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Default Templates:**
- `annual_leave_approval` - Standard annual leave approval
- `sick_leave_approval` - Sick leave with medical documentation note
- `leave_of_absence_approval` - Extended leave of absence
- `re_change_of_leave_date` - Rescheduled leave dates

#### 1.2 `leave_payment_memos`
Stores payment memos drafted by HR Leave Office for Accounts department.

```sql
CREATE TABLE leave_payment_memos (
  id UUID PRIMARY KEY,
  leave_plan_request_id UUID,
  hr_leave_office_id UUID,
  hr_leave_office_name TEXT,
  memo_subject TEXT,
  memo_body TEXT,
  payment_amount NUMERIC(12, 2),
  payment_currency VARCHAR(3),
  staff_id UUID,
  staff_name TEXT,
  staff_number VARCHAR(50),
  leave_period_start DATE,
  leave_period_end DATE,
  approved_days INTEGER,
  status VARCHAR(30),  -- draft, ready_for_review, reviewed_by_hr, forwarded_to_accounts, acknowledged_by_accounts
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  forwarded_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);
```

#### 1.3 `leave_office_work_log`
Tracks all HR Leave Office activities for audit trail.

```sql
CREATE TABLE leave_office_work_log (
  id UUID PRIMARY KEY,
  hr_leave_office_id UUID,
  hr_leave_office_name TEXT,
  leave_plan_request_id UUID,
  activity_type VARCHAR(50),  -- leave_request_received, days_adjusted, memo_drafted, payment_memo_drafted, etc.
  description TEXT,
  adjustment_details JSONB,
  created_at TIMESTAMPTZ
);
```

### New Columns Added to Existing Tables

#### 1.4 `leave_plan_requests` Payment Fields
```sql
ALTER TABLE leave_plan_requests ADD COLUMN IF NOT EXISTS:
  - payment_due_amount NUMERIC(12, 2)
  - payment_currency VARCHAR(3) DEFAULT 'GHS'
  - payment_reason_for_amount TEXT
  - payment_memo_generated BOOLEAN DEFAULT false
  - payment_memo_forwarded_to_accounts BOOLEAN DEFAULT false
  - payment_memo_forwarded_at TIMESTAMPTZ
  - accounts_acknowledgment_at TIMESTAMPTZ
  - accounts_notes TEXT
```

---

## 2. Permission Changes

### HR Leave Office Role Permissions

**Files Updated:**
- `app/api/leave/request-leave/route.ts` - Removed HOD requirement for HR Leave Office
- `app/dashboard/leave-management/leave-management-client.tsx` - Hidden HOD warning for HR Leave Office
- `scripts/057_hr_leave_office_permissions_update.sql` - Updated RLS policies

**Key Changes:**
✅ HR Leave Office staff can submit leave requests WITHOUT HOD linkage  
✅ HR Leave Office staff have full read/write access to leave_plan_requests  
✅ No "Your leave profile is not linked to a HOD yet" warning shown to HR Leave Office  
✅ HR Leave Office can manage their own leave and others' leave  

### Implementation Details

**In `request-leave/route.ts`:**
```typescript
// Line ~291: Skip HOD check for HR Leave Office staff
const isHrLeaveOffice = normalizedRole === "hr_leave_office"

if (!shouldAutoApprove && !isHrLeaveOffice) {
  // ... HOD linkage checks only for non-HR-Leave-Office staff
}
```

**In `leave-management-client.tsx`:**
```typescript
// Line ~463: Don't show HOD warning to HR Leave Office
{canUseStaffLeaveHub && !hasHodLinkage && userRole !== "hr_leave_office" && (
  <Alert className="border-blue-200 bg-blue-50">
    {/* Warning message */}
  </Alert>
)}
```

---

## 3. Leave Templates

### Available Templates

All templates are defined in `lib/leave-templates.ts` with the following structure:

```typescript
export const leaveTemplates = {
  [template_key]: {
    key: string,
    name: string,
    category: "leave_approval" | "payment_memo",
    subject: string,          // With {{placeholders}}
    body: string,             // With {{placeholders}}
    cc: string,               // CC recipients
    placeholder_help: Record<string, string>  // Help text for each placeholder
  }
}
```

### 3.1 Leave Approval Templates

#### Annual Leave Approval
**Key:** `annual_leave_approval`

**Subject Template:**
```
APPLICATION FOR {{leave_type}} — {{leave_year_period}}
```

**Available Placeholders:**
- `{{leave_type}}` - Leave type (Annual, Sick, etc.)
- `{{leave_year_period}}` - Year period (2026/2027)
- `{{submitted_date}}` - Staff request date
- `{{leave_start_date}}` - Leave start
- `{{leave_end_date}}` - Leave end
- `{{approved_days}}` - Days approved
- `{{travelling_days_info}}` - Travelling days line (optional)
- `{{return_to_work_date}}` - Return date
- `{{adjustment_details}}` - HR adjustments (optional)

**CC Recipients:**
```
Managing Director, Deputy Managing Director, HR Head, Accounts Manager
```

#### Leave of Absence
**Key:** `leave_of_absence`

**Special Features:**
- Notifies Accounts to delete from payroll
- Includes note about service computation
- Requires 1 month advance notice before return

#### Re-change of Leave Date
**Key:** `re_change_of_leave_date`

**Use When:**
- Staff requests to reschedule approved leave
- Leave date changed due to operational needs
- Re-planning after initial approval

### 3.2 Payment Memo Templates

#### Leave Entitlement Payment Memo
**Key:** `payment_leave_entitlement`

**Used For:**
- Paying staff for approved leave they've taken
- Monthly leave entitlement payouts
- Holiday encashment

**Placeholders:**
```
- {{staff_name}} - Full name
- {{staff_number}} - ID number
- {{memo_date}} - Memo date (DD/MM/YYYY)
- {{approved_days}} - Days being paid
- {{leave_type}} - Type of leave
- {{leave_start_date}} to {{leave_end_date}} - Period
- {{basic_salary}} - Staff salary
- {{payment_amount}} - Calculated amount
- {{hr_officer_name}} - Preparer's name
```

**CC Recipients:**
```
Finance Director, Deputy Finance Director, Audit Manager
```

#### End of Service Leave Payment
**Key:** `payment_end_of_service`

**Used For:**
- Outgoing staff final settlement
- Outstanding leave benefits
- Gratuity calculations

---

## 4. Using the Leave Templates

### 4.1 Template Rendering

The `renderTemplate()` function replaces all placeholders in a template:

```typescript
import { renderTemplate, leaveTemplates } from '@/lib/leave-templates'

const data = {
  staff_name: "John Doe",
  staff_number: "EMP001",
  leave_type: "Annual Leave",
  approved_days: "15",
  // ... other placeholders
}

const template = leaveTemplates.annual_leave_approval
const subject = renderTemplate(template.subject, data)
const body = renderTemplate(template.body, data)
```

### 4.2 Extracting Placeholders

To show users which placeholders they need to fill:

```typescript
import { extractPlaceholders } from '@/lib/leave-templates'

const missingPlaceholders = extractPlaceholders(template.body)
// Returns: ['leave_type', 'leave_start_date', 'leave_end_date', ...]
```

### 4.3 In the UI

**HR Leave Office Dashboard:**
1. Select template from dropdown
2. See all required placeholders
3. Fill in values
4. Preview rendered memo
5. Save/forward to accounts

---

## 5. API Endpoints

### 5.1 Create Payment Memo

**Endpoint:** `POST /api/leave/planning/payment-memo`

**Request Body:**
```json
{
  "leave_plan_request_id": "uuid",
  "memo_subject": "PAYMENT OF ACCRUED LEAVE...",
  "memo_body": "MEMORANDUM\n\nTO: THE ACCOUNTS MANAGER...",
  "payment_amount": 2500.50,
  "payment_currency": "GHS"
}
```

**Response:**
```json
{
  "success": true,
  "payment_memo": {
    "id": "uuid",
    "leave_plan_request_id": "uuid",
    "hr_leave_office_id": "uuid",
    "status": "draft",
    "memo_subject": "...",
    "payment_amount": 2500.50,
    ...
  },
  "message": "Payment memo created successfully"
}
```

**Requirements:**
- User must be `admin` or `hr_leave_office` role
- `leave_plan_request_id` must exist
- `memo_subject` and `memo_body` required

### 5.2 Update Payment Memo

**Endpoint:** `PUT /api/leave/planning/payment-memo/[id]`

**Request Body:**
```json
{
  "status": "forwarded_to_accounts",
  "memo_subject": "Updated subject (optional)",
  "memo_body": "Updated body (optional)"
}
```

**Valid Statuses:**
- `draft` - Initial creation
- `ready_for_review` - HR Leave Office marked complete
- `reviewed_by_hr` - HR Approver reviewed
- `forwarded_to_accounts` - Sent to Accounts dept
- `acknowledged_by_accounts` - Accounts confirmed receipt

### 5.3 Get Payment Memos

**Endpoint:** `GET /api/leave/planning/payment-memo`

**Query Parameters:**
- `status` - Filter by status (optional)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "payment_memos": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

## 6. HR Leave Office Workflow

### 6.1 Daily Workflow Steps

1. **Review Pending Requests**
   - Filter by `hod_approved` status
   - Review dates and leave type

2. **Create Memo (Optional)**
   - Use templates for consistency
   - Adjust placeholders as needed
   - Save as draft

3. **Adjust Leave (if needed)**
   - Change approved days
   - Update dates
   - Record reason (mandatory - appears in memo to staff)
   - Forward to HR Approver

4. **Create Payment Memo**
   - Calculate payment amount
   - Draft memo to accounts
   - Include cost center
   - Forward to Finance

5. **Track Activities**
   - All actions logged in `leave_office_work_log`
   - Audit trail maintained automatically

### 6.2 Processing a Request

**Scenario:** Staff requests 15 days annual leave, holidays overlap

**Steps:**
1. Note public holidays during period
2. Adjust to 12 working days
3. Use `re_change_of_leave_date` template
4. Adjust start/end dates
5. Record reason: "Adjusted for 3 public holidays in period"
6. Forward to HR Approver with memo draft

---

## 7. Integration with Leave Payment System

### 7.1 Payment Calculation

**Formula:**
```
Payment = (Approved Days ÷ 22) × Basic Monthly Salary
```

**Example:**
- Basic Salary: GHc 5,000
- Approved Days: 15
- Payment = (15 ÷ 22) × 5,000 = GHc 3,409.09

### 7.2 Cost Centers

Payment memos should include cost center allocation:
```
DR. Cost Center: [Department Code]
CR. Salary/Wages Account
```

### 7.3 Accounts Acknowledgment

Once Accounts processes the memo:
1. Status updated to `acknowledged_by_accounts`
2. `accounts_acknowledgment_at` timestamp recorded
3. `accounts_notes` field updated with any additional info

---

## 8. Common Placeholder Values

For fast memo generation, here are typical values:

| Placeholder | Example |
|-------------|---------|
| `{{leave_year_period}}` | 2026/2027 |
| `{{memo_date}}` | 01/05/2026 |
| `{{approved_days}}` | 15 |
| `{{travelling_days}}` | 2 |
| `{{return_to_work_date}}` | 16/05/2026 |
| `{{payment_currency}}` | GHS |

---

## 9. Migration Steps

To deploy these changes to production:

```bash
# 1. Run database migrations (in order)
psql $DATABASE_URL < scripts/056_hr_leave_office_templates_and_payment.sql
psql $DATABASE_URL < scripts/057_hr_leave_office_permissions_update.sql

# 2. Verify tables created
SELECT * FROM leave_memo_templates;
SELECT * FROM leave_payment_memos;
SELECT * FROM leave_office_work_log;

# 3. Test HR Leave Office submission
# - Create test HR Leave Office user
# - Submit leave request (should not require HOD)
# - Create payment memo
# - Verify audit log entries
```

---

## 10. Troubleshooting

### Issue: HR Leave Office user sees HOD warning

**Solution:**
- Check user role is exactly `hr_leave_office` (no spaces/dashes)
- Verify `leave-management-client.tsx` condition: `userRole !== "hr_leave_office"`
- Clear browser cache

### Issue: Cannot create payment memo

**Solution:**
- Verify user role is `admin` or `hr_leave_office`
- Check `leave_plan_request_id` exists
- Ensure `memo_subject` and `memo_body` are not empty
- Check API response for detailed error

### Issue: Placeholders not rendering

**Solution:**
- Use exact placeholder names (case-sensitive): `{{staff_name}}`
- All placeholders must be provided or will render as empty
- Use `extractPlaceholders()` to identify required fields

---

## 11. Future Enhancements

- [ ] Auto-calculate payment amounts from salary tables
- [ ] Email notifications to Accounts when memo forwarded
- [ ] Approval workflow for HR payment memos
- [ ] Monthly leave summary reports
- [ ] Integration with payroll system for automatic processing
- [ ] SMS/WhatsApp notifications to staff
- [ ] Leave balance forecasting

---

## 12. Support & Questions

For implementation questions or issues:
1. Check `lib/leave-templates.ts` for template definitions
2. Review `scripts/056_*.sql` for database schema
3. Check `/api/leave/planning/payment-memo/route.ts` for API logic
4. Review leave management client components

---

**Document Version:** 1.0  
**Last Updated:** May 1, 2026  
**Status:** Ready for Implementation
