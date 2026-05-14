-- Migration: 066_create_regional_loan_office_role.sql
-- Description: Create a new role "regional_loan_office" that has similar access to regional_manager 
-- but cannot approve/endorse leaves or loans, only view and export data from their region
-- Status: Safe additive change

-- Add new role to user_profiles constraint if it doesn't already exist
-- First, get the current constraint and update it
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the check constraint name on the role column
  SELECT constraint_name INTO constraint_name
  FROM information_schema.table_constraints
  WHERE table_name = 'user_profiles'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%role%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    -- Drop the old constraint
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', constraint_name);
  END IF;

  -- Add the new constraint with the additional role
  ALTER TABLE user_profiles 
  ADD CONSTRAINT user_profiles_role_check CHECK (
    role IN (
      'admin','it-admin','department_head','regional_manager',
      'regional_loan_office', -- NEW ROLE
      'nsp','intern','contract','staff','audit_staff','accounts',
      'loan_office','hr_office','hr_leave_office','director_hr',
      'manager_hr','loan_committee','committee'
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Constraint might already exist, continue
  NULL;
END $$;

-- Create a new table for regional_loan_office location assignments
CREATE TABLE IF NOT EXISTS public.regional_loan_office_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  regional_loan_office_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  region_id uuid,
  location_name text,
  region_name text,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  CONSTRAINT unique_rlo_location UNIQUE(regional_loan_office_id, location_id)
);

-- Enable RLS
ALTER TABLE public.regional_loan_office_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for regional_loan_office_locations
CREATE POLICY "Regional loan office can view their own assignments"
ON public.regional_loan_office_locations FOR SELECT
USING (
  auth.uid() = regional_loan_office_id
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can manage regional loan office assignments"
ON public.regional_loan_office_locations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_regional_loan_office_locations_rlo_id 
ON public.regional_loan_office_locations(regional_loan_office_id);

CREATE INDEX IF NOT EXISTS idx_regional_loan_office_locations_location_id 
ON public.regional_loan_office_locations(location_id);

CREATE INDEX IF NOT EXISTS idx_regional_loan_office_locations_region_id 
ON public.regional_loan_office_locations(region_id);

-- Audit log entry
INSERT INTO public.audit_logs (user_id, table_name, action, details, created_at)
VALUES (
  NULL,
  'user_profiles',
  'MIGRATION',
  jsonb_build_object('description', 'Created regional_loan_office role and regional_loan_office_locations table'),
  now()
);
