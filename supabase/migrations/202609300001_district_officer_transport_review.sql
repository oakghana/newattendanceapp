-- Additive District Officer stage for regional transport only.
-- Loan and leave tables/workflows are intentionally untouched.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check') THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_check;
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (
      'admin', 'staff', 'driver', 'chief_driver', 'transport_manager', 'managing_director',
      'regional_manager', 'district_officer', 'regional_hr', 'hr_executive', 'hr_leave_office', 'hr_records',
      'department_head', 'director_hr', 'manager_hr', 'accounts', 'accounts_executive',
      'intern', 'contract', 'nsp', 'it-admin'
    ));
  END IF;
END $$;

create index if not exists transport_requests_district_review_idx
  on public.transport_requests (linked_district_id, workflow_stage)
  where request_type = 'regional_transport';

comment on column public.transport_requests.workflow_stage is
  'Regional transport stages include district_officer_review when a linked district is available; loan and leave workflows are independent.';
