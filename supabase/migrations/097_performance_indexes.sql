-- ============================================================================
-- Migration: Performance Optimization Indexes
-- Purpose: Add indexes for frequently queried columns to improve response time
-- ============================================================================

-- Leave Management indexes
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_user_id ON leave_plan_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_status ON leave_plan_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_created_at ON leave_plan_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_preferred_start ON leave_plan_requests(preferred_start_date);

-- Leave plan reviews
CREATE INDEX IF NOT EXISTS idx_leave_plan_reviews_reviewer_id ON leave_plan_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_reviews_decision ON leave_plan_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_leave_plan_reviews_created_at ON leave_plan_reviews(created_at DESC);

-- User profiles for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department_id ON user_profiles(department_id);

-- Loan FD requests
CREATE INDEX IF NOT EXISTS idx_loan_fd_requests_staff_user_id ON loan_fd_requests(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_loan_fd_requests_status ON loan_fd_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_loan_fd_requests_created_at ON loan_fd_requests(created_at DESC);

-- Attendance records (for check-in queries)
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id ON attendance_records(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_check_in_date ON attendance_records(check_in_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON attendance_records(status);

-- Leave resumption (for quick lookups of active resumptions)
CREATE INDEX IF NOT EXISTS idx_leave_resumption_staff_user_id ON leave_resumption(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_status ON leave_resumption(resumption_status);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_created_at ON leave_resumption(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_user_status 
  ON leave_plan_requests(user_id, status) WHERE status IN ('pending', 'approved', 'rejected');

CREATE INDEX IF NOT EXISTS idx_loan_fd_review_status_submission 
  ON loan_fd_review(review_status, submission_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date 
  ON attendance_records(staff_user_id, check_in_date DESC);

-- Partial indexes for frequently filtered queries
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_pending 
  ON leave_plan_requests(created_at DESC) WHERE status = 'pending_hod_review';

CREATE INDEX IF NOT EXISTS idx_loan_fd_review_pending 
  ON loan_fd_review(submission_date DESC) WHERE review_status = 'pending_review';

CREATE INDEX IF NOT EXISTS idx_attendance_records_recent 
  ON attendance_records(check_in_date DESC) WHERE status = 'checked_in';

-- ============================================================================
-- Query optimization: Analyze after adding indexes
-- Note: Run ANALYZE manually after applying migration for optimal stats
-- ============================================================================
-- ANALYZE leave_plan_requests;
-- ANALYZE leave_plan_reviews;
-- ANALYZE user_profiles;
-- ANALYZE loan_fd_requests;
-- ANALYZE loan_fd_review;
-- ANALYZE attendance_records;
