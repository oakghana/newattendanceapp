-- Add hr_signer_user_id tracking to deferment and recall requests
-- This links signers to actual user profiles for better audit trails and signature auto-population

-- Add hr_signer_user_id to leave_deferment_requests
ALTER TABLE leave_deferment_requests
ADD COLUMN IF NOT EXISTS hr_signer_user_id UUID REFERENCES user_profiles(id);

-- Add hr_signer_user_id to leave_recall_requests  
ALTER TABLE leave_recall_requests
ADD COLUMN IF NOT EXISTS hr_signer_user_id UUID REFERENCES user_profiles(id);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_deferment_hr_signer_user_id 
ON leave_deferment_requests(hr_signer_user_id);

CREATE INDEX IF NOT EXISTS idx_recall_hr_signer_user_id 
ON leave_recall_requests(hr_signer_user_id);

-- Add comments for documentation
COMMENT ON COLUMN leave_deferment_requests.hr_signer_user_id IS 
'References the HR executive user who will sign/has signed the deferment memo. Used for audit trail and signature auto-population.';

COMMENT ON COLUMN leave_recall_requests.hr_signer_user_id IS 
'References the HR executive user who will sign/has signed the recall memo. Used for audit trail and signature auto-population.';
