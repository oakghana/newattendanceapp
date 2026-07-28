-- Add HR executive date override columns
-- These allow the HR approver to finalize leave dates before signing off
ALTER TABLE public.leave_plan_requests 
  ADD COLUMN IF NOT EXISTS hr_approved_start_date DATE,
  ADD COLUMN IF NOT EXISTS hr_approved_end_date DATE,
  ADD COLUMN IF NOT EXISTS hr_approved_days INTEGER;

COMMENT ON COLUMN public.leave_plan_requests.hr_approved_start_date IS 'Final leave start date set by HR approver; if set, overrides HR office adjusted date';
COMMENT ON COLUMN public.leave_plan_requests.hr_approved_end_date IS 'Final leave end date set by HR approver; if set, overrides HR office adjusted date';
COMMENT ON COLUMN public.leave_plan_requests.hr_approved_days IS 'Final working days granted by HR approver; calculated from hr_approved_start_date and hr_approved_end_date';
