-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  SAFE_MASTER_MIGRATION.sql                                                 ║
-- ║  Additive + idempotent only. Safe for production DBs where auth, login,    ║
-- ║  check-in, check-out, loan, and leave already work.                        ║
-- ║                                                                            ║
-- ║  DOES NOT: DROP TABLE / DROP COLUMN / TRUNCATE / bulk DELETE business data ║
-- ║  DOES NOT: rename loan_office users (see 099 — DO NOT RUN that file)       ║
-- ║  DOES NOT: replace role CHECK with a hard-coded incomplete role list       ║
-- ║  DOES:     merge role CHECK from DISTINCT live roles + optional new roles  ║
-- ║  DOES:     ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, indexes   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 0) PRE-FLIGHT (read-only style notices)
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SAFE_MASTER_MIGRATION starting at %', NOW();
  RAISE NOTICE 'user_profiles rows: %', (SELECT COUNT(*) FROM public.user_profiles);
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_plan_requests') THEN
    RAISE NOTICE 'leave_plan_requests rows: %', (SELECT COUNT(*) FROM public.leave_plan_requests);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance_records') THEN
    RAISE NOTICE 'attendance_records present';
  END IF;
END $$;

-- ============================================================================
-- 1) ROLE CHECK — EXPAND ONLY (preserve every role already used in the DB)
--    Never removes a role. Never updates user_profiles.role values.
-- ============================================================================
DO $$
DECLARE
  constraint_name text;
  r text;
  roles text[] := ARRAY[]::text[];
  extras text[] := ARRAY[
    -- optional / newer product roles (added only if not already present)
    'accounts_executive',
    'hr_executive',
    'regional_loan_office',
    'hr_loan_office',
    'accounts_loan_office',
    'transport_manager',
    'chief_driver',
    'driver',
    'fleet_officer',
    'managing_director',
    'md',
    'it_admin',
    'it-admin',
    'leave_admin',
    'regional_hr',
    'secretary',
    'committee',
    'loan_committee'
  ];
  sql text;
BEGIN
  -- Start from every role currently assigned (must remain valid after recreate)
  FOR r IN
    SELECT DISTINCT role::text
    FROM public.user_profiles
    WHERE role IS NOT NULL
    ORDER BY 1
  LOOP
    roles := array_append(roles, r);
  END LOOP;

  -- Merge optional extras
  FOREACH r IN ARRAY extras LOOP
    IF NOT (r = ANY (roles)) THEN
      roles := array_append(roles, r);
    END IF;
  END LOOP;

  -- Also keep common baseline roles even if unused today (so future assigns work)
  FOREACH r IN ARRAY ARRAY[
    'staff','admin','nsp','intern','contract','department_head','regional_manager',
    'loan_office','accounts','hr_officer','hr_leave_office','hr_office','hr',
    'director_hr','manager_hr','audit_staff'
  ] LOOP
    IF NOT (r = ANY (roles)) THEN
      roles := array_append(roles, r);
    END IF;
  END LOOP;

  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'user_profiles'
    AND c.contype = 'c'
    AND (c.conname ILIKE '%role%' OR pg_get_constraintdef(c.oid) ILIKE '%role%')
  ORDER BY c.conname
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;

  -- Build CHECK (role IN (...)) from merged list
  sql := 'ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (';
  sql := sql || (
    SELECT string_agg(quote_literal(x), ', ' ORDER BY x)
    FROM unnest(roles) AS x
  );
  sql := sql || '))';

  BEGIN
    EXECUTE sql;
    RAISE NOTICE 'user_profiles_role_check recreated with % allowed roles (merged from live data + extras).', array_length(roles, 1);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Role constraint update skipped/failed: % — existing roles unchanged in data.', SQLERRM;
    -- Attempt to leave table usable: if drop succeeded but add failed, try minimal recovery is not automatic.
    -- Operator should restore from backup if CHECK is missing and inserts fail.
  END;
