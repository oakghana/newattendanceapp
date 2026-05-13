# Leave Admin Role - Complete Guide

## Overview
The **`leave_admin`** role (formerly `hr_leave_office_admin`, renamed to `leave_admin` for character limit compliance) provides complete administrative authority over leave management operations.

---

## Role Details

| Property | Value |
|----------|-------|
| **Database Value** | `leave_admin` (10 characters) |
| **Display Name** | "HR-Leave-Office-Admin" |
| **Assignment** | Admin only |
| **Location** | Optional (can view all or specific locations based on assignment) |
| **Full Admin Access** | Yes - All leave management features unlocked |

---

## Core Capabilities

### 1. Leave Management Dashboard
**Access:** Dashboard → Leave Management

**Features:**
- ✅ View all leave requests (all statuses: pending, approved, rejected, adjusted)
- ✅ Approve/reject leave requests
- ✅ Add notes and comments to requests
- ✅ View pending approvals queue
- ✅ Historical tracking of all leave changes
- ✅ Export leave data to Excel
- ✅ Color-coded status indicators
- ✅ Filter by staff, department, location, date range

**Tabs Available:**
1. **Staff Applies** - Leave requests from staff members
2. **HOD Reviews** - Requests pending HOD review
3. **HR-Leave-Office-Admin Adjusts** - Adjustments made by admin
4. **HR Issues Memo** - Leave memos and correspondence

### 2. Administrative Queue Management
**Access:** Leave Management → Admin Tabs

**Queue Tabs (Admin View):**
- **Role: Staff** - Track staff-submitted leave applications
- **Role: HOD** - Monitor HOD review queue
- **Role: Regional** - View regional manager queue
- **Delayed** - Identify leave requests pending longer than 5 days (configurable)

Each queue shows:
- Pending count
- HOD status
- Manager approval status
- Time waiting (days)
- Detailed request information

### 3. Leave Calendar Settings
**Access:** Dashboard → Leave Administration → Leave Calendar Settings

**Configuration Options:**
- ✅ Set leave year start month (January-December)
- ✅ Set leave year end month (January-December)
- ✅ Include/exclude weekends in calculations
- ✅ Include/exclude holidays in calculations
- ✅ View current calendar configuration

### 4. Holiday Management
**Access:** Leave Calendar Settings → Holidays Tab

**Capabilities:**
- ✅ View all holidays (custom + system-generated)
- ✅ Add custom holidays for specific dates
- ✅ Delete custom holidays
- ✅ Organize holidays by month
- ✅ Flag holidays for leave deduction calculations
- ✅ Manage both public and regional holidays

**Example:**
```
Add Holiday
- Date: 12/25/2026
- Name: Christmas Day
- Mark as: Public Holiday
- Impact on leave: Exclude from leave days calculation
```

### 5. HR Memo Templates
**Access:** Leave Management → HR Memo Templates Tab

**Template Management:**
- ✅ View all memo templates (active/inactive)
- ✅ Create new templates
- ✅ Edit existing templates
- ✅ Delete templates
- ✅ Filter by category (approval, rejection, adjustment, etc.)
- ✅ Use templates for leave communications
- ✅ Add placeholders for dynamic content

**Template Options:**
- Leave approval memos
- Rejection notifications
- Adjustment notices
- Forwarding memos
- Policy communications

### 6. Leave Analytics & Insights
**Access:** Leave Management → Leave Analytics Tab

**Analytics Available:**
- ✅ Graphical leave data visualization
- ✅ Approval rate statistics
- ✅ Leave type distribution
- ✅ Department-wise leave trends
- ✅ Staff leave patterns
- ✅ Rejection rate analysis
- ✅ Time-to-approval metrics
- ✅ Custom date range filtering

### 7. Leave Policy Management
**Access:** Leave Management → Leave & HR Leave Tab → Operations Tab

**Policy Configuration:**
- ✅ View leave policy details
- ✅ Set leave entitlement rules
- ✅ Configure leave type policies
- ✅ Set approval workflows
- ✅ Manage leave accrual rules
- ✅ Configure carryover policies
- ✅ Set leave balance updates

### 8. Balance & Calendar View
**Access:** Leave Management → Balance & Calendar Tab

**Views:**
- ✅ Team leave balance overview
- ✅ Calendar view of all leave
- ✅ Individual leave balance tracking
- ✅ Leave availability by date
- ✅ Conflict detection (overlapping leaves)

---

## Approval Workflow Access

### Leave Request Journey
```
Staff Submits Leave
    ↓
[Department Head Reviews]
    ↓
[Leave Admin (YOU) Reviews & Approves]
    ↓
[Payroll/HR Office Processes]
    ↓
Staff Receives Approval
```

**Your Role (Leave Admin):**
- Review all HOD-approved leaves
- Approve or reject with notes
- Adjust leave dates/days if needed
- Add leave policy justifications
- Communicate decisions via memos

---

## Data Management Features

### Excel Export
**Button:** "Export Annual Leave Requests"

**Exported Data Includes:**
- Staff name and ID
- Leave type
- Start and end dates
- Requested days
- Status
- HOD notes
- Admin notes
- Approval dates

**Usage:**
1. Click "Export to Excel" button
2. Specify date range or criteria
3. File downloads as `Annual_Leave_Requests_[YEAR]_[DATE].xlsx`
4. Can edit locally and potentially re-import

