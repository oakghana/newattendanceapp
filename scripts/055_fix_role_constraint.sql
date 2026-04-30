-- Fix user_profiles role check constraint to include all new roles
-- Run this in Supabase SQL Editor

-- Drop both possible constraint names (safe if one doesn't exist)
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Add the updated constraint with all current roles
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
      'director_hr',
      'manager_hr',
      'hr_office',
      'loan_committee',
      'committee'
    )
  );
