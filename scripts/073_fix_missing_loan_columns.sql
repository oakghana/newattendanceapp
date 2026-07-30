-- =============================================================================
-- 073_fix_missing_loan_columns.sql
--
-- PURPOSE
--   Fix the "Loan module schema missing" error on production by adding every
--   column that was introduced by later migrations but may not have been
--   applied to the live database yet.
--
-- SAFE TO RUN MULTIPLE TIMES
--   Every statement uses ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--   / CREATE TABLE IF NOT EXISTS, so running this script on a database that
--   already has some or all of these changes is a no-op for those parts.
--
-- HOW TO RUN
--   Paste this entire script into the Supabase SQL editor on the production
--   project and click "Run". No downtime is required.
-- =============================================================================


-- =============================================================================
-- 1. LOAN_REQUESTS — columns from add_loan_repayment_tracking migration
-- =============================================================================

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS repayment_plan_generated_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS repayment_duration_months    INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS repayment_status             TEXT    DEFAULT 'not_started'
    CHECK (repayment_status IN (
      'not_started', 'active', 'on_track', 'overdue', 'completed', 'defaulted'
    ));


-- =============================================================================
-- 2. LOAN_REQUESTS — columns from 056_add_memo_cc_to_loan_requests
-- =============================================================================

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS memo_cc TEXT;

COMMENT ON COLUMN public.loan_requests.memo_cc
  IS 'CC recipients for the memo (one per line)';

CREATE INDEX IF NOT EXISTS idx_loan_requests_memo_cc
  ON public.loan_requests (memo_cc);


-- =============================================================================
-- 3. LOAN_REQUESTS — columns from 054_loan_inactivity_governance
--    (hod_reviewer_id, loan_office_forwarded_at, hr_forwarded_at,
--     committee_required, recovery_months already in 051 base schema but
--     guarded here for safety)
-- =============================================================================

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS hod_reviewer_id            UUID
    REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loan_office_forwarded_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS hr_forwarded_at            TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS committee_required         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_months            INTEGER;


-- =============================================================================
-- 4. LOAN_REQUESTS — location columns from 051 that may be missing
-- =============================================================================

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS reference_number         VARCHAR(80) UNIQUE,
  ADD COLUMN IF NOT EXISTS staff_location_id        UUID,
  ADD COLUMN IF NOT EXISTS staff_location_name      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS staff_location_address   TEXT,
  ADD COLUMN IF NOT EXISTS staff_district_name      VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_loan_requests_location
  ON public.loan_requests (staff_location_id, created_at DESC);


-- =============================================================================
-- 5. LOAN_PAYMENT_RECORDS table (from add_loan_repayment_tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.loan_payment_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id           UUID NOT NULL
    REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  payment_date              DATE NOT NULL,
  amount_paid               NUMERIC(15, 2) NOT NULL,
  payment_method            TEXT
    CHECK (payment_method IN ('bank_transfer','cash','cheque','mobile_money')),
  reference_number          TEXT,

  submitted_by              UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  hr_executive_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  hr_approval_at            TIMESTAMP WITH TIME ZONE,
  hr_approval_status        TEXT DEFAULT 'pending'
    CHECK (hr_approval_status IN ('pending','approved','rejected')),
  hr_approval_notes         TEXT,

  accounts_executive_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accounts_approval_at      TIMESTAMP WITH TIME ZONE,
  accounts_approval_status  TEXT DEFAULT 'pending'
    CHECK (accounts_approval_status IN ('pending','approved','rejected')),
  accounts_approval_notes   TEXT,

  overall_status            TEXT DEFAULT 'pending'
    CHECK (overall_status IN ('pending','approved','rejected','completed')),

  evidence_file_path        TEXT,
  description               TEXT,

  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_payment_amount CHECK (amount_paid > 0)
);

CREATE INDEX IF NOT EXISTS idx_loan_payment_records_loan_id
  ON public.loan_payment_records (loan_request_id);
CREATE INDEX IF NOT EXISTS idx_loan_payment_records_submitted_by
  ON public.loan_payment_records (submitted_by);
CREATE INDEX IF NOT EXISTS idx_loan_payment_records_status
  ON public.loan_payment_records (overall_status);
CREATE INDEX IF NOT EXISTS idx_loan_payment_records_payment_date
  ON public.loan_payment_records (payment_date);


-- =============================================================================
-- 6. LOAN_REPAYMENT_SCHEDULE table (from add_loan_repayment_tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.loan_repayment_schedule (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id     UUID NOT NULL
    REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,
  due_date            DATE NOT NULL,
  monthly_amount      NUMERIC(15, 2) NOT NULL,

  payment_record_id   UUID
    REFERENCES public.loan_payment_records(id) ON DELETE SET NULL,
  paid_date           DATE,
  paid_amount         NUMERIC(15, 2),
  status              TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','paid','partial','overdue','waived')),

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_installment_number    CHECK (installment_number > 0),
  CONSTRAINT valid_monthly_amount        CHECK (monthly_amount > 0),
  CONSTRAINT unique_installment_per_loan UNIQUE (loan_request_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_loan_repayment_schedule_loan_id
  ON public.loan_repayment_schedule (loan_request_id);
CREATE INDEX IF NOT EXISTS idx_loan_repayment_schedule_due_date
  ON public.loan_repayment_schedule (due_date);
CREATE INDEX IF NOT EXISTS idx_loan_repayment_schedule_status
  ON public.loan_repayment_schedule (status);


-- =============================================================================
-- Done.  Verify by running:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'loan_requests' ORDER BY ordinal_position;
-- =============================================================================
