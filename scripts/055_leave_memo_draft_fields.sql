-- Add editable memo draft fields for leave workflow
-- HR Leave Office prepares the draft, HR Approver can finalize edits before issuing memo.

ALTER TABLE IF EXISTS leave_plan_requests
  ADD COLUMN IF NOT EXISTS memo_draft_subject TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_body TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_cc TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_last_edited_by UUID,
  ADD COLUMN IF NOT EXISTS memo_draft_last_edited_role TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_last_edited_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS leave_plan_stagger_requests
  ADD COLUMN IF NOT EXISTS memo_draft_subject TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_body TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_cc TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_last_edited_by UUID,
  ADD COLUMN IF NOT EXISTS memo_draft_last_edited_role TEXT,
  ADD COLUMN IF NOT EXISTS memo_draft_last_edited_at TIMESTAMPTZ;
