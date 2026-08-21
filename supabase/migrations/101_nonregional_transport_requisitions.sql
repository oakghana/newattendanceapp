CREATE TABLE IF NOT EXISTS public.nonregional_transport_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.user_profiles(id),
  department text NOT NULL,
  location text NOT NULL CHECK (location IN ('QCC Head Office', 'Awutu Stores', 'Nsawam Archives')),
  requisition_date date NOT NULL DEFAULT CURRENT_DATE,
  origin text NOT NULL,
  destination text NOT NULL,
  purpose text NOT NULL,
  required_at timestamptz NOT NULL,
  return_at timestamptz,
  persons_requiring_transport text NOT NULL,
  hod_authorization text NOT NULL,
  hod_signature_data_url text,
  recommended_vehicle text,
  recommended_driver_id uuid REFERENCES public.user_profiles(id),
  transport_use_date date,
  dtm_signature_data_url text,
  md_decision text CHECK (md_decision IN ('pending', 'approved', 'rejected')) NOT NULL DEFAULT 'pending',
  md_decided_by uuid REFERENCES public.user_profiles(id),
  md_decided_at timestamptz,
  transport_manager_id uuid REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'submitted',
  supporting_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin','staff','driver','transport_manager','managing_director','regional_manager','regional_hr','hr_executive','hr_leave_office','hr_records','department_head','director_hr','manager_hr','accounts','accounts_executive','intern','contract','nsp','it-admin'));

CREATE INDEX IF NOT EXISTS nonregional_transport_location_status_idx ON public.nonregional_transport_requisitions(location, status);
CREATE INDEX IF NOT EXISTS nonregional_transport_requester_idx ON public.nonregional_transport_requisitions(requester_id);
ALTER TABLE public.nonregional_transport_requisitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nonregional_transport_authenticated_access ON public.nonregional_transport_requisitions;
CREATE POLICY nonregional_transport_authenticated_access ON public.nonregional_transport_requisitions FOR ALL TO authenticated USING (
  requester_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','department_head','managing_director','transport_manager'))
) WITH CHECK (
  requester_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','department_head','managing_director','transport_manager'))
);
