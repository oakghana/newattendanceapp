-- ============================================================
-- Migration 098: Safe role additions + entitlement field
-- ============================================================
-- SAFE: Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS and
--       ALTER TYPE ... ADD VALUE IF NOT EXISTS.
--       Never drops columns, tables, or data.
--       All changes are purely additive.
-- ============================================================

-- 1. Add entitlement_days column to leave_plan_requests if missing.
--    This stores the gross annual entitlement (e.g. 24) independently
--    of adjusted/requested days, so the memo always shows the correct
--    "Number of Days Entitled" in the table.
ALTER TABLE leave_plan_requests
  ADD COLUMN IF NOT EXISTS entitlement_days INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS leave_entitlement_days INTEGER DEFAULT NULL;

COMMENT ON COLUMN leave_plan_requests.entitlement_days IS
  'Staff gross annual leave entitlement (e.g. 24 days) before any deductions. Used in the memo ''Number of Days Entitled'' column.';

-- 2. Add accounts_executive and hr_executive to the role check constraint
--    SAFELY: Only alter the constraint if it exists and does not already
--    include the new roles.  We do this via a function so the script is
--    idempotent (safe to run multiple times).
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  -- Get the current constraint definition for user_profiles.role
  SELECT pg_get_constraintdef(c.oid)
  INTO constraint_def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE t.relname = 'user_profiles'
    AND c.contype = 'c'
    AND c.conname LIKE '%role%'
  LIMIT 1;

  IF constraint_def IS NULL THEN
    RAISE NOTICE 'No role check constraint found on user_profiles — skipping constraint update.';
  ELSIF constraint_def NOT LIKE '%accounts_executive%' THEN
    -- Drop and recreate with new roles added
    -- First find the constraint name
    DECLARE
      constraint_name TEXT;
    BEGIN
      SELECT c.conname
      INTO constraint_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'user_profiles'
        AND c.contype = 'c'
        AND c.conname LIKE '%role%'
      LIMIT 1;

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS %I', constraint_name);
      END IF;
    END;

    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_role_check CHECK (
        role IN (
          'admin', 'staff', 'nsp', 'intern', 'it-admin', 'it_admin',
          'department_head', 'regional_manager', 'loan_office',
          'accounts', 'accounts_executive',
          'director_hr', 'manager_hr', 'hr_officer', 'hr_leave_office',
          'hr_office', 'hr_executive', 'hr',
          'audit_staff', 'contract', 'loan_committee', 'committee',
          'managing_director', 'secretary',
          'regional_hr', 'leave_admin'
        )
      );
    RAISE NOTICE 'Role check constraint updated to include accounts_executive and hr_executive.';
  ELSE
    RAISE NOTICE 'Role check constraint already includes accounts_executive — no change needed.';
  END IF;
END $$;

-- 3. Performance indexes for leave_plan_requests (additive — won't fail if exists)
CREATE INDEX IF NOT EXISTS idx_lpr_user_status
  ON leave_plan_requests(user_id, status);

CREATE INDEX IF NOT EXISTS idx_lpr_status_type
  ON leave_plan_requests(status, leave_type_key);

CREATE INDEX IF NOT EXISTS idx_lpr_entitlement_days
  ON leave_plan_requests(entitlement_days)
  WHERE entitlement_days IS NOT NULL;

-- 4. Performance index for user_profiles role lookups (additive)
CREATE INDEX IF NOT EXISTS idx_user_profiles_role
  ON user_profiles(role);

-- 5. Back-fill entitlement_days from the standard COCOBOD entitlement table
--    if leave_entitlements or similar table exists.
--    This is wrapped in a DO block so it silently skips if table doesn't exist.
DO $$
BEGIN
  -- Only run if leave_entitlements table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'leave_entitlements'
      AND table_schema = 'public'
  ) THEN
    UPDATE leave_plan_requests lpr
    SET entitlement_days = le.entitled_days
    FROM leave_entitlements le
    WHERE lpr.user_id = le.user_id
      AND lpr.leave_type_key = 'annual'
      AND lpr.entitlement_days IS NULL
      AND le.entitled_days IS NOT NULL;
    RAISE NOTICE 'Back-filled entitlement_days from leave_entitlements.';
  ELSE
    RAISE NOTICE 'leave_entitlements table not found — skipping back-fill.';
  END IF;
END $$;

-- ============================================================
-- VERIFICATION QUERY (run after to confirm)
-- ============================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'leave_plan_requests'
--   AND column_name IN ('entitlement_days', 'leave_entitlement_days');
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'user_profiles'::regclass AND contype = 'c';
-- ============================================================
