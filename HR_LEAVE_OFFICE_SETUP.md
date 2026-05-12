# HR Leave Office Admin Setup Guide

## Overview
The system DOES have a dedicated "HR Leave Office" admin interface for managing annual leave requests. However, you need to properly assign and configure staff members to this role.

## Current HR Leave Office Features

### 1. **Dedicated Dashboard Interface**
Located at: `/dashboard/leave-management`

Staff with `hr_leave_office` role can access:
- **Leave Management Tab**: View and approve all pending leave requests
- **Leave Planning Tab**: Submit and manage own leave requests  
- **Leave Analytics Tab** (exclusive to HR roles): Analytics and insights about leave trends
- **Balance & Calendar Tab**: Leave balance calculations and calendar views

### 2. **Key Responsibilities**
The HR Leave Office admin can:
- ✅ Review leave requests from staff
- ✅ Calculate holiday and weekend deductions (backend calculation)
- ✅ Approve or reject leave requests
- ✅ Generate leave memos for payment processing
- ✅ Defer/extend leave if needed
- ✅ View comprehensive leave analytics
- ✅ Track leave balance and calendar

## How to Assign HR Leave Office Role

### Step 1: Access Staff Management
1. Navigate to: **Administration** → **Staff Management**
2. Search for the staff member to assign as HR Leave Office admin

### Step 2: Edit Staff Role
1. Click the staff member to open their profile
2. In the role dropdown, select: **"HR Leave Office"** 
   - ⚠️ Note: This option is ONLY VISIBLE to Admin users
3. Ensure proper Location Assignment: Set to the location where they work (e.g., "QCC Head Office")
4. Click **"Update Staff"** to save

### Step 3: Verify Access
1. Log in with the HR Leave Office staff account
2. Navigate to: **Dashboard** → **Leave Management**
3. You should see:
   - Leave Management tab (with request queue)
   - Leave & HR Leave tab (planning interface)
   - **Leave Analytics tab** (unique to HR roles)
   - Balance & Calendar tab

## Role Configuration Details

### Database Role Value
The system stores this role as: `"hr_leave_office"` (all lowercase with underscores)

### Associated Permissions
The `hr_leave_office` role grants access to:
- View all leave requests across staff
- Approve/reject annual leave
- Calculate holiday deductions
- Generate payment memos for accounts
- Bulk archive leave requests
- View analytics and reporting

### Related Roles
- `manager_hr` - HR Manager
- `director_hr` - HR Director  
- `hr_office` - Also includes HR Leave Office permissions
- `admin` - Full system access

## Leave Processing Workflow

### When an Annual Leave is Submitted:
1. **Staff submits** → Selects dates, reason, leave type
2. **HOD reviews** (14 days) → Endorses or suggests changes
3. **HR Leave Office reviews** → Calculates working days, deducts holidays, adjusts dates if needed
4. **HR Approval** → Final approval by HR authority
5. **Payment Processing** → Payment memo generated for Accounts department

### What HR Leave Office Does:
- Receives all HOD-endorsed leave requests
- Performs final validation and calculations
- Deducts public holidays from leave duration
- May extend leave if public holidays fall within period
- Generates leave memo for accounting/payment
- Routes to final HR approval

## Troubleshooting

### "I don't see HR Leave Office option"
- **Solution**: Log in as Admin to assign roles. The role dropdown is Admin-only.

### "Staff assigned but still can't see analytics tab"
- **Solution**: Ensure role is saved as exactly `"hr_leave_office"` in database
- Check that user has logged out and logged back in to refresh permissions

### "Can't approve leave requests"
- **Solution**: Ensure the staff member is in the `leave_plan_reviews` queue
- Check that leave request status is "pending_hr_office_review"

## Files Related to HR Leave Office

| File | Purpose |
|------|---------|
| `/app/dashboard/leave-management/page.tsx` | Main leave management page (checks `hr_leave_office` role) |
| `/app/dashboard/leave-management/leave-management-client.tsx` | Leave request queue UI |
| `/app/api/leave/planning/hr-office/route.ts` | HR Leave Office approval API |
| `/app/api/leave/planning/payment-memo/route.ts` | Payment memo generation |
| `/components/admin/staff-management.tsx` | Staff role assignment UI (line 644, 804, 981) |

## Next Steps

1. **Assign HR Leave Office role** to qualified HR staff member(s)
2. **Test the interface** by logging in as the assigned staff
3. **Try approving a leave request** to validate the workflow
4. **Set up admin user for holidays management** to provide yearly holiday data
