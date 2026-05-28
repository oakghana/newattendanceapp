-- Add columns for HR executive assignment workflow to deferment requests
ALTER TABLE leave_deferment_requests 
ADD COLUMN IF NOT EXISTS initiated_by_user_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS assigned_hr_executive_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS hr_executive_decision TEXT CHECK (hr_executive_decision IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS hr_executive_decision_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS hr_executive_comments TEXT;

-- Add columns for HR executive assignment workflow to recall requests
ALTER TABLE leave_recall_requests 
ADD COLUMN IF NOT EXISTS assigned_hr_executive_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS hr_executive_decision TEXT CHECK (hr_executive_decision IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS hr_executive_decision_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS hr_executive_comments TEXT;

-- Create index for faster lookups by assigned HR executive
CREATE INDEX IF NOT EXISTS idx_deferment_assigned_hr ON leave_deferment_requests(assigned_hr_executive_id) WHERE assigned_hr_executive_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recall_assigned_hr ON leave_recall_requests(assigned_hr_executive_id) WHERE assigned_hr_executive_id IS NOT NULL;

-- Create index for faster lookups by initiator
CREATE INDEX IF NOT EXISTS idx_deferment_initiated_by ON leave_deferment_requests(initiated_by_user_id) WHERE initiated_by_user_id IS NOT NULL;
