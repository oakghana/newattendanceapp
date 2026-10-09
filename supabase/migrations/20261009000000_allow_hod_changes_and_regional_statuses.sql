-- Superset of every status the leave workflow writes. The HOD "Changes" and
-- "Reject" actions persist hod_changes_requested / hod_rejected, which older
-- databases rejected with a leave_plan_requests_status_check violation.
ALTER TABLE public.leave_plan_requests DROP CONSTRAINT IF EXISTS leave_plan_requests_status_check;

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
    'pending_regional_hr_review',
    'pending_regional_hr_office_review',
    'pending_regional_manager_approval',
    'regional_changes_requested',
    'regional_rejected',
    'pending_hr_leave_processing',
    'pending_hr_records_reference',
    'hr_office_forwarded',
    'hr_approved',
    'hr_rejected',
    'approved',
    'rejected',
    'withdrawn'
  ));

NOTIFY pgrst, 'reload schema';
