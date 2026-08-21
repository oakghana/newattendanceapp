ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS hr_executive_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hr_executive_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_executive_signature_data_url text;

CREATE INDEX IF NOT EXISTS transport_requests_hr_executive_signer_idx
  ON public.transport_requests(hr_executive_signer_id);
