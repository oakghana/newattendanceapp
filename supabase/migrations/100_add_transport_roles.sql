-- Transport workflow role catalog additions.
-- Safe to run repeatedly: role validation is widened only when the constraint exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check') THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_check;
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (
      'admin', 'staff', 'driver', 'transport_manager', 'managing_director', 'regional_manager', 'regional_hr',
      'hr_executive', 'hr_leave_office', 'hr_records', 'department_head', 'director_hr',
      'manager_hr', 'accounts', 'accounts_executive', 'intern', 'contract', 'nsp', 'it-admin'
    ));
  END IF;
END $$;

COMMENT ON COLUMN public.user_profiles.role IS 'Application role; includes driver and managing_director for transport workflow assignments.';