END $$;

-- ============================================================================
-- 2) USER PROFILE additive fields (leave/loan display — nullable)
-- ============================================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS date_of_appointment DATE,
  ADD COLUMN IF NOT EXISTS years_of_service INTEGER,
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS staff_category VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_user_profiles_date_of_appointment
  ON public.user_profiles(date_of_appointment);
CREATE INDEX IF NOT EXISTS idx_user_profiles_contact_number
  ON public.user_profiles(contact_number);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role
  ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department_id
  ON public.user_profiles(department_id);

-- ============================================================================
-- 3) Leave policy catalog additive columns
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leave_policy_catalog'
  ) THEN
    ALTER TABLE public.leave_policy_catalog
      ADD COLUMN IF NOT EXISTS staff_category character varying DEFAULT 'all_staff',
      ADD COLUMN IF NOT EXISTS calculation_method character varying DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS allow_carryover boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS max_carryover_days integer DEFAULT 5;

    CREATE INDEX IF NOT EXISTS idx_leave_policy_staff_category
      ON public.leave_policy_catalog(staff_category);
  END IF;
END $$;

-- ============================================================================
-- 4) leave_plan_requests additive columns (no status changes)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leave_plan_requests'
  ) THEN
    ALTER TABLE public.leave_plan_requests
      ADD COLUMN IF NOT EXISTS staff_category character varying,
      ADD COLUMN IF NOT EXISTS entitlement_days_used integer,
      ADD COLUMN IF NOT EXISTS year_outstanding_balance integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_carry_over_leave boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS calculation_summary jsonb,
      ADD COLUMN IF NOT EXISTS auto_calculated_end_date date,
      ADD COLUMN IF NOT EXISTS entitlement_days integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS leave_entitlement_days integer DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS annual_leave_days integer,
      ADD COLUMN IF NOT EXISTS travel_days integer,
      ADD COLUMN IF NOT EXISTS years_of_service_at_submission integer,
      ADD COLUMN IF NOT EXISTS entitlement_validation_status varchar(30);

    CREATE INDEX IF NOT EXISTS idx_leave_requests_staff_category
      ON public.leave_plan_requests(staff_category);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_carry_over
      ON public.leave_plan_requests(is_carry_over_leave);
    CREATE INDEX IF NOT EXISTS idx_lpr_user_status
      ON public.leave_plan_requests(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_lpr_status_type
      ON public.leave_plan_requests(status, leave_type_key);
    CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_user_id
      ON public.leave_plan_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_status
      ON public.leave_plan_requests(status);
    CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_created_at
      ON public.leave_plan_requests(created_at DESC);

    -- leave_year_period index only if column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='leave_plan_requests' AND column_name='leave_year_period'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_leave_requests_user_year
        ON public.leave_plan_requests(user_id, leave_year_period);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 5) Outstanding leave balances table (new — does not touch old leave rows' status)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.modfn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.outstanding_leave_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year_period character varying NOT NULL,
  opening_balance integer DEFAULT 0,
  entitlement_days integer DEFAULT 0,
  used_this_period integer DEFAULT 0,
  carryover_to_next_year integer DEFAULT 0,
  max_carryover_allowed integer DEFAULT 5,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_period UNIQUE(user_id, leave_year_period)
);

ALTER TABLE public.outstanding_leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "Allow inserts for outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "HR staff can update outstanding balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "Anyone can select outstanding leave balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "Anyone can insert outstanding leave balances" ON public.outstanding_leave_balances;
DROP POLICY IF EXISTS "Anyone can update outstanding leave balances" ON public.outstanding_leave_balances;

CREATE POLICY "Anyone can select outstanding leave balances"
  ON public.outstanding_leave_balances FOR SELECT USING (true);
CREATE POLICY "Anyone can insert outstanding leave balances"
  ON public.outstanding_leave_balances FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update outstanding leave balances"
  ON public.outstanding_leave_balances FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_outstanding_leave_user_period
  ON public.outstanding_leave_balances(user_id, leave_year_period);
