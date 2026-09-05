-- Adds the same department-head signer audit columns used on transport_requests (see 103_transport_role_signatures.sql)
-- to nonregional_transport_requisitions, so auto-populated HOD/Administrator authorization can be persisted.
ALTER TABLE public.nonregional_transport_requisitions
  ADD COLUMN IF NOT EXISTS department_head_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS department_head_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS department_head_signature_data_url text;

CREATE INDEX IF NOT EXISTS nonregional_transport_department_head_signer_idx ON public.nonregional_transport_requisitions(department_head_signer_id);
