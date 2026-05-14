-- Migration 062: Outstanding Leave Tracking - SIMPLIFIED
-- Creates table to track annual leave carryover and outstanding balances

-- Create function for timestamp updates
CREATE OR REPLACE FUNCTION modfn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the table
CREATE TABLE IF NOT EXISTS public.outstanding_leave_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year_period character varying NOT NULL,
  opening_balance integer DEFAULT 0,
  entitlement_days integer DEFAULT 0,
  used_this_period integer DEFAULT 0,
  carryover_to_next_year integer DEFAULT 0,
  max_carryover_allowed integer DEFAULT 5,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_period UNIQUE(user_id, leave_year_period)
);

-- Enable RLS
ALTER TABLE public.outstanding_leave_balances ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "Allow inserts for outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "HR staff can update outstanding balances" ON public.outstanding_leave_balances;

-- Simple RLS policies
CREATE POLICY "Anyone can select outstanding leave balances"
ON public.outstanding_leave_balances FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert outstanding leave balances"
ON public.outstanding_leave_balances FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update outstanding leave balances"
ON public.outstanding_leave_balances FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_outstanding_leave_user_period
ON public.outstanding_leave_balances(user_id, leave_year_period);

CREATE INDEX IF NOT EXISTS idx_outstanding_leave_year
ON public.outstanding_leave_balances(leave_year_period);

-- Create trigger
DROP TRIGGER IF EXISTS outstanding_leave_balances_update_timestamp ON public.outstanding_leave_balances;
CREATE TRIGGER outstanding_leave_balances_update_timestamp
BEFORE UPDATE ON public.outstanding_leave_balances
FOR EACH ROW
EXECUTE FUNCTION modfn_update_timestamp();
