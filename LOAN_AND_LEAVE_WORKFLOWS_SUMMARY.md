# Loan & Leave Administration Workflows - Summary

## LOAN WORKFLOW

### Loan Request Statuses
```
pending_hod
    ↓
hod_approved  (or hod_rejected ←)
    ↓
sent_to_accounts
    ↓
(FD Score calculated: Good FD ≥ 39)
    ├→ rejected_fd (or awaiting_committee)
    ↓
awaiting_committee
    ├→ committee_rejected
    ↓
awaiting_hr_terms
    ↓
awaiting_director_hr (HR Executive approval)
    ├→ director_rejected
    ↓
approved_director (FINAL)
```

### Loan Processing Stages by Role

#### 1. **HOD/Department Head** (pending_hod)
- **Action**: Review loan request from staff member
- **Decision**: Approve or Reject
- **If Approved**: Status → `hod_approved`, forwarded to Accounts/FD Reviewer
- **If Rejected**: Status → `hod_rejected`, staff can edit and resubmit
- **Tab**: "Tracking" → "Pending HOD Approval"

#### 2. **Accounts/FD Reviewer** (hod_approved)
- **Action**: Calculate Financial Due Diligence (FD) Score
- **Threshold**: Good FD Score ≥ 39
- **If Score ≥ 39**: Status → `awaiting_committee` (Good FD)
- **If Score < 39**: Status → `rejected_fd` (Poor FD)
- **Alternative**: Route to Committee if needed
- **Tab**: "Loan Office" → "Good FD" or "Poor FD" stage pills

#### 3. **Loan Committee** (awaiting_committee)
- **Action**: Final approval decision on good FD requests
- **Decision**: Approve or Reject
- **If Approved**: Status → `awaiting_hr_terms`
- **If Rejected**: Status → `committee_rejected` (FINAL REJECT)
- **Tab**: "Committee" → committee dashboard

#### 4. **HR Office - Set Terms** (awaiting_hr_terms)
- **Action**: Set disbursement and recovery terms
- **Fields**: Disbursement schedule, Recovery months, Notes
- **After Save**: Status → `awaiting_director_hr`
- **Tab**: "Loan Office" → "HR Terms Queue" → "Set Terms" button

