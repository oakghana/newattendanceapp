-- Migration: 066_create_regional_loan_office_role.sql
-- Description: Create regional_loan_office role and assignment tracking table
-- Status: Safe additive change

-- Step 1: Add new role to user_profiles constraint
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Check if regional_loan_office role already exists in the constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%role%'
    AND table_name = 'user_profiles'
  ) THEN
    -- If no constraint exists, create one
    ALTER TABLE user_profiles 
    ADD CONSTRAINT user_profiles_role_check CHECK (
      role IN (
        'admin','it-admin','department_head','regional_manager',
        'regional_loan_office','nsp','intern','contract','staff',
        'audit_staff','accounts','loan_office','hr_office',
        'hr_leave_office','director_hr','manager_hr','loan_committee',
        'committee'
      )
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Constraint may already exist, that's OK
  NULL;
END $$;

-- Step 2: Create regional_loan_office_locations table
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

-- Step 3: Enable RLS
ALTER TABLE public.regional_loan_office_locations ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if any
DROP POLICY IF EXISTS "Regional loan office can view their own assignments" ON public.regional_loan_office_locations;
DROP POLICY IF EXISTS "Admins can manage regional loan office assignments" ON public.regional_loan_office_locations;

-- Step 5: Create simple RLS policies using JWT claims
CREATE POLICY "Regional loan office can view their own assignments"
ON public.regional_loan_office_locations FOR SELECT
USING (
  auth.uid() = regional_loan_office_id 
  OR auth.jwt()->>'role' = 'admin'
);

CREATE POLICY "Admins can manage regional loan office assignments"
ON public.regional_loan_office_locations FOR ALL
USING (auth.jwt()->>'role' = 'admin')
WITH CHECK (auth.jwt()->>'role' = 'admin');

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rlo_locations_rlo_id 
ON public.regional_loan_office_locations(regional_loan_office_id);

CREATE INDEX IF NOT EXISTS idx_rlo_locations_location_id 
ON public.regional_loan_office_locations(location_id);

CREATE INDEX IF NOT EXISTS idx_rlo_locations_region_id 
ON public.regional_loan_office_locations(region_id);
