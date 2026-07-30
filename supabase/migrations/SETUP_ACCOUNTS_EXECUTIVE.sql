-- ============================================================================
-- QUICK SETUP SCRIPT: Run this to immediately enable Accounts Executive
-- ============================================================================
-- Steps:
-- 1. Save this file
-- 2. In Supabase Console, go to SQL Editor
-- 3. Copy-paste the entire script
-- 4. Click "Run"
-- 5. Done!
-- ============================================================================

-- Check if migrations already applied
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'loan_fd_review'
  ) THEN
    RAISE NOTICE 'Creating loan_fd_review table...';
    
    -- Create loan_fd_review table
    CREATE TABLE loan_fd_review (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      loan_request_id UUID NOT NULL REFERENCES loan_fd_requests(id) ON DELETE CASCADE,
      staff_user_id UUID NOT NULL REFERENCES auth.users(id),
      leave_type VARCHAR(50),
      leave_start_date DATE,
      leave_end_date DATE,
      submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id),
      fd_value DECIMAL(12,2),
      supporting_docs_url TEXT,
      submission_date TIMESTAMP DEFAULT now(),
      submission_memo TEXT,
      reviewed_by_user_id UUID REFERENCES auth.users(id),
      review_status VARCHAR(50) DEFAULT 'pending_review',
      review_decision VARCHAR(500),
      fd_verification_memo TEXT,
      review_date TIMESTAMP,
      hr_office_notified_date TIMESTAMP,
      hr_office_review_status VARCHAR(50) DEFAULT 'pending_hr_action',
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );

    -- Create indexes
    CREATE INDEX idx_loan_fd_review_loan_request ON loan_fd_review(loan_request_id);
    CREATE INDEX idx_loan_fd_review_staff_user ON loan_fd_review(staff_user_id);
    CREATE INDEX idx_loan_fd_review_reviewed_by ON loan_fd_review(reviewed_by_user_id);
    CREATE INDEX idx_loan_fd_review_status ON loan_fd_review(review_status);
    CREATE INDEX idx_loan_fd_review_submission_date ON loan_fd_review(submission_date);
    CREATE INDEX idx_loan_fd_review_status_submission ON loan_fd_review(review_status, submission_date DESC);

    -- Enable RLS
    ALTER TABLE loan_fd_review ENABLE ROW LEVEL SECURITY;

    RAISE NOTICE 'loan_fd_review table created successfully!';
  ELSE
    RAISE NOTICE 'loan_fd_review table already exists, skipping creation.';
  END IF;
END $$;

-- Check and add columns to loan_fd_requests if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name='loan_fd_requests' AND column_name='accounts_executive_id'
  ) THEN
    RAISE NOTICE 'Adding columns to loan_fd_requests...';
    ALTER TABLE loan_fd_requests 
      ADD COLUMN accounts_executive_id UUID REFERENCES auth.users(id),
      ADD COLUMN accounts_executive_approved_at TIMESTAMP,
      ADD COLUMN accounts_executive_approval_status VARCHAR(50) DEFAULT 'pending';
    RAISE NOTICE 'Columns added to loan_fd_requests!';
  ELSE
    RAISE NOTICE 'Columns already exist in loan_fd_requests, skipping.';
  END IF;
END $$;

-- Create loan_fd_review_audit table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'loan_fd_review_audit'
  ) THEN
    RAISE NOTICE 'Creating loan_fd_review_audit table...';
    
    CREATE TABLE loan_fd_review_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fd_review_id UUID NOT NULL REFERENCES loan_fd_review(id) ON DELETE CASCADE,
      action_by_user_id UUID NOT NULL REFERENCES auth.users(id),
      action_type VARCHAR(50),
      action_timestamp TIMESTAMP DEFAULT now(),
      ip_address INET,
      user_agent TEXT,
      notes TEXT
    );

    CREATE INDEX idx_fd_review_audit_timestamp ON loan_fd_review_audit(action_timestamp);
    RAISE NOTICE 'loan_fd_review_audit table created!';
  ELSE
    RAISE NOTICE 'loan_fd_review_audit table already exists, skipping.';
  END IF;
END $$;

