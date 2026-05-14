-- Migration: 062_outstanding_leave_tracking.sql
-- Description: Create table to track annual leave carryover and outstanding balances
-- Status: Safe additive change - new table only

-- Step 1: Create function for updating timestamps
CREATE OR REPLACE FUNCTION modfn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create the main table
CREATE TABLE IF NOT EXISTS public.outstanding_leave_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year_period character varying NOT NULL,
  opening_balance integer NOT NULL DEFAULT 0,
  entitlement_days integer NOT NULL DEFAULT 0,
  used_this_period integer NOT NULL DEFAULT 0,
  carryover_to_next_year integer DEFAULT 0,
  max_carryover_allowed integer DEFAULT 5,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_period UNIQUE(user_id, leave_year_period)
);

-- Step 3: Enable RLS
ALTER TABLE public.outstanding_leave_balances ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if they exist (to avoid errors on re-run)
DROP POLICY IF EXISTS "Users can view their own outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "HR staff can view all outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "HR staff can update outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "System can insert outstanding balances" ON public.outstanding_leave_balances;

-- Step 5: Create simple, robust RLS policies
-- Allow authenticated users to see their own records
CREATE POLICY "Users can view their own outstanding balances"
ON public.outstanding_leave_balances FOR SELECT
USING (auth.uid() = user_id OR auth.jwt()->>'role' IN ('admin', 'hr', 'hr_office'));

-- Allow inserts for data migration
CREATE POLICY "Allow inserts for outstanding balances"
ON public.outstanding_leave_balances FOR INSERT
WITH CHECK (true);

-- Allow updates for HR staff
CREATE POLICY "HR staff can update outstanding balances"
ON public.outstanding_leave_balances FOR UPDATE
USING (auth.jwt()->>'role' IN ('admin', 'hr', 'hr_office'))
WITH CHECK (auth.jwt()->>'role' IN ('admin', 'hr', 'hr_office'));

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_outstanding_leave_user_period
ON public.outstanding_leave_balances(user_id, leave_year_period);

CREATE INDEX IF NOT EXISTS idx_outstanding_leave_year
ON public.outstanding_leave_balances(leave_year_period);

-- Step 7: Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS outstanding_leave_balances_update_timestamp ON public.outstanding_leave_balances;

CREATE TRIGGER outstanding_leave_balances_update_timestamp
BEFORE UPDATE ON public.outstanding_leave_balances
FOR EACH ROW
EXECUTE FUNCTION modfn_update_timestamp();
