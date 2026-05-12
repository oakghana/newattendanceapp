-- Add memo_cc column to loan_requests table to store CC recipients for memos
ALTER TABLE loan_requests 
ADD COLUMN IF NOT EXISTS memo_cc TEXT;

-- Set default CC list for existing records
UPDATE loan_requests 
SET memo_cc = 'Managing Director
Deputy Managing Director
Deputy Director Finance
Deputy Director Human Resource
Audit Manager
Registry Unit
Records Unit'
WHERE memo_cc IS NULL;
