-- ============================================================
-- Migration: 099_rename_loan_office_roles.sql
-- Splits the generic 'loan_office' role into two department-specific roles:
--   HR dept       → hr_loan_office        (3 users affected)
--   Accounts dept → accounts_loan_office  (1 user affected)
--
-- APPLIED to production database on 2026-08-01
-- Role column is VARCHAR with a CHECK constraint on public.user_profiles
-- ============================================================

-- STEP 1: Drop the old role check constraint
ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- STEP 2: Recreate constraint with both new roles added
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role::text = ANY (ARRAY[
  'staff',
  'admin',
  'it-admin',
  'department_head',
  'regional_manager',
  'regional_hr',
  'nsp',
  'intern',
  'contract',
  'audit_staff',
  'accounts',
  'loan_office',           -- legacy: kept for backward compatibility
  'hr_loan_office',        -- NEW: HR department loan office staff
  'accounts_loan_office',  -- NEW: Accounts department loan office staff
  'hr_office',
  'hr_leave_office',
  'leave_admin',
  'director_hr',
  'manager_hr',
  'loan_committee',
  'committee',
  'managing_director',
  'secretary'
]::text[]));

-- STEP 3: Migrate HR department loan_office users → hr_loan_office
UPDATE public.user_profiles
SET role = 'hr_loan_office'
WHERE role = 'loan_office'
  AND department_id IN (
    SELECT id FROM public.departments
    WHERE name ILIKE '%hr%' OR name ILIKE '%human resource%'
  );

-- STEP 4: Migrate Accounts department loan_office users → accounts_loan_office
UPDATE public.user_profiles
SET role = 'accounts_loan_office'
WHERE role = 'loan_office'
  AND department_id IN (
    SELECT id FROM public.departments
    WHERE name ILIKE '%account%' OR name ILIKE '%finance%'
  );

-- STEP 5: Fallback — any remaining loan_office users (no matching dept) → hr_loan_office
UPDATE public.user_profiles
SET role = 'hr_loan_office'
WHERE role = 'loan_office';
