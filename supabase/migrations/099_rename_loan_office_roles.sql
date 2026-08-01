-- Migration: Rename loan_office role to department-specific roles
-- Reason: Eliminate confusion by making role names include department context
-- Date: 2026-08-01

BEGIN;

-- Step 1: Rename loan_office role in auth.app_role enum
ALTER TYPE auth.app_role RENAME VALUE 'loan_office' TO 'hr_loan_office';

-- Step 2: Create new accounts_loan_office role value
-- First, we need to create a new enum type with both values, then swap
CREATE TYPE auth.app_role_new AS ENUM (
  'staff',
  'manager',
  'director',
  'admin',
  'hr_leave_office',
  'hr_executive',
  'manager_hr',
  'director_hr',
  'accounts',
  'accounts_executive',
  'hr_loan_office',
  'accounts_loan_office',
  'regional_loan_office'
);

-- Step 3: Alter the column to use new type
ALTER TABLE auth.users 
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE auth.app_role_new USING role::text::auth.app_role_new,
  ALTER COLUMN role SET DEFAULT 'staff'::auth.app_role_new;

-- Step 4: Drop old enum type and rename new one
DROP TYPE auth.app_role;
ALTER TYPE auth.app_role_new RENAME TO app_role;

-- Step 5: Update existing users to have accounts_loan_office if they're in Accounts department
UPDATE auth.users u
SET role = 'accounts_loan_office'::auth.app_role
WHERE role = 'hr_loan_office'::auth.app_role
  AND u.id IN (
    SELECT p.id 
    FROM auth.user_profiles p 
    WHERE LOWER(p.department_name) LIKE '%account%' 
       OR LOWER(p.department_name) LIKE '%finance%'
  );

-- Add comment documenting the change
COMMENT ON TYPE auth.app_role IS 'Application roles with department context. HR_LOAN_OFFICE and ACCOUNTS_LOAN_OFFICE are department-specific to prevent cross-department access.';

COMMIT;
