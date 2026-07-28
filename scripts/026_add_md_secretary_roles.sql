-- ============================================================================
-- Migration: Add 'managing_director' and 'secretary' roles
-- Add MD approval columns to loan_requests
-- Add md_signature_url to user_profiles
-- Script: 026_add_md_secretary_roles.sql
-- ============================================================================

BEGIN;

-- 1. Update the valid_role constraint to include new roles
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE user_profiles
  ADD CONSTRAINT valid_role
  CHECK (role IN (
    'staff',
    'admin',
    'department_head',
    'it-admin',
    'regional_manager',
    'nsp',
    'intern',
    'contract',
    'audit_staff',
    'managing_director',
    'secretary'
  ));

-- 2. Add MD signature URL to user_profiles (for stamp on approved memos)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS md_signature_url TEXT DEFAULT NULL;

-- 3. Add MD approval columns to loan_requests
ALTER TABLE loan_requests
  ADD COLUMN IF NOT EXISTS md_approved_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS md_approved_by UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS md_approved_by_name TEXT DEFAULT NULL;

-- 4. Index for fast lookup of MD-approved loans
CREATE INDEX IF NOT EXISTS idx_loan_requests_md_approved_at
  ON loan_requests(md_approved_at DESC)
  WHERE md_approved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_requests_approved_director
  ON loan_requests(status)
  WHERE status = 'approved_director';

COMMIT;

-- ============================================================================
-- Rollback (run only to revert):
-- BEGIN;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_role;
-- ALTER TABLE user_profiles
--   ADD CONSTRAINT valid_role
--   CHECK (role IN ('staff','admin','department_head','it-admin','regional_manager','nsp','intern','contract','audit_staff'));
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS md_signature_url;
-- ALTER TABLE loan_requests DROP COLUMN IF EXISTS md_approved_at;
-- ALTER TABLE loan_requests DROP COLUMN IF EXISTS md_approved_by;
-- ALTER TABLE loan_requests DROP COLUMN IF EXISTS md_approved_by_name;
-- COMMIT;
-- ============================================================================

-- Post-migration verification:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'user_profiles'::regclass AND contype = 'c';
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'loan_requests'
-- AND column_name IN ('md_approved_at','md_approved_by','md_approved_by_name');
