# Regional HR Leave Role

## Overview
The **Regional-HR-Leave** role provides regional HR personnel with visibility into and control over annual leave requests and approved loans within their assigned region/location.

---

## Role Details

| Property | Value |
|----------|-------|
| **Database Value** | `regional_hr_leave` |
| **Display Name** | Regional HR Leave |
| **Assignment** | Admin only |
| **Location Required** | Yes (mandatory) |
| **Visibility Scope** | Assigned location/region only |

---

## Capabilities Matrix

### Annual Leave Management
✅ **Can Do:**
- View ALL annual leave requests (pending, approved, rejected, adjusted)
- Filter leave by staff member, status, dates
- Export leave data to Excel format
- Download leave PDF documents
- View leave approvals history

❌ **Cannot Do:**
- Approve or reject leave requests
- Modify leave status
- Access admin settings
- Declare holidays
- Update leave day configurations

### Approved Loans & Applications
✅ **Can Do:**
- View APPROVED loans only (approved_director status)
- View approved leave applications
- Download supporting documents
- Download loan PDFs
- View leave linked to loans

❌ **Cannot Do:**
- View pending or rejected loans
- Approve or reject loans
- Modify loan status
- Access unapproved documents

### General Access
❌ **No Access To:**
- Staff Management menu
- Settings & Linkages tab
- Holiday Declarations
- Leave Days Update
- HR Templates
- Analytics Dashboard
- Role Assignment
- Admin functions

---

## How to Assign

### Step 1: Admin Access
1. Log in as **Admin**
2. Navigate to **Settings → Administration → Staff Management**

### Step 2: Assign New
**Option A: Create New Staff**
1. Click **Add Staff** button
2. Fill in details (Name, Email, Department, etc.)
3. Select **Role: "Regional HR Leave"**
4. Select **Assigned Location** (mandatory)
5. Click **Add Staff**

**Option B: Edit Existing Staff**
1. Search for staff member in list
2. Click **Edit** button (pencil icon)
3. Change Role to **"Regional HR Leave"**
4. Ensure location is set correctly
5. Click **Update Staff**

### Step 3: Verify Assignment
1. Staff receives access notification
2. Staff logs in and navigates to Leave Management
3. Sees regional leave data for their location
4. Can export and view approved loans

---

## Data Visibility Rules

### Location Filtering
- **Regional-HR-Leave users can ONLY see:**
  - Leave requests from their assigned location
  - Approved loans from their location
  - Leave applications from their location
  - Documents/PDFs for their location

- **Cannot see:**
  - Data from other locations/regions
  - Pending loans from other locations
  - Confidential staff information outside their region

### Status Visibility

#### Leave Requests
- ✅ Pending (pending_hod_review, pending_hr_review)
- ✅ Approved (approved, approved_director)
- ✅ Rejected (rejected, rejected_hod)
- ✅ Adjusted

#### Loans
- ✅ Approved (approved_director status only)
- ❌ Pending (pending_hod, hod_approved, awaiting_director_hr)
- ❌ Rejected (all rejection statuses hidden)

#### Applications
- ✅ Approved leave applications only
- ❌ Pending applications
- ❌ Rejected applications

---

## Features Available

### 1. Leave Dashboard
**Location:** Dashboard → Leave Management

Shows:
- Regional annual leave requests
- Leave status breakdown (approved/pending/rejected counts)
- Staff member details
- Leave dates and duration
- Last update timestamp

**Actions:**
- Filter by status
- Search by staff name/number
- Sort by date/name
- View leave details
- Download PDF

### 2. Export to Excel
**Button:** "Export Annual Leave Requests" (on Leave Management)

Excel file includes:
- Staff Name & Employee Number
- Leave Type & Dates
- Requested Days
- Current Status
- Reason for leave
- Submitted date
- Color-coded status rows

**Usage:**
1. Click "Export to Excel"
2. File downloads as: `Annual_Leave_Requests_[YEAR]_[DATE].xlsx`
3. Can open in Excel/Google Sheets
4. Can modify and re-import (if import feature available)

### 3. Approved Loans Viewer
**Location:** Dashboard → Loan Application (Regional View)

Shows:
- Approved loans in region
- Loan type & amount
- Applicant details
- Approval status
- Supporting documents
- Linked leave applications

**Actions:**
- Download loan documents
- View leave details
- Download leave PDFs
- Filter by loan type

### 4. Leave Application PDFs
**Access:** Through Loan Application View

Can download:
- Approved leave application PDFs
- Supporting documents
- Leave approval memos
- Regional records

