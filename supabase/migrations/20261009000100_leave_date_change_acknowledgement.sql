ALTER TABLE public.leave_plan_requests
  ADD COLUMN IF NOT EXISTS date_change_ack_status text,
  ADD COLUMN IF NOT EXISTS date_change_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS date_change_ack_note text,
  ADD COLUMN IF NOT EXISTS date_change_by_role text,
  ADD COLUMN IF NOT EXISTS date_change_original_start date,
  ADD COLUMN IF NOT EXISTS date_change_original_end date;

ALTER TABLE public.leave_plan_requests
  DROP CONSTRAINT IF EXISTS leave_plan_requests_date_change_ack_status_check;
ALTER TABLE public.leave_plan_requests
  ADD CONSTRAINT leave_plan_requests_date_change_ack_status_check
  CHECK (date_change_ack_status IS NULL OR date_change_ack_status IN ('pending', 'acknowledged', 'concern'));

NOTIFY pgrst, 'reload schema';
