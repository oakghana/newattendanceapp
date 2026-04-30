-- Global chronological reference numbers for loan and leave documents
-- Format: QCC/HRD/SWL/V.2/<sequence>

CREATE SEQUENCE IF NOT EXISTS public.qcc_reference_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION public.next_qcc_reference()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_value BIGINT;
BEGIN
  seq_value := nextval('public.qcc_reference_seq');
  RETURN 'QCC/HRD/SWL/V.2/' || seq_value::TEXT;
END;
$$;

ALTER TABLE IF EXISTS public.loan_requests
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(80);

ALTER TABLE IF EXISTS public.leave_requests
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_requests_reference_number
  ON public.loan_requests(reference_number)
  WHERE reference_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_requests_reference_number
  ON public.leave_requests(reference_number)
  WHERE reference_number IS NOT NULL;
