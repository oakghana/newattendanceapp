# Deferment & Recall Data Flow Documentation

## Overview
The deferment and recall system allows staff to defer or recall their leave to/from future years. The data flows through multiple roles and systems.

---

## Deferment Request Flow

### 1. **Staff Submits Deferment** (Leave Management Dashboard)
- **Where**: `/dashboard/leave-management` → Deferrments Tab
- **Trigger**: Staff with approved leave selects:
  - Leave request to defer
  - Deferral year (YYYY format)
  - Optional reason
- **Button**: "Submit Deferment Request"
- **API Call**: `POST /api/leave/deferment`

### 2. **Data Submission**
```
Payload sent to /api/leave/deferment:
{
  leave_plan_request_id: <id>,
  deferral_year: "2027",
  reason: "Optional reason",
  user_id: <staff_id>
}
```

### 3. **API Processing** (`/app/api/leave/deferment/route.ts`)
- Validates leave request exists and is "approved" or "hr_approved"
- Creates entry in `leave_deferment_requests` table with:
  - `status: "pending"`
  - `requested_deferment_year: 2027`
  - `requested_deferment_period: "2027/2028"`
  - `created_at: <timestamp>`

### 4. **HR Leave Admin Reviews** (Not HOD/RM)
- **Where**: `/dashboard/hr-leave-admin` → Deferments Tab
- **Who**: HR Leave Office staff (role: `hr_leave_office`)
- **Action**: Review pending deferment requests and:
  - Approve deferment
  - Decline deferment
  - Request more information

### 5. **Leave Office Views Requests** (NEW)
- **Where**: `/dashboard/leave-management` → Deferrments Tab
- **Who**: Leave Office staff (role: `leave_office`)
- **View**: Lists pending deferment requests from all staff
- **Action**: Can view details but typically forwarded to HR for approval

---

## Recall Request Flow

### 1. **HOD/RM Initiates Recall** (New Feature)
- **Where**: `/dashboard/leave-management` → Recalls Tab
- **Trigger**: HOD/RM selects staff leave to recall:
  - Recall date (when staff should resume duty)
  - Reason for recall
- **Button**: "Submit Recall Request"
- **API Call**: `POST /api/leave/recall`

### 2. **Data Submission**
```
Payload sent to /api/leave/recall:
{
  leave_plan_request_id: <id>,
  recall_date: "2026-05-20",
  reason: "Business requirement",
  user_id: <hod_rm_id>,
  recalled_by_role: "department_head" or "regional_manager"
}
```

### 3. **API Processing** (`/app/api/leave/recall/route.ts`)
- Validates leave request exists and is active/approved
- Creates entry in `leave_recall_requests` table with:
  - `status: "pending"`
  - `recalled_by_role: "department_head"`
  - `created_at: <timestamp>`

### 4. **HR Leave Admin Approves** 
- **Where**: `/dashboard/hr-leave-admin` → Recalls Tab
- **Who**: HR Leave Office staff
- **Action**: Reviews and approves/declines recall request

---

## Database Tables

### `leave_deferment_requests`
```sql
- id (UUID)
- leave_plan_request_id (FK to leave_plan_requests)
- requested_deferment_year (INT) - e.g., 2027
- requested_deferment_period (TEXT) - e.g., "2027/2028"
- reason (TEXT)
- user_id (FK to staff/users)
- status (TEXT) - pending, approved, declined
- created_at (TIMESTAMP)
- reviewed_by (FK to users) - HR reviewer
- reviewed_at (TIMESTAMP)
```

### `leave_recall_requests`
```sql
- id (UUID)
- leave_plan_request_id (FK to leave_plan_requests)
- recall_date (DATE)
- reason (TEXT)
- user_id (FK to staff/users) - HOD/RM who initiated
- recalled_by_role (TEXT) - department_head or regional_manager
- status (TEXT) - pending, approved, declined
- created_at (TIMESTAMP)
- reviewed_by (FK to users) - HR reviewer
- reviewed_at (TIMESTAMP)
```

---

## Role Responsibilities

### Staff
- ✅ Submit deferment requests for approved leave
- ✅ View own deferment status
- ❌ Cannot approve deferrments
- ❌ Cannot recall own leave

### Leave Office (role: `leave_office`)
- ✅ View all pending deferment/recall requests
- ✅ Provide initial review and comments
- ❌ Cannot approve (forwarded to HR)
- ❌ Cannot recall leave

### HOD/RM (roles: `department_head`, `regional_manager`)
- ✅ Submit recall requests for staff leave
- ✅ View approved memos (deferred leave)
- ✅ See deferment/recall status
- ❌ Cannot approve deferrments (HR approves)

### HR Leave Office (role: `hr_leave_office`)
- ✅ View all deferment/recall requests
- ✅ Approve or decline deferrments
- ✅ Approve or decline recalls
- ✅ Add remarks and comments
- ✅ Generate reports

### HR Executive/Director (role: `hr_director`)
- ✅ Override approvals if needed
- ✅ View all deferment/recall history
- ✅ Generate analytics

---

## Current Implementation Status

### ✅ Completed
- Staff can submit deferment requests
- Leave Office can view pending deferment requests
- HR Leave Admin can review and approve/decline
- Deferment data stored in Supabase

### ⚠️ In Progress
- HOD/RM recall functionality (UI ready, approval flow needs refinement)
- Leave Office full approval capability

### ❌ TODO
- Notification system when deferment/recall approved/declined
- Automated leave balance updates when deferment approved
- Audit trail for all deferment/recall actions

---

## Where Does Data Go From HOD/RM Dashboard?

**Short Answer**: HOD/RM deferment data → Leave Office sees it → HR Leave Admin approves it

**Flow**:
1. Staff submits deferment in Leave Management
2. Leave Office views in their dashboard (Deferrments tab)
3. Data stored in `leave_deferment_requests` table
4. HR Leave Admin fetches via `/api/leave/deferment?status=pending`
5. HR reviews and updates `status` to "approved" or "declined"
6. Staff notified of decision

**Note**: HOD/RM primarily deal with **recalls** (calling staff back from leave), not deferrments. Deferrments are initiated by staff and approved by HR.
