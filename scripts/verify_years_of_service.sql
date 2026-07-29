-- Verification Script: Check Length of Service Population
-- Run this script after migration 072 to verify all staff have years_of_service populated

-- 1. Check if columns exist
SELECT 
  EXISTS (SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'user_profiles' AND column_name = 'date_of_appointment') as has_appointment_date,
  EXISTS (SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'user_profiles' AND column_name = 'years_of_service') as has_years_of_service,
  EXISTS (SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'user_profiles' AND column_name = 'staff_category') as has_staff_category;

-- 2. Overall statistics
SELECT 
  COUNT(*) as total_staff,
  COUNT(date_of_appointment) as with_appointment_date,
  COUNT(years_of_service) as with_years_calculated,
  COUNT(hire_date) as with_hire_date,
  ROUND(100.0 * COUNT(years_of_service) / COUNT(*), 1) as percent_with_years
FROM public.user_profiles
WHERE is_active = true;

-- 3. Staff with missing appointment dates
SELECT 
  id,
  employee_id,
  first_name,
  last_name,
  hire_date,
  date_of_appointment,
  years_of_service
FROM public.user_profiles
WHERE is_active = true
  AND (date_of_appointment IS NULL OR years_of_service IS NULL)
ORDER BY first_name, last_name;

-- 4. Sample of staff with years of service
SELECT 
  employee_id,
  first_name,
  last_name,
  hire_date,
  date_of_appointment,
  years_of_service,
  staff_category
FROM public.user_profiles
WHERE is_active = true
  AND years_of_service IS NOT NULL
ORDER BY years_of_service DESC
LIMIT 15;

-- 5. Check for data integrity issues
SELECT 
  COUNT(*) as issue_count,
  'Negative years of service' as issue_type
FROM public.user_profiles
WHERE years_of_service < 0
UNION ALL
SELECT 
  COUNT(*) as issue_count,
  'Unrealistic years (>60)' as issue_type
FROM public.user_profiles
WHERE years_of_service > 60
UNION ALL
SELECT 
  COUNT(*) as issue_count,
  'Missing both hire_date and appointment_date' as issue_type
FROM public.user_profiles
WHERE hire_date IS NULL AND date_of_appointment IS NULL;

-- 6. Distribution of years of service
SELECT 
  CASE
    WHEN years_of_service IS NULL THEN 'Not Set'
    WHEN years_of_service < 1 THEN '< 1 year'
    WHEN years_of_service < 3 THEN '1-3 years'
    WHEN years_of_service < 5 THEN '3-5 years'
    WHEN years_of_service < 10 THEN '5-10 years'
    ELSE '10+ years'
  END as service_bracket,
  COUNT(*) as staff_count
FROM public.user_profiles
WHERE is_active = true
GROUP BY service_bracket
ORDER BY 
  CASE
    WHEN service_bracket = 'Not Set' THEN 0
    WHEN service_bracket = '< 1 year' THEN 1
    WHEN service_bracket = '1-3 years' THEN 2
    WHEN service_bracket = '3-5 years' THEN 3
    WHEN service_bracket = '5-10 years' THEN 4
    ELSE 5
  END;

-- 7. Specific check for Bernard Addai
SELECT 
  id,
  employee_id,
  first_name,
  last_name,
  hire_date,
  date_of_appointment,
  years_of_service,
  staff_category,
  position
FROM public.user_profiles
WHERE (first_name = 'Bernard' AND last_name = 'Addai')
  OR (first_name = 'Bernard' AND last_name LIKE 'Addai%')
  OR employee_id = '1152194';

-- Results Interpretation:
-- ✓ All staff should have either date_of_appointment or years_of_service populated
-- ✓ No negative years or unrealistic values (>60)
-- ✓ Staff should be distributed across different service brackets
-- ✓ Bernard Addai should show 6 years of service