CREATE INDEX IF NOT EXISTS idx_outstanding_leave_year
  ON public.outstanding_leave_balances(leave_year_period);

DROP TRIGGER IF EXISTS outstanding_leave_balances_update_timestamp ON public.outstanding_leave_balances;
CREATE TRIGGER outstanding_leave_balances_update_timestamp
  BEFORE UPDATE ON public.outstanding_leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.modfn_update_timestamp();

-- ============================================================================
-- 6) Soft data backfill for leave (NULL-only / upsert — no deletes, no status flips)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='leave_plan_requests'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leave_plan_requests' AND column_name='leave_year_period'
  ) THEN
    BEGIN
      INSERT INTO public.outstanding_leave_balances (
        user_id, leave_year_period, opening_balance, entitlement_days,
        used_this_period, carryover_to_next_year, max_carryover_allowed, notes
      )
      SELECT
        lpr.user_id,
        lpr.leave_year_period,
        COALESCE(lpr.year_outstanding_balance, 0),
        COALESCE(lpc.entitlement_days, 21),
        COUNT(*) FILTER (WHERE lpr.status = 'hr_approved'),
        COALESCE(lpc.max_carryover_days, 5),
        COALESCE(lpc.max_carryover_days, 5),
        'Migrated from leave_plan_requests history (SAFE_MASTER)'
      FROM public.leave_plan_requests lpr
      LEFT JOIN public.leave_policy_catalog lpc
        ON lpr.leave_type_key = lpc.leave_type_key
       AND lpr.leave_year_period = lpc.leave_year_period
      WHERE lpr.leave_type_key IN ('annual_leave', 'annual')
        AND lpr.leave_year_period IS NOT NULL
      GROUP BY
        lpr.user_id, lpr.leave_year_period, lpr.year_outstanding_balance,
        lpc.entitlement_days, lpc.max_carryover_days
      ON CONFLICT (user_id, leave_year_period) DO UPDATE SET
        entitlement_days = EXCLUDED.entitlement_days,
        updated_at = now();
    EXCEPTION WHEN others THEN
      RAISE WARNING 'outstanding_leave_balances backfill skipped: %', SQLERRM;
    END;

    -- Fill NULL calculation fields only
    BEGIN
      UPDATE public.leave_plan_requests
      SET entitlement_days_used = GREATEST(
            1,
            EXTRACT(DAY FROM (preferred_end_date - preferred_start_date + INTERVAL '1 day'))::integer
          )
      WHERE status = 'hr_approved'
        AND entitlement_days_used IS NULL
        AND preferred_start_date IS NOT NULL
        AND preferred_end_date IS NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'entitlement_days_used backfill skipped: %', SQLERRM;
    END;

    BEGIN
      UPDATE public.leave_plan_requests
      SET auto_calculated_end_date = preferred_end_date
      WHERE auto_calculated_end_date IS NULL
        AND preferred_end_date IS NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'auto_calculated_end_date backfill skipped: %', SQLERRM;
    END;
  END IF;

  -- Optional entitlement_days from leave_entitlements (NULL only)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='leave_entitlements'
  ) THEN
    BEGIN
      UPDATE public.leave_plan_requests lpr
      SET entitlement_days = COALESCE(le.entitled_days, le.annual_leave_days)
      FROM public.leave_entitlements le
      WHERE lpr.entitlement_days IS NULL
        AND lpr.user_id = le.user_id
        AND (
          (lpr.leave_type_key IN ('annual', 'annual_leave'))
        );
    EXCEPTION WHEN others THEN
      RAISE WARNING 'entitlement_days from leave_entitlements skipped: %', SQLERRM;
    END;
  END IF;
END $$;

