-- =============================================================================
-- SAFE_REGIONAL_TRANSPORT_RM_MD_FLOW.sql
-- Purpose: Ensure regional transport request columns exist for:
--   Regional HR Office / Chief Driver  →  Regional Manager endorse
--   →  Managing Director approve
--
-- Safety:
--   - Additive only (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
--   - Does NOT modify auth schema, passwords, sessions, or login
--   - Does NOT update/delete existing transport rows, leave, loan, or attendance
--   - Does NOT drop tables/columns or rewrite role CHECK constraints
--   - Idempotent: safe to re-run
-- =============================================================================

-- Optional signature / requester columns used by the regional request API
ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS regional_hr_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS regional_hr_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS regional_hr_signature_data_url text,
  ADD COLUMN IF NOT EXISTS chief_driver_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS regional_manager_signer_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS regional_manager_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS regional_manager_signature_data_url text;

CREATE INDEX IF NOT EXISTS transport_requests_regional_hr_signer_idx
  ON public.transport_requests(regional_hr_signer_id);

CREATE INDEX IF NOT EXISTS transport_requests_chief_driver_idx
  ON public.transport_requests(chief_driver_id);

CREATE INDEX IF NOT EXISTS transport_requests_regional_manager_signer_idx
  ON public.transport_requests(regional_manager_signer_id);

CREATE INDEX IF NOT EXISTS transport_requests_workflow_stage_idx
  ON public.transport_requests(workflow_stage);

-- Read-only verification (no data changes)
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'transport_requests'
  AND column_name IN (
    'regional_hr_signer_id',
    'regional_hr_signed_at',
    'regional_hr_signature_data_url',
    'chief_driver_id',
    'regional_manager_signer_id',
    'regional_manager_signed_at',
    'regional_manager_signature_data_url',
    'workflow_stage',
    'request_type',
    'status'
  )
ORDER BY column_name;
