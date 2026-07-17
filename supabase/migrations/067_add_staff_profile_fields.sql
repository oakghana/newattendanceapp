-- Migration: Add staff profile fields for leave and loan management
-- Date: 2026-07-17
-- Purpose: Add DATE_OF_APPOINTMENT, YEARS_OF_SERVICE, CONTACT_NUMBER to user_profiles
-- Impact: Non-breaking change - fields are optional (nullable)

BEGIN;

-- Add three new columns to user_profiles table
-- These fields support leave management and loan system operations

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS date_of_appointment DATE,
ADD COLUMN IF NOT EXISTS years_of_service INTEGER,
ADD COLUMN IF NOT EXISTS contact_number VARCHAR(20);

-- Add comments for clarity
COMMENT ON COLUMN user_profiles.date_of_appointment IS 'Staff appointment date - used for service year calculation and leave eligibility';
COMMENT ON COLUMN user_profiles.years_of_service IS 'Total years of service - used for leave entitlements and loan calculations';
COMMENT ON COLUMN user_profiles.contact_number IS 'Staff contact number - primary phone for leave and loan notifications';

-- Create index on date_of_appointment for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_date_of_appointment 
ON user_profiles(date_of_appointment);

-- Create index on contact_number for staff lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_contact_number 
ON user_profiles(contact_number);

-- Log migration completion
INSERT INTO audit_logs (table_name, action, details, created_at)
VALUES (
  'user_profiles',
  'schema_migration',
  'Added date_of_appointment, years_of_service, contact_number columns',
  NOW()
) ON CONFLICT DO NOTHING;

COMMIT;
