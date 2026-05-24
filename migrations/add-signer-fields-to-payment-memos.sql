-- Add HR Executive signer tracking fields to leave_payment_memos
-- This ensures only assigned HR Executives can approve and sign payment advice memos

ALTER TABLE leave_payment_memos
ADD COLUMN IF NOT EXISTS hr_executive_signer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS hr_executive_signer_name text,
ADD COLUMN IF NOT EXISTS hr_executive_signer_position text,
ADD COLUMN IF NOT EXISTS hr_executive_signer_email text,
ADD COLUMN IF NOT EXISTS assigned_for_approval_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reviewed_by_hr_executive_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewed_by_hr_executive_name text,
ADD COLUMN IF NOT EXISTS reviewed_by_hr_executive_at timestamp with time zone;

-- Create index on hr_executive_signer_id for performance
CREATE INDEX IF NOT EXISTS idx_payment_memos_signer_id 
ON leave_payment_memos(hr_executive_signer_id);

-- Create index on status and signer_id for filtering
CREATE INDEX IF NOT EXISTS idx_payment_memos_signer_status
ON leave_payment_memos(hr_executive_signer_id, status);

-- Add comment documenting the new fields
COMMENT ON COLUMN leave_payment_memos.hr_executive_signer_id IS 'UUID of the assigned HR Executive who can approve and sign this memo';
COMMENT ON COLUMN leave_payment_memos.hr_executive_signer_name IS 'Full name of the assigned HR Executive';
COMMENT ON COLUMN leave_payment_memos.hr_executive_signer_position IS 'Position of the assigned HR Executive';
COMMENT ON COLUMN leave_payment_memos.hr_executive_signer_email IS 'Email of the assigned HR Executive';
COMMENT ON COLUMN leave_payment_memos.assigned_for_approval_at IS 'Timestamp when memo was assigned for approval';
COMMENT ON COLUMN leave_payment_memos.reviewed_by_hr_executive_id IS 'UUID of the HR Executive who actually reviewed/approved';
COMMENT ON COLUMN leave_payment_memos.reviewed_by_hr_executive_name IS 'Name of the HR Executive who reviewed';
COMMENT ON COLUMN leave_payment_memos.reviewed_by_hr_executive_at IS 'Timestamp when HR Executive reviewed';
