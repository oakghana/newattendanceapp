-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  SAFE_FLEET_MIGRATION.sql                                                  ║
-- ║  Fleet / transport inventory + bookings + shift scheduling + dispatch      ║
-- ║  Combines logic from supabase/migrations/100–107 without incomplete        ║
-- ║  hard-coded role CHECKs that could lock out loan/leave/auth roles.         ║
-- ║                                                                            ║
-- ║  SAFE: IF NOT EXISTS / additive columns / no DROP TABLE / no TRUNCATE      ║
-- ║  DOES NOT rename loan_office users                                         ║
-- ║  Role CHECK = live roles already in DB + transport extras only             ║
-- ║                                                                            ║
-- ║  Run in Supabase SQL Editor (after backup). Idempotent.                    ║
-- ║  Prerequisites: public.user_profiles, public.regions, public.departments   ║
-- ║  Optional: public.transport_requests (regional transport) — columns added  ║
-- ║            only if that table already exists.                              ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 0) PRE-FLIGHT
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SAFE_FLEET_MIGRATION starting at %', NOW();
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
    RAISE EXCEPTION 'user_profiles missing — abort fleet migration';
  END IF;
END $$;

-- ============================================================================
-- 1) ROLE CHECK — MERGE ONLY (preserve every role currently used)
--    Adds: driver, chief_driver, transport_manager, managing_director, etc.
-- ============================================================================
DO $$
DECLARE
  constraint_name text;
  r text;
  roles text[] := ARRAY[]::text[];
  extras text[] := ARRAY[
    'driver',
    'chief_driver',
    'transport_manager',
    'managing_director',
    'md',
    'fleet_officer',
    'hr_records',
    'accounts_executive',
    'hr_executive',
    'regional_loan_office',
    'hr_loan_office',
    'accounts_loan_office',
    'loan_office',
    'loan_committee',
    'committee',
    'leave_admin',
    'secretary',
    'it_admin',
    'it-admin',
    'regional_hr'
  ];
  sql text;
BEGIN
  FOR r IN
    SELECT DISTINCT role::text FROM public.user_profiles WHERE role IS NOT NULL ORDER BY 1
  LOOP
    roles := array_append(roles, r);
  END LOOP;

  FOREACH r IN ARRAY extras LOOP
    IF NOT (r = ANY (roles)) THEN
      roles := array_append(roles, r);
    END IF;
  END LOOP;

  FOREACH r IN ARRAY ARRAY[
    'staff','admin','nsp','intern','contract','department_head','regional_manager',
    'accounts','hr_officer','hr_leave_office','hr_office','hr','director_hr','manager_hr','audit_staff'
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
  -- also drop alternate name used in some envs
  ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS valid_role;

  sql := 'ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (';
  sql := sql || (
    SELECT string_agg(quote_literal(x), ', ' ORDER BY x)
    FROM unnest(roles) AS x
  );
  sql := sql || '))';

  BEGIN
    EXECUTE sql;
    RAISE NOTICE 'Role CHECK updated with % allowed values (live + fleet extras).', array_length(roles, 1);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Role constraint update failed: %', SQLERRM;
  END;
END $$;

COMMENT ON COLUMN public.user_profiles.role IS
  'Application role; includes driver, chief_driver, transport_manager for fleet/transport workflow.';

-- HOD link used by nonregional + dispatch flows
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS hod_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_profiles_hod_idx ON public.user_profiles(hod_id);

-- ============================================================================
-- 2) FLEET CORE — vehicles (from 105)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transport_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text NOT NULL UNIQUE,
  make text NOT NULL,
  model text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'car',
  capacity integer NOT NULL CHECK (capacity > 0),
  assigned_region_id uuid REFERENCES public.regions(id),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance', 'inactive')),
  odometer_reading integer CHECK (odometer_reading >= 0),
  insurance_expiry_date date,
  roadworthy_expiry_date date,
  notes text,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transport_vehicles_region_status_idx
  ON public.transport_vehicles(assigned_region_id, status);
CREATE INDEX IF NOT EXISTS transport_vehicles_registration_idx
  ON public.transport_vehicles(registration_number);

-- Required vehicle location, aligned with the application's geofence locations.
-- Nullable keeps existing fleet rows valid; the UI requires it for new/edited rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'geofence_locations'
  ) THEN
    ALTER TABLE public.transport_vehicles
      ADD COLUMN IF NOT EXISTS assigned_location_id uuid REFERENCES public.geofence_locations(id);
    CREATE INDEX IF NOT EXISTS transport_vehicles_location_idx
      ON public.transport_vehicles(assigned_location_id);
  ELSE
    RAISE NOTICE 'geofence_locations not found — assigned_location_id skipped.';
  END IF;
END $$;

