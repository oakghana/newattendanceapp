-- Payment Advice Feature - Database Setup
-- This script verifies and sets up the necessary tables and data for Payment Advice memo generation
-- Generates THREE separate memos per month: Manager, Senior, Junior

-- ============================================
-- 1. Verify leave_payment_memos table
-- ============================================
-- Already exists in database, verify structure:
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'leave_payment_memos' 
ORDER BY ordinal_position;

-- ============================================
-- 2. Verify leave_plan_requests has staff_category
-- ============================================
-- Verify staff_category column exists and has three valid categories:
SELECT DISTINCT staff_category 
FROM leave_plan_requests 
WHERE staff_category IS NOT NULL;

-- ============================================
-- 3. Create index for payment advice queries
-- ============================================
-- Speed up detection of staff by category and leave dates
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_category_dates
ON leave_plan_requests(staff_category, status, preferred_start_date, preferred_end_date)
WHERE status = 'approved' AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_leave_payment_memos_staff_category
ON leave_payment_memos(staff_category, created_at DESC);

-- ============================================
-- 4. Verify user_profiles has required fields
-- ============================================
-- Check for employee_id, first_name, last_name, position, department_id
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name IN ('employee_id', 'first_name', 'last_name', 'position', 'department_id');

-- ============================================
-- 5. Create payment advice memo templates (if not exists)
-- ============================================
INSERT INTO leave_memo_templates (template_key, template_name, subject_template, body_template, cc_recipients, is_active, created_at, updated_at)
VALUES 
  ('payment_advice_manager', 'Payment Advice - Manager', 
   'PAYMENT ADVICE - MANAGER ANNUAL LEAVE [MONTH]',
   'Please process salary for annual leave as detailed in the attached list.', 
   'hr-office@company.com', TRUE, NOW(), NOW()),
  ('payment_advice_senior', 'Payment Advice - Senior Staff',
   'PAYMENT ADVICE - SENIOR STAFF ANNUAL LEAVE [MONTH]',
   'Please process salary for annual leave as detailed in the attached list.',
   'hr-office@company.com', TRUE, NOW(), NOW()),
  ('payment_advice_junior', 'Payment Advice - Junior Staff',
   'PAYMENT ADVICE - JUNIOR STAFF ANNUAL LEAVE [MONTH]',
   'Please process salary for annual leave as detailed in the attached list.',
   'hr-office@company.com', TRUE, NOW(), NOW())
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- 6. Verify RLS policies for payment_advice queries
-- ============================================
-- Check that HR Leave Office staff can view memos
SELECT * FROM pg_policies 
WHERE tablename = 'leave_payment_memos';

-- ============================================
-- 7. Create view for payment advice staff detection
-- ============================================
CREATE OR REPLACE VIEW v_payment_advice_staff AS
SELECT 
  lpr.id,
  lpr.user_id,
  lpr.staff_category,
  lpr.preferred_start_date,
  lpr.preferred_end_date,
  up.employee_id,
  up.first_name,
  up.last_name,
  up.position,
  up.email,
  d.name as department_name,
  lpr.entitlement_days,
  lpr.status
FROM leave_plan_requests lpr
JOIN user_profiles up ON lpr.user_id = up.id
LEFT JOIN departments d ON up.department_id = d.id
WHERE 
  lpr.status = 'approved' 
  AND lpr.is_archived = false
  AND lpr.leave_type_key = 'annual'
  AND lpr.preferred_start_date IS NOT NULL
  AND lpr.preferred_end_date IS NOT NULL;

-- ============================================
-- 8. Summary statistics
-- ============================================
-- Get count of staff by category who have approved annual leave
SELECT 
  staff_category,
  COUNT(*) as count
FROM leave_plan_requests
WHERE status = 'approved' 
  AND is_archived = false
  AND leave_type_key = 'annual'
GROUP BY staff_category
ORDER BY staff_category;
