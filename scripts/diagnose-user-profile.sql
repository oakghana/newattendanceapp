-- Diagnostic script to check user profile data population
-- This helps identify why profile fields show as "Not set" in the loan module

-- Replace 'user-email@example.com' with actual email
SELECT 
  id,
  email,
  first_name,
  last_name,
  employee_id,
  position,
  role,
  department_id,
  assigned_location_id,
  phone,
  hire_date,
  date_of_appointment,
  years_of_service,
  is_active,
  created_at,
  updated_at
FROM user_profiles
WHERE email = 'user-email@example.com'
LIMIT 1;

-- If you want to check a specific staff member by name:
-- SELECT * FROM user_profiles WHERE first_name LIKE '%GRACE%' OR last_name LIKE '%GRACE%' LIMIT 5;

-- Check what departments exist (for department linking):
-- SELECT id, name, code FROM departments WHERE is_active = true LIMIT 10;

-- Check what locations exist (for location linking):
-- SELECT id, name, address FROM geofence_locations WHERE is_active = true LIMIT 10;

-- Count how many user profiles have each field populated:
SELECT 
  'Total active users' AS field_name, COUNT(*) AS count
FROM user_profiles WHERE is_active = true
UNION ALL
SELECT 'Users with email', COUNT(*) FROM user_profiles WHERE email IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with employee_id', COUNT(*) FROM user_profiles WHERE employee_id IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with position', COUNT(*) FROM user_profiles WHERE position IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with department_id', COUNT(*) FROM user_profiles WHERE department_id IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with assigned_location_id', COUNT(*) FROM user_profiles WHERE assigned_location_id IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with date_of_appointment', COUNT(*) FROM user_profiles WHERE date_of_appointment IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with hire_date', COUNT(*) FROM user_profiles WHERE hire_date IS NOT NULL AND is_active = true;
