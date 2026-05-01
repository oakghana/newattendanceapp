-- Migration: Normalize legacy hr_office users to hr_leave_office
-- Date: 2026-05-01

BEGIN;

UPDATE public.user_profiles
SET role = 'hr_leave_office'
WHERE role = 'hr_office';

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT valid_role CHECK (
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
      'hr_leave_office',
      'director_hr',
      'manager_hr',
      'loan_committee',
      'committee'
    )
  );

COMMIT;