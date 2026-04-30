-- Migration: Add new loan-related roles to user_profiles role constraint
-- Adds: accounts, loan_office, director_hr, manager_hr

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN (
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
    'director_hr',
    'manager_hr'
  ));
