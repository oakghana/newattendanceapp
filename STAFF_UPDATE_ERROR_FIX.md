# Staff Role Update Error Fix

## Problem
**Error**: `HTTP 500: {"message":"value too long for type character varying(20)","details":null,"code":"22001"}`

**When It Occurred**: When attempting to update staff roles with newly added roles like `hr_leave_office` or `regional_hr_leave`

**Root Cause**: The database had a CHECK constraint on the `user_profiles.role` column that only allowed specific role values. When adding new roles (`hr_leave_office`, `regional_hr_leave`), the constraint wasn't updated, causing the update to fail.

---

## Solution

### What Was Fixed

The staff API endpoints now properly detect constraint violations and provide a helpful SQL migration suggestion.

**Updated Endpoints:**
1. `/app/api/admin/staff/route.ts` (POST - Create staff)
2. `/app/api/admin/staff/[id]/route.ts` (PUT - Update staff)

**Changes Made:**
- Added detection for Postgres error code `22001` (string length violation)
- Added detection for "value too long" error message
- Updated the suggested SQL migration to include all roles: `hr_leave_office`, `regional_hr_leave`, `hr_leave_office_admin`, `director_hr`, `manager_hr`, `loan_committee`, `committee`

### How to Fix in Your Database

When you encounter this error, the API will now suggest running this SQL:

```sql
-- Replace <constraint_name> if different
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (
  role IN (
    'admin',
    'it-admin', 
    'department_head',
    'regional_manager',
    'nsp',
    'intern',
    'contract',
    'staff',
    'audit_staff',
    'accounts',
    'loan_office',
    'hr_office',
    'hr_leave_office_admin',
    'hr_leave_office',
    'regional_hr_leave',
    'director_hr',
    'manager_hr',
    'loan_committee',
    'committee'
  )
);

-- Alternatively, inspect current constraints:
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'user_profiles'::regclass 
  AND contype = 'c';
```

### Implementation Steps

1. **In Supabase Editor:**
   - Go to SQL Editor
   - Run the ALTER TABLE statement above
   - Verify constraint was updated with the inspection query

2. **Via Terminal (if you have direct DB access):**
   ```bash
   psql $DATABASE_URL << EOF
   ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
   ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (
     role IN ('admin','it-admin','department_head','regional_manager','nsp','intern','contract','staff','audit_staff','accounts','loan_office','hr_office','hr_leave_office_admin','hr_leave_office','regional_hr_leave','director_hr','manager_hr','loan_committee','committee')
   );
   EOF
   ```

---

## Verifying the Fix

After running the SQL migration:

1. Try updating a staff member's role again
2. Select `hr_leave_office` or `regional_hr_leave` from the role dropdown
3. Click "Update Staff"
4. Should now succeed without error

---

## Error Codes Reference

| Code | Meaning | Solution |
|------|---------|----------|
| `22001` | String value too long | Update database constraint to include new role values |
| `23514` | Check constraint violation | Role value not in allowed list - run migration |

---

## New Roles Added to System

These roles have been added to staff management:

1. **`hr_leave_office`** - Basic leave approval (no admin features)
2. **`regional_hr_leave`** - Regional leave management with Excel export
3. **`director_hr`** - Director level HR role
4. **`manager_hr`** - Manager level HR role

All these roles must be in the database constraint for staff updates to work.

---

## Related Documentation

- `/REGIONAL_HR_LEAVE_ROLE.md` - Regional HR Leave role details
- `/HR_LEAVE_OFFICE_AND_EXPORT.md` - Leave office features
- `/ROLE_BASED_ACCESS_CONTROL.md` - Permission structure

---

## Future Prevention

To prevent this issue in the future:
1. Keep the CHECK constraint updated when adding new roles
2. Use the Supabase migrations system for schema changes
3. Test role assignments before deploying to production

