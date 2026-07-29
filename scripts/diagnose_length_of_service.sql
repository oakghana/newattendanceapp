-- Diagnostic Query: Debug Length of Service population issue
-- Run this to identify why Length of Service still shows "Set via Staff Management"

-- Step 1: Check Bernard Addai's current data
SELECT 
  id,
  first_name,
  last_name,
  hire_date,
  date_of_appointment,
  years_of_service,
  employee_id,
  email
FROM public.user_profiles
WHERE first_name ILIKE 'bernard' 
  AND last_name ILIKE 'addai'
ORDER BY created_at DESC
LIMIT 1;

-- Step 2: Check overall data population status
SELECT 
  COUNT(*) as total_staff,
  COUNT(CASE WHEN hire_date IS NOT NULL THEN 1 END) as with_hire_date,
  COUNT(CASE WHEN date_of_appointment IS NOT NULL THEN 1 END) as with_appointment_date,
  COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) as with_years_populated,
  ROUND(100.0 * COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) / COUNT(*), 2) as percent_populated
FROM public.user_profiles
WHERE deleted_at IS NULL;

-- Step 3: Show records that should have been populated but weren't
SELECT 
  id,
  first_name,
  last_name,
  hire_date,
  date_of_appointment,
  years_of_service,
  CASE 
    WHEN hire_date IS NOT NULL THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - hire_date::timestamp)) / (365.25 * 24 * 3600))
    ELSE NULL 
  END as calculated_years_from_hire_date
FROM public.user_profiles
WHERE (years_of_service IS NULL OR years_of_service = 0)
  AND hire_date IS NOT NULL
  AND deleted_at IS NULL
LIMIT 20;

-- Step 4: Check if columns exist and have constraints
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND column_name IN ('hire_date', 'date_of_appointment', 'years_of_service')
ORDER BY column_name;

-- Step 5: Run the migration fix inline for Bernard Addai specifically
-- First populate date_of_appointment from hire_date if missing
UPDATE public.user_profiles
SET date_of_appointment = hire_date
WHERE (first_name ILIKE 'bernard' AND last_name ILIKE 'addai')
  AND date_of_appointment IS NULL 
  AND hire_date IS NOT NULL;

-- Then calculate years_of_service if missing
UPDATE public.user_profiles
SET years_of_service = FLOOR(
  EXTRACT(EPOCH FROM (NOW() - date_of_appointment::timestamp)) / 
  (365.25 * 24 * 3600)
)
WHERE (first_name ILIKE 'bernard' AND last_name ILIKE 'addai')
  AND years_of_service IS NULL
  AND date_of_appointment IS NOT NULL;

-- Step 6: Verify Bernard Addai now has the data
SELECT 
  id,
  first_name,
  last_name,
  hire_date,
  date_of_appointment,
  years_of_service
FROM public.user_profiles
WHERE first_name ILIKE 'bernard' 
  AND last_name ILIKE 'addai'
ORDER BY created_at DESC
LIMIT 1;

-- Step 7: Population summary - count before/after
SELECT 
  'AFTER FIX' as status,
  COUNT(*) as total_staff,
  COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) as with_years_populated,
  ROUND(100.0 * COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) / COUNT(*), 2) as percent_populated
FROM public.user_profiles
WHERE deleted_at IS NULL;
