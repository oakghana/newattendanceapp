# HR Leave Office Role Assignment Guide

## Overview
The HR Leave Office role grants staff members access to the leave management dashboard where they can approve/reject annual leave requests, calculate holiday deductions, and generate payment memos.

## Who Can Assign the HR Leave Office Role

The HR Leave Office role can be assigned by:
- **Admin** - Full system administrator
- **Director HR** - HR department director  
- **Manager HR** - HR department manager

## How to Assign the HR Leave Office Role

### Step 1: Access Staff Management
1. Log in to the QCC Attendance system
2. Navigate to **Settings** (gear icon, top right)
3. Go to **Administration** → **Staff Management**
4. You should see the list of all staff members

### Step 2: Find the Staff Member
- Use the **Search** box to find the staff member by name or employee ID
- Filter by **Department** if needed
- Scroll through the list to find them manually

### Step 3: Edit the Staff Member
Click the **Edit** button on their row to open the edit dialog

### Step 4: Assign the HR Leave Office Role
1. In the **Role** dropdown, select **"HR Leave Office"**
2. The role option will appear for users with admin or HR leadership permissions
3. Ensure **Assigned Location** is set to their work location
4. Click **"Update Staff"** to save

### Step 5: Verify the Assignment
- The page will show a success message: "Staff member updated successfully"
- The staff member's row will update to show `Role: hr_leave_office`
- The staff member can now log in and access the HR Leave Office dashboard

## What HR Leave Office Users Can Do

Once assigned the HR Leave Office role, staff can:

### View Leave Dashboard
- Access `/dashboard/leave-management`
- See all leave requests from staff members
- Filter by status, department, and date range

### Approve/Reject Leave
- **Review** pending requests with full details
- **Approve** requests (moves to final HR approval stage)
- **Reject** requests with reason documentation
- **Withdraw** rejected requests if needed

### Calculate Leave Deductions
- Automatically deduct **public holidays** from leave days
- Deduct **travelling days** if applicable
- Final calculation shows net working days approved

### Generate Payment Memos
- Create payment memos for accounting department
- Memos include: employee details, leave period, working days, holiday deductions
- Memos are sent to the Accounts department for payment processing

### View Analytics
- Leave request statistics by department
- Approval rate metrics
- Holiday impact analysis

## Troubleshooting

### "HR Leave Office" Option Not Showing
**Cause:** The current user doesn't have permission to assign this role

**Solution:**
- Ensure you're logged in as Admin, Director HR, or Manager HR
- Check your own user profile role
- Ask an administrator to verify your permissions

### Role Updated But Not Taking Effect
**Cause:** The system needs to fetch the updated role

**Solution:**
- Have the staff member **log out completely** and log back in
- Clear browser cache (Ctrl+Shift+Delete)
- Wait 5-10 minutes for role synchronization

### Staff Member Can't Access Leave Management
**Cause:** Role may not have been saved correctly

**Solution:**
1. Verify the role is showing as `hr_leave_office` in the staff list
2. Ask the staff member to try accessing `/dashboard/leave-management` directly
3. Check browser console (F12) for any error messages
4. If still not working, re-assign the role

## Database Role Values

The system uses the following role value for internal storage:
- **Database value:** `hr_leave_office`
- **Display name:** `HR Leave Office`
- **Permissions:** Can approve/reject annual leave, calculate deductions, generate memos

## Related Roles

- **HR Office** (`hr_office`) - Deprecated, use HR Leave Office instead
- **Manager HR** (`manager_hr`) - Can manage HR Leave Office assignments
- **Director HR** (`director_hr`) - Can manage HR Leave Office assignments
- **Admin** (`admin`) - Can manage all roles including HR Leave Office

## API Endpoints

HR Leave Office staff use these endpoints:
- `GET /api/leave/requests` - View leave requests
- `PUT /api/leave/requests/[id]/approve` - Approve request
- `PUT /api/leave/requests/[id]/reject` - Reject request
- `POST /api/leave/requests/[id]/payment-memo` - Generate payment memo

## Contact Support

If you're unable to assign the HR Leave Office role after following these steps:
1. Check that you have the correct admin credentials
2. Verify your own role is set to admin/director_hr/manager_hr
3. Clear your browser cache and try again
4. Contact IT support if the issue persists
