# Staff Management Roles Setup Guide

## Overview

This guide provides scripts and instructions to add the "Loan Office Admin" role and other administrative roles to the Staff Management module dropdown selection.

## Roles Being Added

1. **Loan Office Admin** - Administrator for loan office operations and staff management
2. **Loan Office** - Loan office staff processing loans (update/verify)
3. **Accounts** - Accounts/Finance staff
4. **HR Office** - HR Office staff managing leave office operations  
5. **Regional HR Leave** - Regional HR Leave administrator

## Prerequisites

- Supabase project with database access
- Environment variables configured:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Setup Methods

### Method 1: Using Node.js Script (Recommended)

This is the easiest and most portable method:

```bash
# Install dependencies (if not already installed)
npm install

# Run the setup script
node scripts/setup-roles.js
```

The script will:
- Connect to your Supabase database
- Create or update all required roles
- Display a summary of changes
- Provide next steps

### Method 2: Using Shell Script

For Unix/Linux/Mac users:

```bash
# Make the script executable
chmod +x scripts/setup-roles.sh

# Set your database URL
export POSTGRES_URL="postgresql://user:password@host:port/database"

# Run the setup
bash scripts/setup-roles.sh
```

### Method 3: Direct SQL Migration

If you prefer to run SQL directly in Supabase SQL Editor:

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Click "New Query"
4. Copy the contents of `supabase/migrations/add_missing_roles.sql`
5. Click "Run"

### Method 4: Manual Database Update

Connect to your Supabase database using a SQL client and execute:

```sql
INSERT INTO roles (id, name, display_name, description, is_active, is_system, created_at, updated_at, permissions)
VALUES (
  gen_random_uuid(),
  'loan_office_admin',
  'Loan Office Admin',
  'Administrator for loan office operations and staff management',
  true,
  false,
  NOW(),
  NOW(),
  jsonb_build_object(
    'can_manage_loans', true,
    'can_manage_staff', true,
    'can_approve_loans', false,
    'can_view_analytics', true
  )
)
ON CONFLICT (name) DO UPDATE
SET display_name = 'Loan Office Admin', updated_at = NOW();
```

## Verification

After running the setup script, verify the roles were added:

```bash
# In Supabase SQL Editor, run:
SELECT name, display_name, is_active FROM roles WHERE name LIKE '%loan%' OR name = 'accounts' OR name = 'hr_office';
```

Expected output:
```
| name                | display_name       | is_active |
|---------------------|-------------------|-----------|
| loan_office         | Loan Office        | true      |
| loan_office_admin   | Loan Office Admin  | true      |
| accounts            | Accounts           | true      |
| hr_office           | HR Office          | true      |
| regional_hr_leave   | Regional HR Leave  | true      |
```

## Component Changes

The following component has been updated to include the new roles in the dropdown:

**File**: `components/admin/staff-management.tsx`

Changes made:
1. Added `loan_office_admin` to the role filter dropdown (line ~650)
2. Added `loan_office_admin` to the "Add Staff" modal role selection (line ~810)
3. Added `loan_office_admin` to the "Edit Staff" modal role selection (line ~991)

## Next Steps

1. Run one of the setup methods above
2. Restart your development server:
   ```bash
   npm run dev
   ```
3. Navigate to the Staff Management module
4. Open the "Add Staff" dialog
5. You should now see "Loan Office Admin" in the role dropdown
6. You can now assign staff to this role

## Troubleshooting

### "Role already exists" error
This is normal and expected. The scripts are idempotent and will update existing roles with new permissions and descriptions.

### "Permission denied" error
- Ensure you're using `SUPABASE_SERVICE_ROLE_KEY` (not the anon key)
- Ensure your `POSTGRES_URL` has proper credentials
- Check that the roles table exists in your database

### Role doesn't appear in dropdown
1. Clear your browser cache
2. Restart the dev server
3. Hard refresh the page (Ctrl+Shift+R)
4. Verify the role was created using the verification query above

### Database connection failed
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correctly set
- Verify the values don't have extra spaces
- Test the connection: `npm run dev` should show successful connection

## API Integration

When roles are assigned to staff members through the UI, the API endpoint `PUT /api/admin/staff/:id` handles the update:

```javascript
{
  role: "loan_office_admin", // Now available
  first_name: "John",
  last_name: "Doe",
  // ... other fields
}
```

## File Locations

- **Migration SQL**: `supabase/migrations/add_missing_roles.sql`
- **Node Setup**: `scripts/setup-roles.js`
- **Shell Setup**: `scripts/setup-roles.sh`
- **Component**: `components/admin/staff-management.tsx`

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the setup script output for specific errors
3. Verify database connectivity
4. Ensure all environment variables are set
5. Check the migration/setup script logs in `supabase/migrations/`

## Rollback

If you need to remove the newly added role:

```sql
DELETE FROM roles WHERE name = 'loan_office_admin';
```

However, note that if staff are assigned to this role, you should reassign them first:

```sql
UPDATE user_profiles SET role = 'loan_office' WHERE role = 'loan_office_admin';
DELETE FROM roles WHERE name = 'loan_office_admin';
```
