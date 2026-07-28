-- Migration 069: Add memo_reference column to leave_plan_requests
-- This stores the HR leave office reference number (Our Ref No.) entered before
-- forwarding a leave memo to the HR Executive for signing.

ALTER TABLE public.leave_plan_requests
  ADD COLUMN IF NOT EXISTS memo_reference TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.leave_plan_requests.memo_reference IS
  'HR Leave Office reference number (Our Ref No.) entered before forwarding memo to HR Executive, e.g. QCC/HRD/ANL/2025/2026/19AF24';
