-- Non-regional transport requests require the requester and assigned HOD to sign separately.
ALTER TABLE public.nonregional_transport_requisitions
  ALTER COLUMN hod_authorization DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS hod_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_signature_data_url text,
  ADD COLUMN IF NOT EXISTS requester_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hod_decision text NOT NULL DEFAULT 'pending' CHECK (hod_decision IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS hod_decided_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hod_decided_at timestamptz;

-- Existing rows already past requester submit were treated as HOD-self-authorized.
UPDATE public.nonregional_transport_requisitions
SET
  hod_decision = 'approved',
  status = CASE
    WHEN md_decision = 'pending' AND status IN ('submitted', 'pending') THEN 'awaiting_md_approval'
    ELSE status
  END
WHERE hod_authorization IS NOT NULL
  AND hod_signature_data_url IS NOT NULL
  AND hod_decision = 'pending';

CREATE INDEX IF NOT EXISTS nonregional_transport_hod_queue_idx
  ON public.nonregional_transport_requisitions(hod_id, hod_decision, created_at DESC);

DROP POLICY IF EXISTS nonregional_transport_authenticated_access ON public.nonregional_transport_requisitions;
CREATE POLICY nonregional_transport_authenticated_access ON public.nonregional_transport_requisitions FOR ALL TO authenticated USING (
  requester_id = auth.uid() OR hod_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'it-admin', 'managing_director', 'transport_manager')
  )
) WITH CHECK (
  requester_id = auth.uid() OR hod_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'it-admin', 'managing_director', 'transport_manager')
  )
);