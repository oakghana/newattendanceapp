# HR-Leave-Office-Admin Role Implementation Guide

## Overview
The **HR-Leave-Office-Admin** role is a dedicated administrative role for managing the annual leave workflow, holiday calculations, leave approvals, and leave analytics for the organization.

## Role Identifier
- **Database Value**: `hr_leave_office_admin`
- **Display Name**: HR-Leave-Office-Admin
- **System ID**: Used internally for API permissions and role checks

## Who Can Assign This Role
The HR-Leave-Office-Admin role can be assigned by:
- **Admin** users
- **Director HR** users  
- **Manager HR** users

## How to Assign HR-Leave-Office-Admin Role

### Step 1: Access Staff Management
1. Log in as Admin, Director HR, or Manager HR
2. Navigate to **Settings → Administration → Staff Management**

### Step 2: Create New Staff or Edit Existing
**For New Staff:**
- Click **"Add Staff"**
- Fill in basic information
- In the **Role** dropdown, select **"HR-Leave-Office-Admin"**
- Select **Assigned Location**
- Click **"Add Staff"**

**For Existing Staff:**
- Find the staff member in the list
- Click **"Edit"** (pencil icon)
- Change **Role** dropdown to **"HR-Leave-Office-Admin"**
- Click **"Update Staff"**

### Step 3: Confirm Assignment
The staff member can now:
- Log in and access `/dashboard/leave-management`
- View all leave requests submitted by staff
- Approve/reject annual leave requests
- Calculate and deduct public holidays
- Generate payment memos
- View leave analytics and reporting

## HR-Leave-Office-Admin Capabilities

### Leave Request Management
- **Review** all leave requests from staff members
- **Approve** or **Reject** annual leave, casual leave, and other leave types
- **Adjust leave days** if needed (e.g., due to overlapping periods)
- **Add notes** for audit trail

### Holiday Management
- **View public holidays** configured for the year
- **Deduct holiday days** from leave calculations
- **Generate corrected leave memos** with final approved days

### Payment Processing
- **Generate leave payment memos** for Accounts department
- **Export leave data** for salary calculations
- **Track leave usage** by department or individual

### Analytics & Reporting
- **View leave analytics** (charts, trends, summaries)
- **Generate reports** on leave usage by department
- **Monitor leave balances** across organization
- **Track pending approvals** and workflow status

### Leave Balance Management
- **View staff leave balances** by type
- **Check remaining leave** for the year
- **Monitor leave deferrals** and carryovers

## System Permissions

The HR-Leave-Office-Admin role has access to these API endpoints:

### Leave Planning
- `POST /api/leave/planning` - Submit leave requests
- `PUT /api/leave/planning/:id` - Edit own/assigned leave requests
- `GET /api/leave/planning` - View leave requests

### HR Office Operations
- `POST /api/leave/planning/hr-office` - Approve/reject leave
- `POST /api/leave/deferment/hr-office-review` - Review deferred leave
- `POST /api/leave/archive` - Archive processed requests
- `POST /api/leave/bulk-archive` - Batch archive requests

### Analytics & Export
- `GET /api/leave/analytics` - View leave analytics
- `GET /api/leave/export` - Export leave data
- `POST /api/leave/import` - Import leave data

### Leave Balance
- `GET /api/leave/balance` - Calculate leave balances

## User Interface Access

HR-Leave-Office-Admin users can access:
- `/dashboard/leave-management` - Main leave management dashboard
  - Leave Management tab - Request queue
  - Leave & HR Leave tab - Leave planning interface
  - Leave Analytics tab - HR-only analytics
  - Balance & Calendar tab - Leave tracking

## Database Role Constraint

The role is included in the `user_profiles` table role constraint:

```sql
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN (..., 'hr_leave_office_admin', ...))
```

## Troubleshooting

### HR-Leave-Office-Admin option doesn't show in Role dropdown
1. **Check your role**: Only Admin, Director HR, and Manager HR can assign this role
2. **Verify browser cache**: Clear cache and refresh the page
3. **Check user_profiles table**: Ensure current user's role is set correctly in database

### Staff assigned HR-Leave-Office-Admin can't access leave-management page
1. **Login refresh**: Have them log out and log back in
2. **Check assigned location**: Ensure they have an assigned location set
3. **Verify role in database**: Run query to confirm role is saved as `hr_leave_office_admin`

```sql
SELECT id, first_name, last_name, role, assigned_location_id 
FROM user_profiles 
WHERE role = 'hr_leave_office_admin';
```

### Leave approval API returns "unauthorized"
1. **Verify role value**: Ensure the database has `hr_leave_office_admin` (with underscores, not hyphens)
2. **Check API permission**: The endpoint should include `hr_leave_office_admin` in allowed roles list

## Differences from Other HR Roles

| Role | Can Submit | Can Approve | Can Approve Own | View Analytics | Assign Roles |
|------|-----------|-----------|----------------|----------------|-------------|
| Staff | Yes | No | No | No | No |
| Manager HR | No | Limited | No | Yes | Limited |
| Director HR | No | Yes | No | Yes | Yes |
| HR-Leave-Office-Admin | No | Yes | No | Yes | No |
| Admin | No | Yes | N/A | Yes | Yes |

## Related Documentation
- `HR_LEAVE_OFFICE_SETUP.md` - General HR Leave Office setup guide
- `ANNUAL_LEAVE_VALIDATION_AND_CALCULATIONS.md` - Leave calculation details
- `LEAVE_REQUEST_FLOW.md` - Complete leave workflow documentation

## Support
For issues with HR-Leave-Office-Admin role assignment or functionality, please:
1. Check the troubleshooting section above
2. Verify database role is set to `hr_leave_office_admin`
3. Contact system administrator
