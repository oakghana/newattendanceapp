BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_driver_double_booking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  driver_id uuid;
  active_trip boolean;
BEGIN
  driver_id := CASE
    WHEN TG_TABLE_NAME = 'nonregional_transport_requisitions' THEN NEW.recommended_driver_id
    ELSE NEW.assigned_driver_id
  END;
  active_trip := CASE
    WHEN TG_TABLE_NAME = 'nonregional_transport_requisitions' THEN NEW.status IN ('assigned', 'in_progress')
    ELSE NEW.workflow_stage = 'assigned' AND NEW.status IN ('assigned', 'in_progress')
  END;

  IF driver_id IS NULL OR NOT active_trip THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(driver_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.nonregional_transport_requisitions
    WHERE recommended_driver_id = driver_id
      AND status IN ('assigned', 'in_progress')
      AND (TG_TABLE_NAME <> 'nonregional_transport_requisitions' OR id <> NEW.id)
  ) OR EXISTS (
    SELECT 1
    FROM public.transport_requests
    WHERE assigned_driver_id = driver_id
      AND workflow_stage = 'assigned'
      AND status IN ('assigned', 'in_progress')
      AND (TG_TABLE_NAME <> 'transport_requests' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'Driver is already assigned to an active trip and is unavailable.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_nonregional_driver_double_booking ON public.nonregional_transport_requisitions;
CREATE TRIGGER prevent_nonregional_driver_double_booking
  BEFORE INSERT OR UPDATE OF recommended_driver_id, status ON public.nonregional_transport_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_driver_double_booking();

DROP TRIGGER IF EXISTS prevent_regional_driver_double_booking ON public.transport_requests;
CREATE TRIGGER prevent_regional_driver_double_booking
  BEFORE INSERT OR UPDATE OF assigned_driver_id, status, workflow_stage ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_driver_double_booking();

COMMIT;