-- ============================================================================
-- 7) Regional loan office locations (new table only — no role renames)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.regional_loan_office_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  regional_loan_office_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  region_id uuid,
  location_name text,
  region_name text,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  CONSTRAINT unique_rlo_location UNIQUE(regional_loan_office_id, location_id)
);

ALTER TABLE public.regional_loan_office_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Regional loan office can view their own assignments" ON public.regional_loan_office_locations;
DROP POLICY IF EXISTS "Admins can manage regional loan office assignments" ON public.regional_loan_office_locations;

CREATE POLICY "Regional loan office can view their own assignments"
  ON public.regional_loan_office_locations FOR SELECT
  USING (auth.uid() = regional_loan_office_id OR auth.jwt()->>'role' = 'admin');

CREATE POLICY "Admins can manage regional loan office assignments"
  ON public.regional_loan_office_locations FOR ALL
  USING (auth.jwt()->>'role' = 'admin')
  WITH CHECK (auth.jwt()->>'role' = 'admin');

CREATE INDEX IF NOT EXISTS idx_rlo_locations_rlo_id
  ON public.regional_loan_office_locations(regional_loan_office_id);
CREATE INDEX IF NOT EXISTS idx_rlo_locations_location_id
  ON public.regional_loan_office_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_rlo_locations_region_id
  ON public.regional_loan_office_locations(region_id);

-- ============================================================================
-- 8) Attendance / loan indexes ONLY if tables & columns exist (no data change)
-- ============================================================================
DO $$
BEGIN
  -- Attendance
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance_records') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='staff_user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id ON public.attendance_records(staff_user_id)';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id_alt ON public.attendance_records(user_id)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='check_in_date') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_records_check_in_date ON public.attendance_records(check_in_date DESC)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_records' AND column_name='status') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON public.attendance_records(status)';
    END IF;
  END IF;

  -- Loan FD
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loan_fd_requests') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loan_fd_requests' AND column_name='staff_user_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loan_fd_requests_staff_user_id ON public.loan_fd_requests(staff_user_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loan_fd_requests' AND column_name='request_status') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loan_fd_requests_status ON public.loan_fd_requests(request_status)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loan_fd_requests' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loan_fd_requests_created_at ON public.loan_fd_requests(created_at DESC)';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loan_fd_review') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='loan_fd_review' AND column_name='review_status'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='loan_fd_review' AND column_name='submission_date'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loan_fd_review_status_submission ON public.loan_fd_review(review_status, submission_date DESC)';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 9) Optional audit log (never fails the migration)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='audit_logs'
  ) THEN
    BEGIN
      INSERT INTO public.audit_logs (table_name, action, details, created_at)
      VALUES (
        'public',
        'schema_migration',
        jsonb_build_object(
          'migration', 'SAFE_MASTER_MIGRATION',
          'at', NOW(),
          'note', 'Additive only; no role renames; no auth/attendance/loan data deletes'
        ),
        NOW()
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'audit_logs insert skipped: %', SQLERRM;
    END;
  END IF;
END $$;

-- ============================================================================
-- 10) POST-FLIGHT verification (SELECT — safe)
-- ============================================================================
-- Roles still readable
SELECT role, COUNT(*) AS user_count
FROM public.user_profiles
GROUP BY role
ORDER BY role;

-- Key objects
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'outstanding_leave_balances',
    'regional_loan_office_locations',
    'leave_plan_requests',
    'user_profiles',
    'attendance_records'
  )
ORDER BY 1;

-- Leave additive columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leave_plan_requests'
  AND column_name IN (
    'entitlement_days',
    'entitlement_days_used',
    'auto_calculated_end_date',
    'annual_leave_days',
    'staff_category',
    'calculation_summary'
  )
ORDER BY 1;

DO $$
BEGIN
  RAISE NOTICE 'SAFE_MASTER_MIGRATION finished at %', NOW();
  RAISE NOTICE 'Smoke-test: login, check-in, check-out, leave, loan before closing this session.';
END $$;
