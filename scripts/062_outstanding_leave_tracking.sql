-- Migration: 062_outstanding_leave_tracking.sql
-- Description: Create table to track annual leave carryover and outstanding balances
-- Status: Safe additive change - new table only

-- Create function for updating timestamps if it doesn't exist
CREATE OR REPLACE FUNCTION modfn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.outstanding_leave_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year_period character varying NOT NULL, -- e.g., "2024", "2025"
  opening_balance integer NOT NULL DEFAULT 0, -- Balance carried over from previous year
  entitlement_days integer NOT NULL DEFAULT 0, -- Annual entitlement for current year
  used_this_period integer NOT NULL DEFAULT 0, -- Days used in current year
  carryover_to_next_year integer DEFAULT 0, -- Days to carry over to next year
  max_carryover_allowed integer DEFAULT 5, -- Policy: max days that can be carried over
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_period UNIQUE(user_id, leave_year_period)
);

-- Enable RLS
ALTER TABLE public.outstanding_leave_balances ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view their own outstanding balances
CREATE POLICY "Users can view their own outstanding balances"
ON public.outstanding_leave_balances FOR SELECT
USING (auth.uid() = user_id);

-- HR staff can view all outstanding balances
CREATE POLICY "HR staff can view all outstanding balances"
ON public.outstanding_leave_balances FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('hr', 'admin', 'hr_office')
  )
);

-- HR staff can update outstanding balances (for carryover adjustments)
CREATE POLICY "HR staff can update outstanding balances"
ON public.outstanding_leave_balances FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('hr', 'admin', 'hr_office')
  )
);

-- System can insert outstanding balances (through API)
CREATE POLICY "System can insert outstanding balances"
ON public.outstanding_leave_balances FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_outstanding_leave_user_period
ON public.outstanding_leave_balances(user_id, leave_year_period);

CREATE INDEX IF NOT EXISTS idx_outstanding_leave_year
ON public.outstanding_leave_balances(leave_year_period);

-- Create audit trigger to track updates
CREATE TRIGGER outstanding_leave_balances_update_timestamp
BEFORE UPDATE ON public.outstanding_leave_balances
FOR EACH ROW
EXECUTE FUNCTION modfn_update_timestamp();
