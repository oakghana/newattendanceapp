-- Migration: 063_enhance_leave_policy_catalog.sql
-- Description: Enhance leave_policy_catalog table with staff categories and calculation methods
-- Status: Safe additive change - adds columns only

-- Add new columns to leave_policy_catalog if they don't exist
ALTER TABLE public.leave_policy_catalog
ADD COLUMN IF NOT EXISTS staff_category character varying DEFAULT 'all_staff', -- 'junior', 'senior', 'manager', 'all_staff'
ADD COLUMN IF NOT EXISTS calculation_method character varying DEFAULT 'standard', -- 'standard', 'weighted_by_category'
ADD COLUMN IF NOT EXISTS allow_carryover boolean DEFAULT true, -- Whether this leave type allows carryover
ADD COLUMN IF NOT EXISTS max_carryover_days integer DEFAULT 5; -- Max days that can be carried over

-- Create index on staff_category for faster queries
CREATE INDEX IF NOT EXISTS idx_leave_policy_staff_category
ON public.leave_policy_catalog(staff_category);

-- Add comment to columns for documentation
COMMENT ON COLUMN public.leave_policy_catalog.staff_category IS 'Staff category this policy applies to: junior, senior, manager, or all_staff';
COMMENT ON COLUMN public.leave_policy_catalog.calculation_method IS 'How leave days are calculated: standard or weighted_by_category';
COMMENT ON COLUMN public.leave_policy_catalog.allow_carryover IS 'Whether unused days can be carried to next period';
COMMENT ON COLUMN public.leave_policy_catalog.max_carryover_days IS 'Maximum days allowed to carryover to next period';