### Bulk Operations
- ✅ Approve multiple leaves at once
- ✅ Reject bulk requests
- ✅ Adjust multiple records
- ✅ Add batch notes
- ✅ Export filtered results

---

## Permission Summary

### Can Do
- ✅ View ALL leave data in system
- ✅ Approve/reject leave requests
- ✅ Modify leave dates and durations
- ✅ Add adjustment notes
- ✅ Create and edit memo templates
- ✅ Configure holiday schedules
- ✅ Manage leave calendar settings
- ✅ View leave analytics
- ✅ Export leave data to Excel
- ✅ Access all admin queues
- ✅ Manage leave policies
- ✅ Track approval history
- ✅ View delayed requests

### Cannot Do
- ❌ Delete staff profiles
- ❌ Modify authentication
- ❌ Change user passwords (only admin)
- ❌ Modify system settings
- ❌ Access financial records (outside leave scope)

---

## Dashboard Views

### Main Dashboard
Shows:
- Leave workspace overview
- Pending approvals count
- Approved leave count  
- Submitted requests count
- Queue status

### Queue Dashboard
Shows per queue:
- Items in queue
- Status breakdown
- Priority items
- SLA status (time pending)

### Analytics Dashboard
Shows:
- Approval rates over time
- Leave type distributions
- Department trends
- Staff patterns
- Seasonal variations

---

## Notifications & Alerts

**Automatic Notifications:**
- ✅ New leave requests pending approval
- ✅ Requests delayed (5+ days waiting)
- ✅ HOD actions on leaves
- ✅ System alerts for policy violations
- ✅ Holiday conflicts

---

## Settings & Configuration

### Leave Year Configuration
```
Settings Example:
- Start: January 1
- End: December 31
- Include weekends: Yes
- Exclude holidays: Yes
- Calculation: 5-day work week
```

### Custom Holidays
Can add unlimited custom holidays:
- Public holidays
- Regional holidays  
- Organizational holidays
- One-off special dates

---

## Key Features Not Available to Other Roles

These features are **exclusive to leave_admin**:

1. ✅ **Administrative queue management** - See all role-specific queues
2. ✅ **Holiday declarations** - Modify holiday schedules
3. ✅ **Leave calendar settings** - Configure calculation rules
4. ✅ **Memo template management** - Create/edit leave communications
5. ✅ **Analytics dashboard** - View comprehensive leave statistics
6. ✅ **Delayed request alerts** - Track SLA violations
7. ✅ **Policy management** - Configure leave entitlements
8. ✅ **Bulk operations** - Manage multiple leaves at once

---

## Comparison with Other Roles

| Feature | Leave Admin | HR Leave Office | HOD | Manager | Staff |
|---------|---|---|---|---|---|
| View leaves (all statuses) | ✅ | ✅ | ❌ | ❌ | ✅ Personal only |
| Approve/reject | ✅ | ✅ | ✅ | ❌ | ❌ |
| Adjust dates | ✅ | ✅ | ❌ | ❌ | ❌ |
| Holiday management | ✅ | ❌ | ❌ | ❌ | ❌ |
| Templates | ✅ | ✅ | ❌ | ❌ | ❌ |
| Analytics | ✅ | ✅ | ❌ | ❌ | ❌ |
| Admin queues | ✅ | ❌ | ❌ | ❌ | ❌ |
| Excel export | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## How to Use - Step by Step

### Reviewing a Leave Request

1. Log in as `leave_admin` user
2. Go to **Dashboard → Leave Management**
3. Click **"HR-Leave-Office-Admin Adjusts"** tab
4. Find pending leave request
5. Click request to expand details
6. Choose action:
   - **Approve** - Grant leave
   - **Adjust & Forward** - Modify dates/days
   - **Reject** - Deny request
7. Add notes if needed
8. Click **"Update"** or **"Approve"**
9. Optional: Use memo template to communicate decision

### Managing Holidays

1. Go to **Leave Management → Leave Calendar Settings**
2. Scroll to **Holidays** section
3. Click **"Add Holiday"**
4. Enter:
   - Date
   - Holiday name
   - Impact on calculations
5. Click **"Add"**
6. Holiday now affects leave calculations

### Exporting Leave Data

1. Go to **Leave Management**
2. Filter by date range if needed
3. Click **"Export Annual Leave Requests"**
4. Select format: Excel
5. File downloads automatically
6. Can open in Excel/Google Sheets
7. Modify if needed for payroll/records

---

## Troubleshooting

### "Cannot see admin tabs"
- Ensure role is set to `leave_admin`
- Refresh browser
- Check user profile role assignment

### "Holiday not affecting calculations"
- Verify holiday date is correct
- Check "Exclude holidays" checkbox is enabled in settings
- Verify holiday is marked as "active"

### "Export button not visible"
- Verify you have `leave_admin` or admin role
- Refresh the page
- Clear browser cache

---

## Support

For issues or questions:
- Check this guide for feature details
- Review dashboard tooltips (hover over icons)
- Contact system administrator
- Check application logs for errors

---

## Related Documentation

- `/ROLE_NAME_CHANGE.md` - Why renamed to `leave_admin`
- `/ROLE_BASED_ACCESS_CONTROL.md` - Full permission matrix
- `/REGIONAL_HR_LEAVE_ROLE.md` - Regional leave role