-- ============================================================================
-- 3) Link vehicles to existing transport request tables (if present)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transport_requests'
  ) THEN
    ALTER TABLE public.transport_requests
      ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid REFERENCES public.transport_vehicles(id),
      ADD COLUMN IF NOT EXISTS hr_executive_signer_id uuid REFERENCES public.user_profiles(id),
      ADD COLUMN IF NOT EXISTS hr_executive_signed_at timestamptz,
      ADD COLUMN IF NOT EXISTS hr_executive_signature_data_url text,
      ADD COLUMN IF NOT EXISTS regional_hr_signer_id uuid REFERENCES public.user_profiles(id),
      ADD COLUMN IF NOT EXISTS regional_hr_signed_at timestamptz,
      ADD COLUMN IF NOT EXISTS regional_hr_signature_data_url text,
      ADD COLUMN IF NOT EXISTS department_head_signer_id uuid REFERENCES public.user_profiles(id),
      ADD COLUMN IF NOT EXISTS department_head_signed_at timestamptz,
      ADD COLUMN IF NOT EXISTS department_head_signature_data_url text,
      ADD COLUMN IF NOT EXISTS transport_manager_signer_id uuid REFERENCES public.user_profiles(id),
      ADD COLUMN IF NOT EXISTS transport_manager_signed_at timestamptz,
      ADD COLUMN IF NOT EXISTS transport_manager_signature_data_url text,
      ADD COLUMN IF NOT EXISTS chief_driver_id uuid REFERENCES public.user_profiles(id),
      ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.user_profiles(id),
      ADD COLUMN IF NOT EXISTS local_dispatch_notes text;

    CREATE INDEX IF NOT EXISTS transport_requests_hr_executive_signer_idx
      ON public.transport_requests(hr_executive_signer_id);
    CREATE INDEX IF NOT EXISTS transport_requests_regional_hr_signer_idx
      ON public.transport_requests(regional_hr_signer_id);
    CREATE INDEX IF NOT EXISTS transport_requests_department_head_signer_idx
      ON public.transport_requests(department_head_signer_id);
    CREATE INDEX IF NOT EXISTS transport_requests_transport_manager_signer_idx
      ON public.transport_requests(transport_manager_signer_id);
    CREATE INDEX IF NOT EXISTS transport_requests_assigned_driver_idx
      ON public.transport_requests(assigned_driver_id);
  ELSE
    RAISE NOTICE 'transport_requests not found — vehicle link / signer columns skipped (create regional transport table first if needed).';
  END IF;
END $$;

-- ============================================================================
-- 4) Non-regional transport requisitions (from 101 + 104 + 107)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.nonregional_transport_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.user_profiles(id),
  department text NOT NULL,
  location text NOT NULL CHECK (location IN ('QCC Head Office', 'Awutu Stores', 'Nsawam Archives')),
  requisition_date date NOT NULL DEFAULT CURRENT_DATE,
  origin text NOT NULL,
  destination text NOT NULL,
  purpose text NOT NULL,
  required_at timestamptz NOT NULL,
  return_at timestamptz,
  persons_requiring_transport text NOT NULL,
  hod_authorization text,
  hod_signature_data_url text,
  recommended_vehicle text,
  recommended_driver_id uuid REFERENCES public.user_profiles(id),
  transport_use_date date,
  dtm_signature_data_url text,
  md_decision text CHECK (md_decision IN ('pending', 'approved', 'rejected')) NOT NULL DEFAULT 'pending',
  md_decided_by uuid REFERENCES public.user_profiles(id),
  md_decided_at timestamptz,
  transport_manager_id uuid REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'submitted',
  supporting_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Additive columns if table already existed with older / partial shape
-- (CREATE TABLE IF NOT EXISTS does NOT add missing columns on an existing table)
ALTER TABLE public.nonregional_transport_requisitions
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS requisition_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS required_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_at timestamptz,
  ADD COLUMN IF NOT EXISTS persons_requiring_transport text,
  ADD COLUMN IF NOT EXISTS hod_authorization text,
  ADD COLUMN IF NOT EXISTS hod_signature_data_url text,
  ADD COLUMN IF NOT EXISTS recommended_vehicle text,
  ADD COLUMN IF NOT EXISTS recommended_driver_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS transport_use_date date,
  ADD COLUMN IF NOT EXISTS dtm_signature_data_url text,
  ADD COLUMN IF NOT EXISTS md_decision text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS md_decided_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS md_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS transport_manager_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS supporting_documents jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid REFERENCES public.transport_vehicles(id),
  ADD COLUMN IF NOT EXISTS department_head_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS department_head_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS department_head_signature_data_url text,
  ADD COLUMN IF NOT EXISTS hod_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_signature_data_url text,
  ADD COLUMN IF NOT EXISTS requester_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hod_decision text,
  ADD COLUMN IF NOT EXISTS hod_decided_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hod_decided_at timestamptz;