#### 5. **HR Executive/Director** (awaiting_director_hr)
- **Action**: Final review, sign, and approve loan memo
- **Decision**: Approve or Reject
- **If Approved**: Status → `approved_director`, memo generated & signed
- **If Rejected**: Status → `director_rejected`
- **Signature**: Auto-saved if not pre-existing (Director's name as text)
- **Tab**: "Executive HR" → "Review & Sign Memo" button
- **Note**: ANY HR Executive with `director_hr`, `manager_hr`, `hr_director`, or `admin` role can sign

#### 6. **Staff** (any stage after hod_approved)
- **View**: "My Loans" tab shows all own requests with current status
- **Download**: Can download approved loan memos (with director's signature)
- **Payments**: "Payment & Download" tab shows approved memos ready for disbursement

### Loan Workflow Roles & Permissions

| Role | Can Do | Stages |
|------|--------|--------|
| `department_head` / `regional_manager` | Review & approve loans | pending_hod |
| `accounts` / FD Reviewer | Calculate FD score, route requests | hod_approved → sent_to_accounts |
| `loan_committee` / `committee_member` | Final approval for good FD | awaiting_committee |
| `manager_hr` / HR Officer | Set disbursement terms | awaiting_hr_terms |
| `director_hr` / `manager_hr` / `hr_director` | Sign & finalize loans | awaiting_director_hr |
| `loan_officer` / `loan_office` | View & manage loan office processing queue | All (read/action) |
| `admin` | Override any stage | All |

### Key Loan Fields
- **Request Number**: Auto-generated (e.g., LN-20260728-7363)
- **Staff Details**: Name, Staff No., Rank, Department
- **Loan Type**: Salary Advance, Car Loan, Furniture Allowance, etc.
- **Amount**: GHc currency
- **FD Score**: 0-100 (Good ≥ 39)
- **Status**: 11 possible statuses (see above)
- **Memo**: Auto-generated PDF with all approver signatures

---

## LEAVE WORKFLOW

### Leave Request Statuses
```
pending
    ↓
approved (HOD approves)
    ↓
active (Staff submits document & activates)
    ↓
completed (Auto-reactivated after leave end date)

Alternative:
pending → rejected (HOD rejects) → FINAL
```

### Leave Processing Stages by Role

#### 1. **Staff** (pending)
- **Action**: Submit leave request
- **Input Fields**:
  - Leave Type (Annual, Sick, Casual, Maternity, etc.)
  - Start Date & End Date
  - Reason
  - Document (optional initially)
- **Next Step**: Request forwarded to HOD for approval
- **Tab**: "Attendance" → "Request Leave" or "Leave Management" → "My Requests"

#### 2. **HOD/Department Head** (pending → review)
- **Action**: Review pending leave requests from department staff
- **Decision**: Approve or Reject
- **If Approved**: Status → `approved`, Staff marked inactive (`is_active = false`)
- **If Rejected**: Status → `rejected`, Staff stays active
- **View**: "Leave Management" → "Pending Approval" section
- **Notification**: Receives alerts when staff submits documents

#### 3. **Staff - Document Submission** (approved → active)
- **Trigger**: After HOD approves, staff sees "Submit Document" button
- **Input**: Upload supporting document (approval letter, medical certificate, etc.)
  - Accepted formats: PDF, JPG, PNG
  - Max size: 5MB
- **Action**: Clicks "Submit Document"
- **Result**: Status → `active`, leave is now ACTIVE
- **Effect**: Staff is automatically inactive during leave period, cannot check in/out
- **Tab**: "Attendance" → "Leave Approved" card → "Submit Document" button

#### 4. **System - Auto-Reactivation** (active → completed)
- **Trigger**: Daily cron job at 1 AM UTC (`/api/cron/reactivate-after-leave`)
- **Check**: Finds all staff with `leave_end_date < today` and `is_active = false`
- **Action**: Automatically sets:
  - `is_active = true`
  - `leave_status = "completed"`
- **Result**: Staff can check in/out again
- **Exclusion**: Staff on active leave are excluded from department analytics

### Deferment Workflow (Staff Can Defer Approved Leave)

#### 1. **Staff Submits Deferment** (approved leave)
- **Trigger**: Staff selects approved leave and chooses to defer
- **Input Fields**:
  - Deferral Year (e.g., 2027)
  - Reason (optional)
- **Result**: Deferment request created with status `pending`
- **Tab**: "Leave Management" → "Deferrments Tab" → "Submit Deferment"

#### 2. **Leave Office Views** (optional intermediate step)
- **View**: Leave Office staff (`leave_office` role) can see pending deferrments
- **Action**: Initial review/comments
- **Note**: Cannot approve; forwards to HR for final approval

#### 3. **HR Leave Admin Approves Deferment** (pending → approved)
- **Who**: HR Leave Office staff (`hr_leave_office` role)
- **Action**: Reviews deferment request
- **Decision**: Approve or Decline
- **If Approved**: 
  - Deferment status → `approved`
  - Original leave status → `deferred`
  - Leave balance carried to deferral year
- **Tab**: "HR Leave Admin" → "Deferrments Tab"

### Recall Workflow (HOD Can Recall Staff from Leave)

#### 1. **HOD Initiates Recall** (staff on active leave)
- **Trigger**: HOD needs staff to return from approved leave early
- **Input Fields**:
  - Recall Date (when staff should resume)
  - Reason for Recall
- **Result**: Recall request created with status `pending`
- **Tab**: "Leave Management" → "Recalls Tab" → "Submit Recall"

#### 2. **HR Leave Admin Approves Recall** (pending → approved)
- **Who**: HR Leave Office staff (`hr_leave_office` role)
- **Action**: Reviews recall request
- **Decision**: Approve or Decline
- **If Approved**:
  - Recall status → `approved`
  - Leave status → `recalled`
  - Staff becomes active on recall date
- **Tab**: "HR Leave Admin" → "Recalls Tab"

### Leave Workflow Roles & Permissions

| Role | Can Do | Stages |
|------|--------|--------|
| `staff` / `officer` | Submit leave requests | pending (initiate) → active (submit doc) |
| `department_head` / `regional_manager` | Approve/reject leave | pending → approved/rejected |
| `leave_office` | View pending deferrments/recalls | pending (view only) |
| `hr_leave_office` | Approve deferrments & recalls | awaiting_hr_approval → approved |
| `hr_director` | Override approvals, view analytics | All |
| `admin` | Full access to all leave data | All |
| System (cron) | Auto-reactivate after leave ends | active → completed (daily) |

### Key Leave Fields
- **Leave Type**: Annual, Sick, Casual, Maternity, Paternity, Compassionate, etc.
- **Duration**: Start Date + End Date = Days
- **Status**: pending, approved, rejected, active, completed, deferred, recalled
- **Document URL**: Supporting documents uploaded by staff
- **is_active**: False during leave period, auto-resets to True after leave ends
- **Department Filter**: Staff only see own department's leave calendar

---

## Analytics & Exclusion Rules

### Who Gets Excluded from Department Analytics During Leave?
- Any staff with `is_active = false` AND `leave_status = "active"`
- Staff with active leave are excluded from:
  - Department attendance percentage calculations
  - "Days Absent" counts
  - Team coverage metrics
  - Performance dashboards
- **Result**: Only active, working staff metrics are shown

---

## Key Differences: Loan vs Leave

| Aspect | Loan | Leave |
|--------|------|-------|
| **Initiation** | Staff request | Staff request OR HOD recall |
| **Final Approver** | HR Executive (Director HR) | HOD (then system auto-completes) |
| **Document Required** | Yes (memo signature) | Yes (approval letter, med cert) |
| **Auto-Completion** | No (manual signing) | Yes (cron job after end date) |
| **Stages** | 11 different statuses | 4-5 statuses |
| **Typical Duration** | 1-2 weeks | Days to weeks |
| **Department Impact** | Financial tracking | Attendance & coverage tracking |
| **Reversibility** | Can be rejected at 5 stages | Deferrments can reverse to next year |

---

## Workflow Diagrams

### Loan Quick Path (Best Case)
```
Staff Request 
    → HOD Approves (1 day)
    → Accounts Scores (2-3 days)
    → Committee Approves (1 day)
    → HR Sets Terms (1 day)
    → Director Signs (1 day)
    → APPROVED & Paid
```

### Leave Quick Path (Best Case)
```
Staff Requests Leave
    → HOD Approves (1-2 days)
    → Staff Submits Document (same day)
    → ACTIVE (staff on leave)
    → Leave Ends
    → System Auto-Reactivates (next day via cron)
    → COMPLETED
```

---

## Common Issues & Solutions

### Loan: Memo Shows Blank Signature
- **Fix**: Director signature auto-saved using director's name as text
- **Check**: If signature still blank, verify director has director_hr, manager_hr, hr_director, or admin role

### Leave: Staff Not Reactivating After Leave Ends
- **Fix**: Cron job runs daily; manually call `/api/cron/reactivate-after-leave` if needed
- **Check**: Verify leave_end_date is set correctly in database

### Leave: Staff Still in Analytics While on Leave
- **Fix**: Check `is_active = false` and `leave_status = "active"`
- **Verify**: Leave dates are within current date range

### Loan: Request Stuck in a Stage
- **Check**: User role has permission for that stage
- **Verify**: Request status matches stage requirements

---

## API Endpoints Reference

### Loan APIs
- `POST /api/loan/request` - Create loan request
- `POST /api/loan/action` - Approve/reject at any stage
- `GET /api/loan/workflow` - Fetch loan requests by status
- `GET /api/loan/memo/[id]` - Download signed memo PDF
- `POST /api/loan/bulk-archive` - Archive completed loans

### Leave APIs
- `POST /api/leave/request` - Submit leave request
- `POST /api/leave/activate-approved` - Submit document to activate leave
- `GET /api/leave/deferment` - Fetch deferment requests
- `POST /api/leave/deferment` - Submit deferment
- `POST /api/leave/recall` - Submit recall request
- `GET /api/cron/reactivate-after-leave` - Auto-reactivate (runs daily)

---

**Last Updated**: 2026-07-28
**Version**: 1.0
**Document Purpose**: Quick reference for loan & leave administration workflows