---

## Permission Structure

### Database Constraints
The role is validated in `user_profiles` table:
```sql
CONSTRAINT role_values CHECK (role IN (
  'admin', 'staff', 'hr_leave_office_admin', 
  'hr_leave_office', 'regional_hr_leave', ...
))
```

### API Access
Regional-HR-Leave users can call:
- ✅ `/api/leave/export/hod-annual-leave` - Export regional data
- ✅ `/api/leave/requests` - View regional requests
- ✅ `/api/loan-app/approved` - View approved loans
- ❌ `/api/admin/*` - Blocked
- ❌ `/api/leave/admin/*` - Blocked (admin features)
- ❌ `/api/staff/*` - Blocked (cannot manage staff)

### Dashboard Pages
- ✅ `/dashboard/leave-management` - View & export
- ✅ `/dashboard/loan-app` - View approved only
- ❌ `/dashboard/staff` - Blocked
- ❌ `/dashboard/leave-management/settings` - Blocked

---

## Use Cases

### Use Case 1: Regional HR Oversee Leave
**Scenario:** Regional HR needs to monitor all annual leave in their region for payroll purposes

**Workflow:**
1. Log in with Regional-HR-Leave role
2. Navigate to Leave Management
3. View all leave requests (all statuses)
4. Filter by staff or date range
5. Export to Excel for payroll processing
6. Send to Accounts department

### Use Case 2: Verify Approved Loans & Leave
**Scenario:** Regional HR needs to verify that approved loans match leave applications

**Workflow:**
1. Go to Loan Application → Regional View
2. See only approved loans in region
3. View linked leave applications
4. Download loan and leave PDFs
5. Verify against payroll records
6. Archive records

### Use Case 3: Regional Data Export
**Scenario:** Regional HR prepares monthly reports

**Workflow:**
1. Export annual leave to Excel
2. Add regional notes/comments
3. Calculate deductions based on holidays
4. Prepare regional summary
5. Submit to Corporate HR

---

## Troubleshooting

### Issue: "Cannot see Leave Management"
**Cause:** User role not assigned to `regional_hr_leave`
**Fix:** 
1. Admin checks Staff Management
2. Verify user has role: `regional_hr_leave`
3. Clear browser cache and re-login

### Issue: "Cannot see loans"
**Cause:** User assigned to different location than loans
**Fix:**
1. Verify assigned_location_id matches
2. Check loans are in "approved_director" status
3. Verify loans assigned to correct location

### Issue: "Export button not visible"
**Cause:** Not assigned Regional-HR-Leave role
**Fix:**
1. Admin assigns correct role
2. Verify user logged out and back in
3. Check role value in database directly

### Issue: "Cannot download PDF"
**Cause:** Document not properly stored
**Fix:**
1. Verify document exists in storage
2. Check file permissions
3. Contact admin to re-upload

---

## Comparison with Other Roles

| Feature | Regional-HR-Leave | HR Leave Office | HR-Leave-Office-Admin |
|---------|---|---|---|
| View Leave (all statuses) | ✅ Regional | ✅ All | ✅ All |
| Approve Leave | ❌ | ✅ | ✅ |
| Export to Excel | ✅ Regional | ❌ | ✅ |
| View Approved Loans | ✅ Regional | ❌ | ✅ |
| Declare Holidays | ❌ | ❌ | ✅ |
| Settings & Linkages | ❌ | ❌ | ✅ |
| Admin Access | ❌ | ❌ | ✅ |
| Regional Filter | ✅ | ❌ | ❌ |

---

## Related Roles & Workflow

```
Staff
  ↓ submits annual leave
Submission
  ↓
HOD/Regional Manager
  ↓ reviews and endorses
HOD Review
  ↓
Regional-HR-Leave ← VIEWS & EXPORTS
  ↓
HR Leave Office
  ↓ approves/rejects
Leave Approval
  ↓
HR-Leave-Office-Admin
  ↓ calculates deductions
Payment Memo Generation
  ↓
Accounts → Payroll
```

---

## Support & Documentation

- **Role Access Control:** See `/ROLE_BASED_ACCESS_CONTROL.md`
- **Leave Admin Features:** See `/HR_LEAVE_OFFICE_ADMIN_ROLE.md`
- **Excel Export Guide:** See `/HR_LEAVE_OFFICE_AND_EXPORT.md`
- **Loan Management:** See `/app/dashboard/loan-app/page.tsx` comments

---

## Contact
For issues or questions about the Regional-HR-Leave role, contact your system administrator.