-- Expand the location CHECK without removing any location currently in use.
DO $$
DECLARE
  constraint_name text;
  location_name text;
  locations text[] := ARRAY['QCC Head Office', 'HEAD OFFICE SWANZY ARCADE', 'Awutu Stores', 'Nsawam Archives'];
  sql text;
BEGIN
  FOR location_name IN
    SELECT DISTINCT location::text
    FROM public.nonregional_transport_requisitions
    WHERE location IS NOT NULL
  LOOP
    IF NOT (location_name = ANY (locations)) THEN
      locations := array_append(locations, location_name);
    END IF;
  END LOOP;

  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'nonregional_transport_requisitions'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%location%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.nonregional_transport_requisitions DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;
  sql := 'ALTER TABLE public.nonregional_transport_requisitions ADD CONSTRAINT nonregional_transport_location_check CHECK (location IN (';
  sql := sql || (SELECT string_agg(quote_literal(value), ', ' ORDER BY value) FROM unnest(locations) AS value);
  sql := sql || '))';
  EXECUTE sql;
END $$;

-- hod_decision default / check (tolerant if already set)
DO $$
BEGIN
  -- Drop NOT NULL on hod_authorization if still present (107)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nonregional_transport_requisitions'
      AND column_name = 'hod_authorization'
  ) THEN
    BEGIN
      ALTER TABLE public.nonregional_transport_requisitions
        ALTER COLUMN hod_authorization DROP NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nonregional_transport_requisitions'
      AND column_name = 'hod_decision'
  ) THEN
    UPDATE public.nonregional_transport_requisitions
    SET hod_decision = COALESCE(hod_decision, 'pending')
    WHERE hod_decision IS NULL;

    BEGIN
      ALTER TABLE public.nonregional_transport_requisitions
        ALTER COLUMN hod_decision SET DEFAULT 'pending';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nonregional_transport_location_status_idx
  ON public.nonregional_transport_requisitions(location, status);
CREATE INDEX IF NOT EXISTS nonregional_transport_requester_idx
  ON public.nonregional_transport_requisitions(requester_id);
CREATE INDEX IF NOT EXISTS nonregional_transport_department_head_signer_idx
  ON public.nonregional_transport_requisitions(department_head_signer_id);
CREATE INDEX IF NOT EXISTS nonregional_transport_hod_queue_idx
  ON public.nonregional_transport_requisitions(hod_id, hod_decision, created_at DESC);

-- Soft status backfill for already-authorized rows (only if columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nonregional_transport_requisitions'
      AND column_name = 'hod_authorization'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nonregional_transport_requisitions'
      AND column_name = 'hod_signature_data_url'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nonregional_transport_requisitions'
      AND column_name = 'hod_decision'
  ) THEN
    UPDATE public.nonregional_transport_requisitions
    SET
      hod_decision = 'approved',
      status = CASE
        WHEN COALESCE(md_decision, 'pending') = 'pending'
             AND COALESCE(status, '') IN ('submitted', 'pending')
          THEN 'awaiting_md_approval'
        ELSE status
      END
    WHERE hod_authorization IS NOT NULL
      AND hod_signature_data_url IS NOT NULL
      AND COALESCE(hod_decision, 'pending') = 'pending';
  ELSE
    RAISE NOTICE 'Skipping nonregional HOD backfill — required columns not all present yet.';
  END IF;
END $$;

-- ============================================================================
-- 5) Vehicle bookings (from 105) — FK to transport_requests only if that table exists
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transport_vehicle_bookings'
  ) THEN
    RAISE NOTICE 'transport_vehicle_bookings already exists';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transport_requests'
  ) THEN
    CREATE TABLE public.transport_vehicle_bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id uuid NOT NULL REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
      transport_request_id uuid REFERENCES public.transport_requests(id) ON DELETE CASCADE,
      nonregional_requisition_id uuid REFERENCES public.nonregional_transport_requisitions(id) ON DELETE CASCADE,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'cancelled')),
      created_by uuid REFERENCES public.user_profiles(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at),
      CHECK ((transport_request_id IS NOT NULL)::integer + (nonregional_requisition_id IS NOT NULL)::integer = 1)
    );
  ELSE
    CREATE TABLE public.transport_vehicle_bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id uuid NOT NULL REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
      transport_request_id uuid,
      nonregional_requisition_id uuid REFERENCES public.nonregional_transport_requisitions(id) ON DELETE CASCADE,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'cancelled')),
      created_by uuid REFERENCES public.user_profiles(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at),
      CHECK ((transport_request_id IS NOT NULL)::integer + (nonregional_requisition_id IS NOT NULL)::integer = 1)
    );
    RAISE NOTICE 'transport_vehicle_bookings created without transport_requests FK (table missing).';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transport_vehicle_bookings_availability_idx
  ON public.transport_vehicle_bookings(vehicle_id, starts_at, ends_at)
  WHERE status = 'reserved';

