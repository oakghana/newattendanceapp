-- Add memo_cc column to loan_requests table if it doesn't exist
ALTER TABLE loan_requests
ADD COLUMN IF NOT EXISTS memo_cc TEXT;

-- Add comment to column
COMMENT ON COLUMN loan_requests.memo_cc IS 'CC recipients for the memo (one per line)';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_loan_requests_memo_cc ON loan_requests(memo_cc);
