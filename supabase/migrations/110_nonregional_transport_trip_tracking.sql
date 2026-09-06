BEGIN;

-- Driver-controlled trip lifecycle for non-regional transport requisitions.
-- Lets an assigned driver confirm the trek has started and later confirm it
-- has been completed, capturing timestamps and optional notes for the record.
ALTER TABLE public.nonregional_transport_requisitions
  ADD COLUMN IF NOT EXISTS trip_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trip_started_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS trip_start_note text,
  ADD COLUMN IF NOT EXISTS trip_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS trip_completed_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS trip_completion_note text;

CREATE INDEX IF NOT EXISTS nonregional_transport_driver_status_idx
  ON public.nonregional_transport_requisitions(recommended_driver_id, status);

COMMIT;
