-- Migration: Allow HR Leave Office role in user_profiles role constraints
-- Date: 2026-05-01

BEGIN;

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
      'hr_office',
      'hr_leave_office',
      'director_hr',
      'manager_hr',
      'loan_committee',
      'committee'
    )
  );

COMMIT;
