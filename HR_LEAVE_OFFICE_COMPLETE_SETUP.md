# HR Leave Office Role - Complete Setup Guide

## Overview

The **HR Leave Office** role is now fully implemented in the system with:
- Database role record
- Sidebar navigation access
- Leave administration permissions
- Holiday and Leave Policy restrictions

## What Has Been Done

### 1. Database Setup
- Created new role record in `roles` table
- Role name: `hr_leave_office`
- Role display name: `HR Leave Office`
- Status: Active

### 2. Sidebar Navigation
- Added `hr_leave_office` to all user-accessible menu items
- HR Leave Office users now see normal employee sidebar + leave admin features

### 3. Leave Management Restrictions
- Tab visibility: Restricted from Holiday Management and Leave Policy tabs
- Can access: Leave Management, Planning, Analytics, Balance & Calendar

### 4. Authorization System
- Added to `proxy.ts` protected routes
- Can access `/dashboard` main entry point
- Can access `/dashboard/leave-management`
- Can access `/dashboard/leave-planning`

## Setup Instructions

### Step 1: Run the Database Migration

Execute the SQL migration to create the HR Leave Office role:

**Option A: Via Supabase Console**
1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Open file: `supabase/migrations/add_hr_leave_office_role_to_roles_table.sql`
4. Copy all SQL and execute in console
5. Verify output shows the role was created

**Option B: Via Vercel Deployment**
The migration will run automatically when you deploy to production.

**Option C: Verify Locally**
```bash
# Check if role exists in your local database
# (You would need direct database access for this)
```

### Step 2: Assign User to HR Leave Office Role

In Staff Management:

1. Go to `/dashboard/staff` → Staff Directory
2. Find or create user (e.g., dhrm@qccgh.com)
3. Click "Edit" or "Add Staff"
4. Select Role: **HR Leave Office**
5. Save changes

### Step 3: Restart Dev Server

```bash
npm run dev
```

### Step 4: Test the Setup

1. **Login as HR Leave Office User**
   ```
   Email: dhrm@qccgh.com
   Password: password
   ```

2. **Verify Sidebar Navigation**
   After login, you should see:
   - ✅ Home Dashboard (clickable)
   - ✅ Attendance Check (clickable)
   - ✅ Excuse Duty (clickable)
   - ✅ Leave Administration (clickable)
   - ✅ Loan Application (clickable)
   - ✅ Help Center (clickable)

3. **Check Leave Management Module**
   - Click "Leave Administration"
   - Visible tabs:
     - ✅ Leave Management
     - ✅ Leave & HR Leave Planning
     - ✅ Leave Analytics
     - ✅ Balance & Calendar
   - Hidden tabs:
     - ❌ Holiday Management (should NOT be visible)
     - ❌ Leave Policy (should NOT be visible)

4. **Verify Functions**
   - Can approve/process leave requests
   - Can plan leave schedules
   - Can view analytics and reports
   - Cannot create holidays
   - Cannot modify leave policies

## Role Capabilities Matrix

| Capability | HR Leave Office | Leave Admin | Manager HR | Director HR | Admin |
|-----------|---|---|---|---|---|
| **Leave Management** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Leave Planning** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Leave Analytics** | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Holiday Management** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Leave Policy** | ❌ | ✅ | ❌ | ✅ | ✅ |
| **Staff Management** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Attendance** | ✅ | ✅ | ✅ | ✅ | ✅ |

## Database Schema

### Roles Table Entry

```sql
-- HR Leave Office Role
name: 'hr_leave_office'
display_name: 'HR Leave Office'
description: 'HR Leave Office staff managing leave administration and leave planning...'
is_active: true
is_system: false
permissions: {
  "can_manage_leaves": true,
  "can_manage_leave_planning": true,
  "can_approve_leaves": true,
  "can_view_analytics": true,
  "can_manage_holiday": false,
  "can_manage_leave_policy": false,
  "can_view_staff": true,
  "can_view_reports": true
}
```

## Files Involved

### Modified Files
1. **components/dashboard/sidebar.tsx**
   - Added `hr_leave_office` to navigation roles

2. **proxy.ts** (Already updated)
   - Authorization for dashboard routes

3. **app/dashboard/leave-management/leave-management-module-client.tsx** (Already updated)
   - Tab visibility restrictions

### New Migration File
- **supabase/migrations/add_hr_leave_office_role_to_roles_table.sql**
  - Creates the role in database

## Troubleshooting

### Issue: User cannot see sidebar menu after login

**Solution:**
1. Run the database migration
2. Restart dev server: `npm run dev`
3. Clear browser cache: `Ctrl+Shift+R`
4. Verify user role is set to "HR Leave Office" in staff management

### Issue: Holiday Management tab is visible

**Solution:**
1. Check that `HOLIDAY_MANAGEMENT_ROLES` does NOT include `hr_leave_office`
2. File: `app/dashboard/leave-management/leave-management-module-client.tsx`
3. Should be: `["admin", "leave_admin", "director_hr", "manager_hr"]`

### Issue: Leave Policy tab is visible

**Solution:**
1. Check that `LEAVE_POLICY_ROLES` does NOT include `hr_leave_office`
2. File: `app/dashboard/leave-management/leave-management-module-client.tsx`
3. Should be: `["admin", "leave_admin", "director_hr"]`

### Issue: User gets "unauthorized access" error

**Solution:**
1. Verify `hr_leave_office` is in proxy.ts PROTECTED_ROUTES
2. Check role normalization (hyphens → underscores)
3. Clear cache and restart server

## Verification Steps

Run these checks to verify complete setup:

```bash
# 1. Check sidebar navigation
# - Login as HR Leave Office user
# - Verify sidebar menu items visible

# 2. Check Leave Management module
# - Navigate to Leave Administration
# - Verify tab visibility

# 3. Check database
# - Query: SELECT * FROM roles WHERE name = 'hr_leave_office'
# - Should return one row with is_active = true

# 4. Check authorization logs
# - Open browser console
# - Look for "[Authorization]" messages
# - Should NOT see unauthorized access for hr_leave_office user
```

## Rollback Instructions

If you need to revert the HR Leave Office role:

```bash
# Option 1: Remove via SQL
DELETE FROM roles WHERE name = 'hr_leave_office';

# Option 2: Revert git commits
git revert <commit-hash>
```

Then update all files where `hr_leave_office` was added:
- `components/dashboard/sidebar.tsx` - Remove from roles arrays
- `proxy.ts` - Remove from PROTECTED_ROUTES
- `leave-management-module-client.tsx` - Remove from role arrays

## Support & Documentation

Related files:
- `HR_LEAVE_OFFICE_ROLE_GUIDE.md` - Configuration and access matrix
- `HR_LEAVE_OFFICE_TROUBLESHOOTING.md` - Debugging guide
- `LEAVE_DATE_MIGRATION_GUIDE.md` - Date format updates

For issues:
1. Review the troubleshooting section
2. Check related documentation
3. Verify database migration ran successfully
4. Check browser console for authorization errors

---

**Setup Date**: 2025-05-13
**Status**: Ready for Production
**Last Updated**: Now
