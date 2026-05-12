# Role Name Change: hr_leave_office_admin → leave_admin

## Overview
To resolve the database character length constraint issue, the role name has been changed from `hr_leave_office_admin` to `leave_admin`.

## Why This Change?
- **Old name**: `hr_leave_office_admin` = 21 characters ❌ (exceeds varchar(20) limit)
- **New name**: `leave_admin` = 10 characters ✅ (fits within varchar(20) limit)
- **Benefit**: No need for schema migration or column type alteration

## What Changed

### Role Details
| Property | Value |
|----------|-------|
| **Database Value** | `leave_admin` (was `hr_leave_office_admin`) |
| **Display Name** | "HR-Leave-Office-Admin" (display name unchanged) |
| **Functionality** | Exactly the same - full admin access to leave management |

### Updated Files (80 references total)
1. `/components/admin/staff-management.tsx` - Role dropdown display
2. `/app/dashboard/leave-management/page.tsx` - Permission checks
3. `/app/dashboard/leave-management/leave-management-client.tsx` - Client permissions
4. `/app/api/admin/staff/route.ts` - Staff creation API
5. `/app/api/admin/staff/[id]/route.ts` - Staff update API
6. All documentation files

### Database Constraints
Run this SQL to update the constraints:

```sql
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (
  role IN (
    'admin','it-admin','department_head','regional_manager','nsp','intern','contract','staff',
    'audit_staff','accounts','loan_office','hr_office','leave_admin','hr_leave_office',
    'regional_hr_leave','director_hr','manager_hr','loan_committee','committee'
  )
);

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE user_profiles ADD CONSTRAINT valid_role CHECK (
  role IN (
    'admin','it-admin','department_head','regional_manager','nsp','intern','contract','staff',
    'audit_staff','accounts','loan_office','hr_office','leave_admin','hr_leave_office',
    'regional_hr_leave','director_hr','manager_hr','loan_committee','committee'
  )
);
```

## Impact
- ✅ No data migration needed
- ✅ No schema changes required
- ✅ All permissions and functionality remain the same
- ✅ Resolves HTTP 400 error (code 22001)
- ✅ Staff assignments continue to work seamlessly

## Testing

After applying the SQL migration:

1. **Refresh the app** (Ctrl+R)
2. Go to **Settings → Staff Management**
3. Try to update or create staff with role: **"HR-Leave-Office-Admin"**
4. Should now succeed without 22001 error ✅

## Migration Steps

1. Run the SQL constraints above in Supabase SQL Editor
2. Verify constraints were updated
3. Refresh your application
4. Test staff role assignments

## Related Documentation
- `/ROLE_BASED_ACCESS_CONTROL.md` - Permission structure
- `/HR_LEAVE_OFFICE_AND_EXPORT.md` - Leave office admin features
- `/REGIONAL_HR_LEAVE_ROLE.md` - Regional HR leave role

