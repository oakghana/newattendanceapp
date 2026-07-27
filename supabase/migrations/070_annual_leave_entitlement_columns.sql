-- Migration 070: Annual leave entitlement columns on leave_plan_requests
-- Purpose: Store per-staff entitlement snapshot at submission time so HR Leave
--          Office can see the correct entitlement without re-querying user_profiles.
-- Impact: Non-breaking — all columns are nullable.

BEGIN;

ALTER TABLE leave_plan_requests
  ADD COLUMN IF NOT EXISTS annual_leave_days          INTEGER,
  ADD COLUMN IF NOT EXISTS travel_days                INTEGER,
  ADD COLUMN IF NOT EXISTS staff_category             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS years_of_service_at_submission INTEGER,
  ADD COLUMN IF NOT EXISTS entitlement_validation_status  VARCHAR(30);

COMMENT ON COLUMN leave_plan_requests.annual_leave_days IS
  'Core annual leave days the employee is entitled to (excluding travel days)';
COMMENT ON COLUMN leave_plan_requests.travel_days IS
  'Travel days entitlement (standard: 2 days for QCC)';
COMMENT ON COLUMN leave_plan_requests.staff_category IS
  'senior | junior — captured at time of submission';
COMMENT ON COLUMN leave_plan_requests.years_of_service_at_submission IS
  'Completed whole years of service at the time of leave submission';
COMMENT ON COLUMN leave_plan_requests.entitlement_validation_status IS
  'Approved Entitlement | Exceeds Entitlement';

-- Also ensure user_profiles has staff_category (belt-and-suspenders alongside migration 067)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS staff_category VARCHAR(50);

COMMENT ON COLUMN user_profiles.staff_category IS
  'senior | junior — determines annual leave tier';

COMMIT;
