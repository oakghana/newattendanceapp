-- Migration: 064_extend_leave_plan_requests.sql
-- Description: Extend leave_plan_requests table with category and balance tracking fields
-- Status: Safe additive change - adds columns only

-- Add new columns to leave_plan_requests if they don't exist
ALTER TABLE public.leave_plan_requests
ADD COLUMN IF NOT EXISTS staff_category character varying, -- e.g., 'junior', 'senior', 'manager'
ADD COLUMN IF NOT EXISTS entitlement_days_used integer, -- Days actually used in this request
ADD COLUMN IF NOT EXISTS year_outstanding_balance integer DEFAULT 0, -- Opening balance from previous year
ADD COLUMN IF NOT EXISTS is_carry_over_leave boolean DEFAULT false, -- Whether this uses carryover days
ADD COLUMN IF NOT EXISTS calculation_summary jsonb, -- Details of how days were calculated
ADD COLUMN IF NOT EXISTS auto_calculated_end_date date; -- Auto-calculated end date (without manual override)

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff_category
ON public.leave_plan_requests(staff_category);

CREATE INDEX IF NOT EXISTS idx_leave_requests_carry_over
ON public.leave_plan_requests(is_carry_over_leave);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_year
ON public.leave_plan_requests(user_id, leave_year_period);

-- Add comments for documentation
COMMENT ON COLUMN public.leave_plan_requests.staff_category IS 'Staff category at time of request: junior, senior, manager';
COMMENT ON COLUMN public.leave_plan_requests.entitlement_days_used IS 'Actual days used based on weekends and holidays';
COMMENT ON COLUMN public.leave_plan_requests.year_outstanding_balance IS 'Outstanding balance from previous year (opening balance)';
COMMENT ON COLUMN public.leave_plan_requests.is_carry_over_leave IS 'True if this request uses carryover days from previous year';
COMMENT ON COLUMN public.leave_plan_requests.calculation_summary IS 'JSON with breakdown of holidays deducted, weekends, etc.';
COMMENT ON COLUMN public.leave_plan_requests.auto_calculated_end_date IS 'System-calculated end date based on business days logic';
