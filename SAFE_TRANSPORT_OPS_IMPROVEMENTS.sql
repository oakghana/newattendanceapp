-- =============================================================================
-- SAFE_TRANSPORT_OPS_IMPROVEMENTS.sql
-- Purpose: Additive columns for trip completion / assignment ops UX.
-- Safety:
--   - ADD COLUMN IF NOT EXISTS only
--   - Does NOT modify auth, passwords, sessions, login, or role CHECKs
--   - Does NOT delete or rewrite existing transport/leave/loan/attendance rows
--   - Idempotent: safe to re-run
-- =============================================================================

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS trip_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS trip_completion_notes text,
  ADD COLUMN IF NOT EXISTS trip_completed_by uuid REFERENCES public.user_profiles(id);

CREATE INDEX IF NOT EXISTS transport_requests_trip_completed_at_idx
  ON public.transport_requests(trip_completed_at);

-- Events table used by the API (create if missing; no destructive changes)
CREATE TABLE IF NOT EXISTS public.transport_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.transport_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.user_profiles(id),
  action text,
  from_stage text,
  to_stage text,
  comment text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transport_request_events_request_id_idx
  ON public.transport_request_events(request_id);

CREATE INDEX IF NOT EXISTS transport_request_events_created_at_idx
  ON public.transport_request_events(created_at DESC);

-- Read-only verification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'transport_requests'
  AND column_name IN (
    'trip_completed_at',
    'trip_completion_notes',
    'trip_completed_by',
    'assigned_driver_id',
    'assigned_vehicle_id',
    'workflow_stage',
    'status'
  )
ORDER BY column_name;
