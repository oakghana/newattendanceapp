CREATE TABLE IF NOT EXISTS public.leave_resumption_delay_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_resumption_id UUID REFERENCES public.leave_resumption_notifications(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('day_5_warning', 'resumption_recommendation', 'resumption_memo', 'day_10_serious_warning')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leave_resumption_delay_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.leave_resumption_delay_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  edited_by UUID NOT NULL REFERENCES auth.users(id),
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version)
);

ALTER TABLE public.leave_resumption_delay_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_resumption_delay_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read published resumption delay documents" ON public.leave_resumption_delay_documents
  FOR SELECT USING (staff_user_id = auth.uid() AND is_published = true);
CREATE POLICY "HR and admins can manage resumption delay documents" ON public.leave_resumption_delay_documents
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND lower(replace(p.role, '-', '_')) IN ('admin','hr_leave_office','hr_office','hr_executive','director_hr','manager_hr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND lower(replace(p.role, '-', '_')) IN ('admin','hr_leave_office','hr_office','hr_executive','director_hr','manager_hr')));
CREATE POLICY "HR and admins can read document versions" ON public.leave_resumption_delay_document_versions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND lower(replace(p.role, '-', '_')) IN ('admin','hr_leave_office','hr_office','hr_executive','director_hr','manager_hr')));

CREATE INDEX IF NOT EXISTS idx_resumption_delay_documents_staff ON public.leave_resumption_delay_documents(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_resumption_delay_documents_resumption ON public.leave_resumption_delay_documents(leave_resumption_id);
