-- Migration: Add welfare columns to user_profiles and populate years_of_service
-- Purpose: Fix Length of Service not displaying in Loan Administration portal
-- These columns are required for the loan workflow API to fetch years_of_service data

-- Step 1: Add missing columns to user_profiles table
-- These columns store welfare/staff management data that must be accessible during loan applications
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS staff_category VARCHAR(50),
ADD COLUMN IF NOT EXISTS date_of_appointment DATE,
ADD COLUMN IF NOT EXISTS years_of_service INTEGER;

-- Add comments for clarity
COMMENT ON COLUMN public.user_profiles.staff_category IS 'Staff category: Junior or Senior, used for loan entitlement determination';
COMMENT ON COLUMN public.user_profiles.date_of_appointment IS 'Date staff member was appointed/hired (from Staff Management system)';
COMMENT ON COLUMN public.user_profiles.years_of_service IS 'Calculated years of service from date_of_appointment';

-- Step 2: Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_user_profiles_years_of_service 
ON public.user_profiles(years_of_service);

CREATE INDEX IF NOT EXISTS idx_user_profiles_staff_category 
ON public.user_profiles(staff_category);

-- Step 3: Populate years_of_service from hire_date if date_of_appointment is missing
-- Use hire_date (existing column) as fallback for date_of_appointment if not set
UPDATE public.user_profiles
SET date_of_appointment = hire_date
WHERE date_of_appointment IS NULL 
  AND hire_date IS NOT NULL;

-- Step 4: Calculate years_of_service for all staff members
-- This calculates the number of complete years between date_of_appointment and today
UPDATE public.user_profiles
SET years_of_service = FLOOR(
  EXTRACT(EPOCH FROM (NOW() - date_of_appointment::timestamp)) / 
  (365.25 * 24 * 3600)
)
WHERE date_of_appointment IS NOT NULL
  AND years_of_service IS NULL;

-- Step 5: Verify the migration was successful
SELECT 
  id, 
  first_name, 
  last_name, 
  date_of_appointment, 
  years_of_service,
  staff_category
FROM public.user_profiles
WHERE date_of_appointment IS NOT NULL
ORDER BY years_of_service DESC
LIMIT 20;

-- Step 6: Check for any edge cases (negative or very high years)
SELECT 
  id, 
  first_name, 
  last_name, 
  date_of_appointment, 
  years_of_service
FROM public.user_profiles
WHERE years_of_service IS NOT NULL
  AND (years_of_service < 0 OR years_of_service > 60)
ORDER BY years_of_service DESC;

-- Migration complete: 
-- - Added date_of_appointment, years_of_service, and staff_category columns to user_profiles
-- - Populated date_of_appointment from hire_date where available
-- - Calculated years_of_service based on date_of_appointment
-- - The Loan Administration portal will now display actual years of service instead of "Set via Staff Management"
