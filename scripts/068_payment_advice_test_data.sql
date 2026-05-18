-- Payment Advice Feature - Test Data Setup Script
-- Creates sample staff and annual leave records for testing
-- Generates staff across three categories: Manager (5), Senior (8), Junior (12)

-- ============================================
-- 1. Insert test staff profiles (if not exists)
-- ============================================

-- Create 5 test Manager staff
INSERT INTO user_profiles (
  id, email, first_name, last_name, employee_id, position, 
  phone, department_id, hire_date, role, is_active, created_at, updated_at
)
SELECT 
  gen_random_uuid(), 
  'manager'||num||'@company.com',
  'Manager',
  'Test'||num,
  'MGR'||LPAD(num::text, 3, '0'),
  'Assistant Director',
  '233' || LPAD((200+num)::text, 7, '0'),
  (SELECT id FROM departments LIMIT 1),
  CURRENT_DATE - INTERVAL '5 years',
  'manager',
  true,
  NOW(),
  NOW()
FROM generate_series(1, 5) AS num
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE employee_id LIKE 'MGR%'
);

-- Create 8 test Senior staff
INSERT INTO user_profiles (
  id, email, first_name, last_name, employee_id, position,
  phone, department_id, hire_date, role, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'senior'||num||'@company.com',
  'Senior',
  'Test'||num,
  'SNR'||LPAD(num::text, 3, '0'),
  'Senior Officer',
  '233' || LPAD((300+num)::text, 7, '0'),
  (SELECT id FROM departments LIMIT 1),
  CURRENT_DATE - INTERVAL '3 years',
  'staff',
  true,
  NOW(),
  NOW()
FROM generate_series(1, 8) AS num
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE employee_id LIKE 'SNR%'
);

-- Create 12 test Junior staff
INSERT INTO user_profiles (
  id, email, first_name, last_name, employee_id, position,
  phone, department_id, hire_date, role, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'junior'||num||'@company.com',
  'Junior',
  'Test'||num,
  'JNR'||LPAD(num::text, 3, '0'),
  'Junior Officer',
  '233' || LPAD((400+num)::text, 7, '0'),
  (SELECT id FROM departments LIMIT 1),
  CURRENT_DATE - INTERVAL '1 year',
  'staff',
  true,
  NOW(),
  NOW()
FROM generate_series(1, 12) AS num
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE employee_id LIKE 'JNR%'
);

-- ============================================
-- 2. Create test annual leave requests
-- ============================================

-- Test month: May 2026 (adjust as needed)
-- Manager staff - 5 people on leave May 1-15, 2026
INSERT INTO leave_plan_requests (
  id, user_id, leave_type_key, staff_category, preferred_start_date, 
  preferred_end_date, entitlement_days, requested_days, status, 
  created_at, updated_at, is_archived
)
SELECT
  gen_random_uuid(),
  up.id,
  'annual',
  'Manager',
  '2026-05-01'::date,
  '2026-05-15'::date,
  15,
  15,
  'approved',
  NOW() - INTERVAL '30 days',
  NOW(),
  false
FROM user_profiles up
WHERE up.employee_id LIKE 'MGR%'
  AND NOT EXISTS (
    SELECT 1 FROM leave_plan_requests 
    WHERE user_id = up.id AND status = 'approved'
  );

-- Senior staff - 8 people on leave May 5-20, 2026
INSERT INTO leave_plan_requests (
  id, user_id, leave_type_key, staff_category, preferred_start_date,
  preferred_end_date, entitlement_days, requested_days, status,
  created_at, updated_at, is_archived
)
SELECT
  gen_random_uuid(),
  up.id,
  'annual',
  'Senior',
  '2026-05-05'::date,
  '2026-05-20'::date,
  16,
  16,
  'approved',
  NOW() - INTERVAL '30 days',
  NOW(),
  false
FROM user_profiles up
WHERE up.employee_id LIKE 'SNR%'
  AND NOT EXISTS (
    SELECT 1 FROM leave_plan_requests
    WHERE user_id = up.id AND status = 'approved'
  );

