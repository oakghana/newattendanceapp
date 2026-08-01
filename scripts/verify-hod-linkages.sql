-- Verification Script: Check HOD Linkages and Staff Requests
-- Run this to verify that itm@gmail.com can see GRACE WERWERDU and BOAME EHRENFRIED YAW's requests

-- 1. Verify itm@gmail.com's user ID and role
SELECT id, email, first_name, last_name, role 
FROM user_profiles 
WHERE email = 'itm@gmail.com';

-- 2. Verify GRACE WERWERDU and BOAME EHRENFRIED YAW user IDs
SELECT id, email, first_name, last_name, role 
FROM user_profiles 
WHERE first_name IN ('GRACE', 'BOAME') 
  AND last_name IN ('WERWERDU', 'EHRENFRIED YAW');

-- 3. Verify HOD linkages exist (itm@gmail.com is HOD for these staff)
SELECT hod_user_id, staff_user_id, lhl.created_at,
       (SELECT email FROM user_profiles up WHERE up.id = hod_user_id) as hod_email,
       (SELECT email FROM user_profiles up WHERE up.id = staff_user_id) as staff_email
FROM loan_hod_linkages lhl
WHERE hod_user_id = (SELECT id FROM user_profiles WHERE email = 'itm@gmail.com')
ORDER BY lhl.created_at DESC;

-- 4. Verify loan requests exist for GRACE WERWERDU and BOAME EHRENFRIED YAW
SELECT lr.id, lr.user_id, lr.status, lr.created_at,
       (SELECT CONCAT(first_name, ' ', last_name) FROM user_profiles WHERE id = lr.user_id) as requested_by
FROM loan_requests lr
WHERE lr.user_id IN (
  SELECT id FROM user_profiles 
  WHERE (first_name = 'GRACE' AND last_name = 'WERWERDU')
     OR (first_name = 'BOAME' AND last_name = 'EHRENFRIED YAW')
)
ORDER BY lr.created_at DESC;

-- 5. Count pending_hod requests for these staff
SELECT COUNT(*) as pending_hod_count
FROM loan_requests
WHERE status = 'pending_hod'
  AND user_id IN (
    SELECT id FROM user_profiles 
    WHERE (first_name = 'GRACE' AND last_name = 'WERWERDU')
       OR (first_name = 'BOAME' AND last_name = 'EHRENFRIED YAW')
  );

-- 6. Full verification: Show all linked staff requests that should appear in HOD's myTasks
SELECT lr.id, lr.created_at, 
       CONCAT(up.first_name, ' ', up.last_name) as requested_by,
       lr.loan_type_id, lr.requested_amount, lr.status
FROM loan_requests lr
JOIN user_profiles up ON lr.user_id = up.id
WHERE lr.status = 'pending_hod'
  AND lr.user_id IN (
    SELECT staff_user_id FROM loan_hod_linkages
    WHERE hod_user_id = (SELECT id FROM user_profiles WHERE email = 'itm@gmail.com')
  )
ORDER BY lr.created_at DESC;
