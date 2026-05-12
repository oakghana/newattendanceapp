-- Add auto-forward tracking columns to leave_plan_requests
ALTER TABLE leave_plan_requests
  ADD COLUMN IF NOT EXISTS hod_auto_advanced_at timestamptz,
  ADD COLUMN IF NOT EXISTS hod_auto_advanced_reason text;

-- Add indexes for better query performance on the cron job
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_hod_pending 
  ON leave_plan_requests(status, submitted_at) 
  WHERE status = 'pending_hod_review' AND hod_auto_advanced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loan_requests_hod_pending 
  ON loan_requests(status, submitted_at) 
  WHERE status = 'pending_hod' AND hod_auto_advanced_at IS NULL;