-- Junior staff - 12 people on leave May 10-25, 2026
INSERT INTO leave_plan_requests (
  id, user_id, leave_type_key, staff_category, preferred_start_date,
  preferred_end_date, entitlement_days, requested_days, status,
  created_at, updated_at, is_archived
)
SELECT
  gen_random_uuid(),
  up.id,
  'annual',
  'Junior',
  '2026-05-10'::date,
  '2026-05-25'::date,
  16,
  16,
  'approved',
  NOW() - INTERVAL '30 days',
  NOW(),
  false
FROM user_profiles up
WHERE up.employee_id LIKE 'JNR%'
  AND NOT EXISTS (
    SELECT 1 FROM leave_plan_requests
    WHERE user_id = up.id AND status = 'approved'
  );

-- ============================================
-- 3. Create leave_status records (per-day tracking)
-- ============================================

-- For each approved leave request, create daily status records
INSERT INTO leave_status (
  id, user_id, date, leave_request_id, status, created_at
)
SELECT
  gen_random_uuid(),
  lpr.user_id,
  date_series.date,
  lpr.id,
  'on_leave',
  NOW()
FROM leave_plan_requests lpr
CROSS JOIN LATERAL generate_series(
  lpr.preferred_start_date,
  lpr.preferred_end_date,
  INTERVAL '1 day'
) AS date_series(date)
WHERE lpr.staff_category IN ('Manager', 'Senior', 'Junior')
  AND lpr.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM leave_status
    WHERE leave_request_id = lpr.id
  );

-- ============================================
-- 4. Verify test data
-- ============================================

-- Show all test staff created
SELECT 
  COUNT(*) as total_staff,
  COUNT(CASE WHEN employee_id LIKE 'MGR%' THEN 1 END) as manager_count,
  COUNT(CASE WHEN employee_id LIKE 'SNR%' THEN 1 END) as senior_count,
  COUNT(CASE WHEN employee_id LIKE 'JNR%' THEN 1 END) as junior_count
FROM user_profiles
WHERE employee_id IN (
  SELECT employee_id FROM user_profiles 
  WHERE employee_id LIKE 'MGR%' 
     OR employee_id LIKE 'SNR%' 
     OR employee_id LIKE 'JNR%'
);

-- Show all approved leave by category
SELECT 
  staff_category,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_staff,
  MIN(preferred_start_date) as earliest_leave,
  MAX(preferred_end_date) as latest_leave
FROM leave_plan_requests
WHERE staff_category IN ('Manager', 'Senior', 'Junior')
  AND status = 'approved'
GROUP BY staff_category
ORDER BY staff_category;

-- Show leave overlapping May 2026
SELECT 
  up.employee_id,
  up.first_name,
  up.last_name,
  lpr.staff_category,
  lpr.preferred_start_date,
  lpr.preferred_end_date,
  lpr.entitlement_days
FROM leave_plan_requests lpr
JOIN user_profiles up ON lpr.user_id = up.id
WHERE lpr.status = 'approved'
  AND lpr.leave_type_key = 'annual'
  AND lpr.staff_category IN ('Manager', 'Senior', 'Junior')
  AND (
    (lpr.preferred_start_date <= '2026-05-31' AND lpr.preferred_end_date >= '2026-05-01')
  )
ORDER BY lpr.staff_category, up.employee_id;

-- ============================================
-- 5. View for Payment Advice queries
-- ============================================

SELECT * FROM v_payment_advice_staff
WHERE preferred_start_date <= '2026-05-31' 
  AND preferred_end_date >= '2026-05-01'
ORDER BY staff_category, employee_id;

-- ============================================
-- Summary
-- ============================================
-- Test data created:
-- - 5 Manager staff (May 1-15)
-- - 8 Senior staff (May 5-20)
-- - 12 Junior staff (May 10-25)
--
-- All with annual leave approved status
-- Daily leave_status records created for tracking
-- Data ready for Payment Advice memo generation testing
