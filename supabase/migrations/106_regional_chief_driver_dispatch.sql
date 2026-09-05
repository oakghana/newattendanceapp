-- Regional Chief Driver can manage local fleet condition and dispatch requests.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('user_profiles_role_check', 'valid_role')) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
    ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS valid_role;
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN (
      'admin', 'staff', 'driver', 'chief_driver', 'transport_manager', 'managing_director',
      'regional_manager', 'regional_hr', 'hr_executive', 'hr_leave_office', 'hr_records',
      'department_head', 'director_hr', 'manager_hr', 'accounts', 'accounts_executive',
      'intern', 'contract', 'nsp', 'it-admin'
    ));
  END IF;
END $$;

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS chief_driver_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS local_dispatch_notes text;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS hod_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transport_requests_assigned_driver_idx
  ON public.transport_requests(assigned_driver_id);

CREATE INDEX IF NOT EXISTS user_profiles_hod_idx ON public.user_profiles(hod_id);

DROP POLICY IF EXISTS transport_vehicles_authenticated_access ON public.transport_vehicles;
CREATE POLICY transport_vehicles_authenticated_access ON public.transport_vehicles FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'transport_manager', 'regional_hr', 'regional_manager', 'chief_driver'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'transport_manager', 'regional_hr', 'regional_manager', 'chief_driver'))
);