-- ============================================================================
-- Migration: Add Accounts Executive Role and FD Review Workflow
-- Purpose: Introduce accounts_executive role for FD value verification
-- ============================================================================

-- ============================================================================
-- 1. Create loan_fd_review table for FD verification workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS loan_fd_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id UUID NOT NULL REFERENCES loan_fd_requests(id) ON DELETE CASCADE,
  -- FD request details (copied from loan_fd_requests)
  staff_user_id UUID NOT NULL REFERENCES auth.users(id),
  leave_type VARCHAR(50),
  leave_start_date DATE,
  leave_end_date DATE,
  -- Loan office submission
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  fd_value DECIMAL(12,2),
  supporting_docs_url TEXT,
  submission_date TIMESTAMP DEFAULT now(),
  submission_memo TEXT,
  -- Accounts executive review
  reviewed_by_user_id UUID REFERENCES auth.users(id),
  review_status VARCHAR(50) DEFAULT 'pending_review', -- pending_review, approved, rejected
  review_decision VARCHAR(500),
  fd_verification_memo TEXT,
  review_date TIMESTAMP,
  -- HR Leave Office notification
  hr_office_notified_date TIMESTAMP,
  hr_office_review_status VARCHAR(50) DEFAULT 'pending_hr_action', -- pending_hr_action, forwarded, processed
  -- Audit trail
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_loan_fd_review_loan_request ON loan_fd_review(loan_request_id);
CREATE INDEX idx_loan_fd_review_staff_user ON loan_fd_review(staff_user_id);
CREATE INDEX idx_loan_fd_review_reviewed_by ON loan_fd_review(reviewed_by_user_id);
CREATE INDEX idx_loan_fd_review_status ON loan_fd_review(review_status);
CREATE INDEX idx_loan_fd_review_submission_date ON loan_fd_review(submission_date);

-- Enable RLS
ALTER TABLE loan_fd_review ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Add FD approval columns to loan_fd_requests if not exists
-- ============================================================================
ALTER TABLE loan_fd_requests 
ADD COLUMN IF NOT EXISTS accounts_executive_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS accounts_executive_approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS accounts_executive_approval_status VARCHAR(50) DEFAULT 'pending';

-- ============================================================================
-- 3. RLS Policies for loan_fd_review
-- ============================================================================

-- Loan Office: Can view all FD reviews and create new ones
CREATE POLICY "Loan Office can view all FD reviews" ON loan_fd_review
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE (
        auth.jwt() ->> 'user_role' ILIKE '%loan_office%' OR
        auth.jwt() ->> 'user_role' ILIKE '%admin%'
      )
    )
  );

-- Accounts Executive: Can view FD reviews assigned to them
CREATE POLICY "Accounts Executive can view their FD reviews" ON loan_fd_review
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE auth.jwt() ->> 'user_role' ILIKE '%accounts_executive%'
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users
      WHERE auth.jwt() ->> 'user_role' ILIKE '%admin%'
    )
  );

-- Accounts Executive: Can update reviews they're assigned to
CREATE POLICY "Accounts Executive can review FD requests" ON loan_fd_review
  FOR UPDATE
  USING (
    reviewed_by_user_id = auth.uid() OR
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE auth.jwt() ->> 'user_role' ILIKE '%admin%'
    )
  );

-- HR Leave Office: Can view approved/rejected reviews
CREATE POLICY "HR Leave Office can view completed reviews" ON loan_fd_review
  FOR SELECT
  USING (
    review_status IN ('approved', 'rejected')
    AND auth.uid() IN (
      SELECT id FROM auth.users
      WHERE auth.jwt() ->> 'user_role' ILIKE ANY(ARRAY['%hr_leave_office%', '%hr_office%', '%admin%'])
    )
  );

-- ============================================================================
-- 4. Add accounts_executive to user role enum if needed (optional)
-- ============================================================================
-- Note: If your system uses ENUM for roles, update it here. Otherwise, roles are VARCHAR

-- ============================================================================
-- 5. Function to auto-copy FD request to Accounts Executive
-- ============================================================================
CREATE OR REPLACE FUNCTION copy_fd_request_to_accounts_executive()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new FD review is created, mark it as pending review
  IF NEW.review_status = 'pending_review' THEN
    UPDATE loan_fd_requests
    SET accounts_executive_approval_status = 'pending_review',
        updated_at = now()
    WHERE id = NEW.loan_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fd_review_created
AFTER INSERT ON loan_fd_review
FOR EACH ROW
EXECUTE FUNCTION copy_fd_request_to_accounts_executive();

-- ============================================================================
-- 6. Function to route approved FD back to HR Office
-- ============================================================================
CREATE OR REPLACE FUNCTION route_approved_fd_to_hr_office()
RETURNS TRIGGER AS $$
BEGIN
  -- When Accounts Executive approves, notify HR Office
  IF NEW.review_status = 'approved' AND OLD.review_status != 'approved' THEN
    UPDATE loan_fd_review
    SET hr_office_notified_date = now(),
        hr_office_review_status = 'pending_hr_action',
        updated_at = now()
    WHERE id = NEW.id;
    
    -- Update loan_fd_requests
    UPDATE loan_fd_requests
    SET accounts_executive_approved_at = now(),
        accounts_executive_id = NEW.reviewed_by_user_id,
        accounts_executive_approval_status = 'approved',
        updated_at = now()
    WHERE id = NEW.loan_request_id;
  END IF;
  
  -- Handle rejection
  IF NEW.review_status = 'rejected' AND OLD.review_status != 'rejected' THEN
    UPDATE loan_fd_requests
    SET accounts_executive_approval_status = 'rejected',
        updated_at = now()
    WHERE id = NEW.loan_request_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fd_review_approved
AFTER UPDATE ON loan_fd_review
FOR EACH ROW
WHEN (OLD.review_status IS DISTINCT FROM NEW.review_status)
EXECUTE FUNCTION route_approved_fd_to_hr_office();

-- ============================================================================
-- 7. Audit table for FD review actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS loan_fd_review_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fd_review_id UUID NOT NULL REFERENCES loan_fd_review(id) ON DELETE CASCADE,
  action_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type VARCHAR(50), -- viewed, submitted, approved, rejected, forwarded
  action_timestamp TIMESTAMP DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  notes TEXT
);

CREATE INDEX idx_fd_review_audit_timestamp ON loan_fd_review_audit(action_timestamp);

-- ============================================================================
-- 8. View for Accounts Executive dashboard
-- ============================================================================
CREATE OR REPLACE VIEW accounts_executive_fd_queue AS
SELECT
  fr.id as fd_request_id,
  fdr.id as review_id,
  u.email as staff_email,
  up.first_name,
  up.last_name,
  fr.leave_type,
  fr.leave_start_date,
  fr.leave_end_date,
  fdr.fd_value,
  fdr.submission_date,
  fdr.supporting_docs_url,
  fdr.review_status,
  fdr.submission_memo,
  lo_user.email as loan_office_user_email
FROM loan_fd_review fdr
JOIN loan_fd_requests fr ON fr.id = fdr.loan_request_id
JOIN auth.users u ON u.id = fr.staff_user_id
JOIN user_profiles up ON up.id = fr.staff_user_id
JOIN auth.users lo_user ON lo_user.id = fdr.submitted_by_user_id
WHERE fdr.review_status = 'pending_review'
ORDER BY fdr.submission_date ASC;
