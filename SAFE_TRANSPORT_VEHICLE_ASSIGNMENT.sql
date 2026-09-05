-- =============================================================================
-- SAFE_TRANSPORT_VEHICLE_ASSIGNMENT.sql
-- Purpose: Provide the vehicle register required for dropdown-only assignment.
-- Safety:
--   - Additive only: CREATE TABLE/INDEX/COLUMN IF NOT EXISTS
--   - Does NOT change user roles, auth, passwords, sessions, login, or RLS
--   - Does NOT update/delete existing transport, attendance, leave, or loan data
--   - Idempotent: safe to run more than once
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transport_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text NOT NULL UNIQUE,
  make text NOT NULL,
  model text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'car',
  capacity integer NOT NULL CHECK (capacity > 0),
  assigned_region_id uuid REFERENCES public.regions(id),
  assigned_location_id uuid REFERENCES public.geofence_locations(id),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance', 'inactive')),
  odometer_reading integer CHECK (odometer_reading >= 0),
  insurance_expiry_date date,
  roadworthy_expiry_date date,
  notes text,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing partial tables receive only missing assignment fields.
ALTER TABLE public.transport_vehicles
  ADD COLUMN IF NOT EXISTS assigned_location_id uuid REFERENCES public.geofence_locations(id),
  ADD COLUMN IF NOT EXISTS assigned_region_id uuid REFERENCES public.regions(id),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS capacity integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS transport_vehicles_status_idx
  ON public.transport_vehicles(status);

CREATE INDEX IF NOT EXISTS transport_vehicles_location_status_idx
  ON public.transport_vehicles(assigned_location_id, status);

-- Read-only verification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'transport_vehicles'
ORDER BY ordinal_position;
