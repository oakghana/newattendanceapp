ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS regional_hr_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS regional_hr_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS regional_hr_signature_data_url text,
  ADD COLUMN IF NOT EXISTS department_head_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS department_head_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS department_head_signature_data_url text,
  ADD COLUMN IF NOT EXISTS transport_manager_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS transport_manager_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transport_manager_signature_data_url text;

CREATE INDEX IF NOT EXISTS transport_requests_regional_hr_signer_idx ON public.transport_requests(regional_hr_signer_id);
CREATE INDEX IF NOT EXISTS transport_requests_department_head_signer_idx ON public.transport_requests(department_head_signer_id);
CREATE INDEX IF NOT EXISTS transport_requests_transport_manager_signer_idx ON public.transport_requests(transport_manager_signer_id);