-- ============================================================================
-- 6) Shift scheduling (from 105) — used with fleet HR ops
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shift_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  color text NOT NULL DEFAULT '#0f766e',
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shift_pattern_id uuid NOT NULL REFERENCES public.shift_patterns(id),
  shift_date date NOT NULL,
  assigned_by uuid REFERENCES public.user_profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, shift_date)
);

CREATE INDEX IF NOT EXISTS shift_assignments_date_idx ON public.shift_assignments(shift_date);
CREATE INDEX IF NOT EXISTS shift_assignments_employee_date_idx ON public.shift_assignments(employee_id, shift_date);

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_assignment_id uuid NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.user_profiles(id),
  target_employee_id uuid NOT NULL REFERENCES public.user_profiles(id),
  target_assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'approved', 'rejected', 'cancelled')),
  requester_note text,
  reviewed_by uuid REFERENCES public.user_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_by <> target_employee_id)
);

CREATE INDEX IF NOT EXISTS shift_swap_requests_status_idx
  ON public.shift_swap_requests(status, created_at DESC);

-- ============================================================================
-- 7) RLS (fleet + nonregional + shifts)
-- ============================================================================
ALTER TABLE public.transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_vehicle_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nonregional_transport_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_vehicles_authenticated_access ON public.transport_vehicles;
CREATE POLICY transport_vehicles_authenticated_access ON public.transport_vehicles FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'it-admin', 'transport_manager', 'regional_hr', 'regional_manager', 'chief_driver')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'it-admin', 'transport_manager', 'regional_hr', 'regional_manager', 'chief_driver')
  )
);

DROP POLICY IF EXISTS transport_vehicle_bookings_authenticated_access ON public.transport_vehicle_bookings;
CREATE POLICY transport_vehicle_bookings_authenticated_access ON public.transport_vehicle_bookings FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'it-admin', 'transport_manager', 'regional_hr', 'regional_manager', 'chief_driver')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'it-admin', 'transport_manager', 'regional_hr', 'regional_manager', 'chief_driver')
  )
);

DROP POLICY IF EXISTS nonregional_transport_authenticated_access ON public.nonregional_transport_requisitions;
CREATE POLICY nonregional_transport_authenticated_access ON public.nonregional_transport_requisitions FOR ALL TO authenticated USING (
  requester_id = auth.uid()
  OR hod_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'it-admin', 'department_head', 'managing_director', 'transport_manager')
  )
) WITH CHECK (
  requester_id = auth.uid()
  OR hod_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'it-admin', 'department_head', 'managing_director', 'transport_manager')
  )
);

DROP POLICY IF EXISTS shift_patterns_authenticated_access ON public.shift_patterns;
CREATE POLICY shift_patterns_authenticated_access ON public.shift_patterns FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS shift_assignments_authenticated_access ON public.shift_assignments;
CREATE POLICY shift_assignments_authenticated_access ON public.shift_assignments FOR ALL TO authenticated USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'it-admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive',
        'director_hr', 'manager_hr', 'regional_manager', 'department_head'
      )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'it-admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive',
        'director_hr', 'manager_hr', 'regional_manager', 'department_head'
      )
  )
);

DROP POLICY IF EXISTS shift_swap_requests_authenticated_access ON public.shift_swap_requests;
CREATE POLICY shift_swap_requests_authenticated_access ON public.shift_swap_requests FOR ALL TO authenticated USING (
  requested_by = auth.uid()
  OR target_employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'it-admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive',
        'director_hr', 'manager_hr', 'regional_manager', 'department_head'
      )
  )
) WITH CHECK (
  requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'it-admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive',
        'director_hr', 'manager_hr', 'regional_manager', 'department_head'
      )
  )
);

-- ============================================================================
-- 8) POST-FLIGHT verification
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'transport_vehicles',
    'transport_vehicle_bookings',
    'nonregional_transport_requisitions',
    'shift_patterns',
    'shift_assignments',
    'shift_swap_requests',
    'transport_requests'
  )
ORDER BY 1;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'transport_vehicles'
ORDER BY ordinal_position;

SELECT role, COUNT(*) AS users
FROM public.user_profiles
GROUP BY role
ORDER BY 1;

DO $$
BEGIN
  RAISE NOTICE 'SAFE_FLEET_MIGRATION finished at %', NOW();
  RAISE NOTICE 'Smoke-test login, check-in/out, leave, loan, then fleet inventory UI.';
END $$;