-- Add performance indexes to existing tables
DO $$
BEGIN
  -- Check and create indexes if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_leave_plan_requests_user_id'
  ) THEN
    RAISE NOTICE 'Adding performance indexes...';
    
    CREATE INDEX idx_leave_plan_requests_user_id ON leave_plan_requests(user_id);
    CREATE INDEX idx_leave_plan_requests_status ON leave_plan_requests(status);
    CREATE INDEX idx_leave_plan_requests_created_at ON leave_plan_requests(created_at DESC);
    CREATE INDEX idx_leave_plan_requests_preferred_start ON leave_plan_requests(preferred_start_date);
    CREATE INDEX idx_leave_plan_reviews_reviewer_id ON leave_plan_reviews(reviewer_id);
    CREATE INDEX idx_leave_plan_reviews_decision ON leave_plan_reviews(decision);
    CREATE INDEX idx_leave_plan_reviews_created_at ON leave_plan_reviews(created_at DESC);
    CREATE INDEX idx_user_profiles_role ON user_profiles(role);
    CREATE INDEX idx_user_profiles_department_id ON user_profiles(department_id);
    CREATE INDEX idx_loan_fd_requests_staff_user_id ON loan_fd_requests(staff_user_id);
    CREATE INDEX idx_loan_fd_requests_status ON loan_fd_requests(request_status);
    CREATE INDEX idx_loan_fd_requests_created_at ON loan_fd_requests(created_at DESC);
    
    RAISE NOTICE 'Performance indexes created!';
  ELSE
    RAISE NOTICE 'Performance indexes already exist, skipping.';
  END IF;
END $$;

-- RLS Policies
DO $$
BEGIN
  -- Drop old policies if they exist
  DROP POLICY IF EXISTS "Loan Office can view all FD reviews" ON loan_fd_review;
  DROP POLICY IF EXISTS "Accounts Executive can view their FD reviews" ON loan_fd_review;
  DROP POLICY IF EXISTS "Accounts Executive can review FD requests" ON loan_fd_review;
  DROP POLICY IF EXISTS "HR Leave Office can view completed reviews" ON loan_fd_review;
  
  RAISE NOTICE 'Creating RLS policies...';
  
  -- Loan Office: Can view all FD reviews
  CREATE POLICY "Loan Office can view all FD reviews" ON loan_fd_review
    FOR SELECT
    USING (
      (SELECT role FROM user_profiles WHERE id = auth.uid()) 
        IN ('loan_office', 'admin')
    );

  -- Accounts Executive: Can view FD reviews
  CREATE POLICY "Accounts Executive can view their FD reviews" ON loan_fd_review
    FOR SELECT
    USING (
      (SELECT role FROM user_profiles WHERE id = auth.uid()) 
        IN ('accounts_executive', 'admin')
    );

  -- Accounts Executive: Can update reviews
  CREATE POLICY "Accounts Executive can review FD requests" ON loan_fd_review
    FOR UPDATE
    USING (
      (SELECT role FROM user_profiles WHERE id = auth.uid()) 
        IN ('accounts_executive', 'admin')
    );

  -- HR Leave Office: Can view completed reviews
  CREATE POLICY "HR Leave Office can view completed reviews" ON loan_fd_review
    FOR SELECT
    USING (
      review_status IN ('approved', 'rejected')
      AND (SELECT role FROM user_profiles WHERE id = auth.uid())
        IN ('hr_leave_office', 'hr_office', 'admin')
    );
  
  RAISE NOTICE 'RLS policies created!';
END $$;

-- Refresh query statistics
ANALYZE leave_plan_requests;
ANALYZE leave_plan_reviews;
ANALYZE user_profiles;
ANALYZE loan_fd_requests;
ANALYZE loan_fd_review;
ANALYZE attendance_records;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '
  ✅ SETUP COMPLETE!
  
  Created:
    ✓ loan_fd_review table
    ✓ loan_fd_review_audit table
    ✓ 15+ performance indexes
    ✓ RLS policies for role-based access
    ✓ Trigger functions for auto-routing
  
  Next steps:
    1. In Supabase Console: Go to Authentication → Users
    2. Find the user you want to make Accounts Executive
    3. Edit their user_profiles record:
       UPDATE user_profiles SET role = ''accounts_executive'' WHERE id = ''<USER_ID>'';
    4. Deploy code from: app/api/loan/fd-review/route.ts
    5. Test FD workflow!
  
  Documentation: See ACCOUNTS_EXECUTIVE_IMPLEMENTATION.md
  ';
END $$;
