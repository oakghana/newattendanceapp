-- Allow the V2 HOD workflow to persist a rejection status.
-- Older deployments only allowed the legacy manager statuses, so denying a
-- request with a reason failed at the leave_plan_requests check constraint.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.leave_plan_requests'::regclass
    AND contype = 'c'
    AND conname = 'leave_plan_requests_status_check';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leave_plan_requests DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.leave_plan_requests
    ADD CONSTRAINT leave_plan_requests_status_check
    CHECK (status IN (
      'pending_manager_review',
      'manager_changes_requested',
      'manager_rejected',
      'manager_confirmed',
      'pending_hod_review',
      'hod_changes_requested',
      'hod_rejected',
      'hod_approved',
      'pending_hr_records_reference',
      'pending_hr_leave_processing',
      'hr_office_forwarded',
      'hr_approved',
      'hr_rejected',
      'pending_regional_hr_review',
      'pending_regional_hr_office_review',
      'pending_regional_manager_approval',
      'regional_changes_requested',
      'regional_rejected',
      'approved'
    ));
END $$;

NOTIFY pgrst, 'reload schema';
