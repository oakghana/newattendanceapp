-- Persist the Regional Manager's endorsement signature in dedicated columns so the
-- original request memo to the Managing Director always shows the Regional Manager
-- as the signer (never the HR Executive). The HR Executive only signs the rejoinder.
ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS regional_manager_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS regional_manager_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS regional_manager_signature_data_url text;

CREATE INDEX IF NOT EXISTS transport_requests_regional_manager_signer_idx
  ON public.transport_requests(regional_manager_signer_id);
