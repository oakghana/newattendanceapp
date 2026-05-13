# Role-Based Access Control for Leave Administration

## Overview
The system implements strict role-based access control to separate general HR functions from dedicated leave administration. Only the **HR-Leave-Office-Admin** role has full administrative capabilities.

---

## Role Permissions Matrix

### HR-Leave-Office-Admin Role
**Full Administrative Access**
- ✅ Staff Management (assign/modify roles)
- ✅ Settings & Linkages tab
- ✅ Holiday Declarations
- ✅ Leave Days Updates
- ✅ Leave Analytics Dashboard
- ✅ Template Management (create, edit, delete)
- ✅ Approve/Reject all leave types
- ✅ Generate Payment Memos
- ✅ Archive processed leaves
- ✅ View all staff leave requests

**Assignment**: Only **Admin** users can assign this role

**Database Value**: `leave_admin`

---

### HR Leave Office Role
**Basic Leave Approval Only**
- ✅ View leave requests
- ✅ Approve/Reject individual leaves
- ✅ View leave management dashboard
- ❌ NO Settings & Linkages access
- ❌ NO Holiday Declaration access
- ❌ NO Leave Days Update access
- ❌ NO Admin template management
- ❌ NO Analytics dashboard
- ❌ Cannot assign roles
- ❌ Cannot access Staff Management

**Assignment**: Only **Admin** users can assign this role

**Database Value**: `hr_leave_office`

---

### Director HR Role
**Removed from Leave Administration**
- ❌ Cannot access Staff Management menu
- ❌ Cannot assign roles
- ❌ Cannot access leave-management dashboard
- ❌ Cannot approve/reject leaves
- ❌ Cannot manage templates
- ❌ Cannot view admin analytics

**Note**: If Director HR needs leave management capabilities, they must be assigned the **HR-Leave-Office-Admin** role

---

### Manager HR Role
**Removed from Leave Administration**
- ❌ Cannot access Staff Management menu
- ❌ Cannot assign roles
- ❌ Cannot access leave-management dashboard
- ❌ Cannot approve/reject leaves
- ❌ Cannot manage templates
- ❌ Cannot view admin analytics

**Note**: If Manager HR needs leave management capabilities, they must be assigned the **HR-Leave-Office-Admin** role

---

## How to Assign HR-Leave-Office-Admin Role

### Prerequisites
- Only **Admin** users can assign this role
- Staff member must already be created in the system

### Steps
1. Log in as **Admin**
2. Go to **Settings → Administration → Staff Management**
3. Search for the staff member
4. Click **Edit** on their record
5. In the **Role** dropdown, select **"HR-Leave-Office-Admin"**
6. Ensure a location is assigned
7. Click **"Update Staff"** to save

---

## API Endpoint Role Checks

The system validates role permissions at the API level:

### Approve/Reject Leave Endpoints
**Allowed Roles**: `["admin", "department_head", "regional_manager", "hr_officer", "hr_director", "loan_office"]`
- Director HR: ❌ NOT allowed
- Manager HR: ❌ NOT allowed

### Leave Analytics
**Allowed Roles**: `["loan_office", "leave_admin", "admin", "hr_office", "hr"]`
- Director HR: ❌ NOT allowed
- Manager HR: ❌ NOT allowed

### Template Viewing
**Allowed Roles**: `["admin", "hr_officer", "hr_director", "leave_admin"]`
- Director HR: ❌ NOT allowed
- Manager HR: ❌ NOT allowed

### Template Editing
**Allowed Roles**: `["admin", "hr_director", "leave_admin"]`
- Director HR: ❌ NOT allowed
- Manager HR: ❌ NOT allowed

---

## Files Modified

1. **`/components/admin/staff-management.tsx`**
   - Line 810: Only admin can assign HR-Leave-Office-Admin role (new staff)
   - Line 987: Only admin can assign HR-Leave-Office-Admin role (edit staff)

2. **`/app/dashboard/leave-management/leave-management-module-client.tsx`**
   - Line 12: HR_ANALYTICS_ROLES restricted to `["loan_office", "leave_admin", "admin", "hr_office", "hr"]`

3. **`/app/dashboard/leave-management/page.tsx`**
   - Lines 73-74: Removed director_hr and manager_hr from canReviewLeave

4. **`/app/dashboard/leave-management/leave-management-client.tsx`**
   - Line 352: handleApprove - removed director_hr and manager_hr
   - Line 397: handleDismiss - removed director_hr and manager_hr
   - Line 464: canUseStaffLeaveHub - removed director_hr and manager_hr
   - Line 465: isManagerView - removed director_hr and manager_hr
   - Line 467: canViewHrTemplates - removed director_hr and manager_hr
   - Line 468: canEditHrTemplates - removed director_hr and manager_hr

---

## Testing Role Restrictions

### Test as HR-Leave-Office-Admin
- ✅ Can see all tabs: Leave Management, Leave & HR Leave, Leave Analytics, Balance & Calendar
- ✅ Can approve/reject leaves
- ✅ Can manage templates
- ✅ Can view settings

### Test as HR Leave Office
- ✅ Can see: Leave Management, Leave & HR Leave, Balance & Calendar
- ❌ NO Leave Analytics tab
- ❌ NO Settings access
- ❌ NO template management

### Test as Director HR
- ❌ Cannot access `/dashboard/leave-management`
- ❌ Cannot access `/dashboard/staff`
- ❌ Cannot see "User Management" in settings

### Test as Manager HR
- ❌ Cannot access `/dashboard/leave-management`
- ❌ Cannot access `/dashboard/staff`
- ❌ Cannot see "User Management" in settings

---

## Permission Hierarchy

```
Admin (Full System Access)
├─ Can assign HR-Leave-Office-Admin role
├─ Can manage all leave features
└─ Can assign all roles

HR-Leave-Office-Admin (Leave Administration ONLY)
├─ Full leave management access
├─ Settings & Linkages
├─ Holiday Declarations
├─ Leave Days Updates
├─ Templates & Analytics
└─ Cannot assign roles

HR Leave Office (Basic Approval)
├─ Approve/Reject leaves
└─ View leave requests

Department Head (Department-Level Leave Review)
├─ Endorse department leaves
└─ Cannot reject (HOD-only)

Director HR (General HR)
└─ No leave management access

Manager HR (General HR)
└─ No leave management access
```

---

## Troubleshooting

### "User cannot access Staff Management"
**Solution**: Only Admin users can access this page. Contact system admin if you need to assign roles.

### "HR-Leave-Office-Admin option not showing"
**Solution**: Ensure you are logged in as Admin. The option is only visible to admins in the role dropdown.

### "Director HR cannot see leave management"
**Solution**: By design. Assign them the **HR-Leave-Office-Admin** role if they need admin access to leaves.

### "Cannot approve/reject leaves"
**Solution**: Ensure the user has one of these roles: admin, department_head, regional_manager, hr_officer, hr_director, or loan_office. HR-Leave-Office-Admin requires one of these parent roles.

---

## Related Documentation
- See `/HR_LEAVE_OFFICE_ADMIN_ROLE.md` for HR-Leave-Office-Admin role details
- See `/HR_LEAVE_OFFICE_SETUP.md` for initial leave office setup
- See `/ANNUAL_LEAVE_VALIDATION_AND_CALCULATIONS.md` for leave calculations
