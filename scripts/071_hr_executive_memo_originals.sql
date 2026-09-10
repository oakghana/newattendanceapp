-- Snapshot the memo that was forwarded so HR Executive edits can be tracked.

ALTER TABLE IF EXISTS leave_plan_requests
  ADD COLUMN IF NOT EXISTS memo_office_subject TEXT,
  ADD COLUMN IF NOT EXISTS memo_office_body TEXT,
  ADD COLUMN IF NOT EXISTS memo_office_cc TEXT;

ALTER TABLE IF EXISTS loan_requests
  ADD COLUMN IF NOT EXISTS director_letter_original TEXT;
