BEGIN;

-- The previous shared trigger function (public.prevent_driver_double_booking)
-- referenced NEW.recommended_driver_id and NEW.assigned_driver_id in the same
-- CASE expression. Because NEW is a dynamic RECORD inside a trigger, Postgres
-- resolves every field referenced in that expression against whichever table
-- actually fired the trigger — even branches that would not be taken. Regional
-- transport requests (public.transport_requests) have no
-- recommended_driver_id column, so any insert/update on that table failed
-- with: record "new" has no field "recommended_driver_id".
--
-- Fix: use two separate trigger functions, one per table, each referencing
-- only the columns that exist on that table.

DROP TRIGGER IF EXISTS prevent_nonregional_driver_double_booking ON public.nonregional_transport_requisitions;
DROP TRIGGER IF EXISTS prevent_regional_driver_double_booking ON public.transport_requests;
DROP FUNCTION IF EXISTS public.prevent_driver_double_booking();

CREATE OR REPLACE FUNCTION public.prevent_nonregional_driver_double_booking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  driver_id uuid;
  active_trip boolean;
BEGIN
  driver_id := NEW.recommended_driver_id;
  active_trip := NEW.status IN ('assigned', 'in_progress');

  IF driver_id IS NULL OR NOT active_trip THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(driver_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.nonregional_transport_requisitions
    WHERE recommended_driver_id = driver_id
      AND status IN ('assigned', 'in_progress')
      AND id <> NEW.id
  ) OR EXISTS (
    SELECT 1
    FROM public.transport_requests
    WHERE assigned_driver_id = driver_id
      AND workflow_stage = 'assigned'
      AND status IN ('assigned', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Driver is already assigned to an active trip and is unavailable.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_regional_driver_double_booking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  driver_id uuid;
  active_trip boolean;
BEGIN
  driver_id := NEW.assigned_driver_id;
  active_trip := NEW.workflow_stage = 'assigned' AND NEW.status IN ('assigned', 'in_progress');

  IF driver_id IS NULL OR NOT active_trip THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(driver_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.nonregional_transport_requisitions
    WHERE recommended_driver_id = driver_id
      AND status IN ('assigned', 'in_progress')
  ) OR EXISTS (
    SELECT 1
    FROM public.transport_requests
    WHERE assigned_driver_id = driver_id
      AND workflow_stage = 'assigned'
      AND status IN ('assigned', 'in_progress')
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Driver is already assigned to an active trip and is unavailable.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_nonregional_driver_double_booking
  BEFORE INSERT OR UPDATE OF recommended_driver_id, status ON public.nonregional_transport_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_nonregional_driver_double_booking();

CREATE TRIGGER prevent_regional_driver_double_booking
  BEFORE INSERT OR UPDATE OF assigned_driver_id, status, workflow_stage ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_regional_driver_double_booking();

COMMIT;
