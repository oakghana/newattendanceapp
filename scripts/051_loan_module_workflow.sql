-- Loan module workflow schema
-- ============================================================
-- QCC Loan Module Workflow Schema
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- Compatibility shim for environments where existing DB objects reference public.locations.
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_key VARCHAR(80) NOT NULL UNIQUE,
  loan_label VARCHAR(160) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'other',
  requires_committee BOOLEAN NOT NULL DEFAULT false,
  requires_fd_check BOOLEAN NOT NULL DEFAULT true,
  min_fd_score NUMERIC(5,2) NOT NULL DEFAULT 39,
  min_qualification_note TEXT,
  loan_terms TEXT,
  default_recovery_months INTEGER,
  fixed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(40) UNIQUE,
  reference_number VARCHAR(80) UNIQUE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  corporate_email VARCHAR(200),
  staff_number VARCHAR(50),
  staff_rank VARCHAR(120),
  staff_location_id UUID,
  staff_location_name VARCHAR(200),
  staff_location_address TEXT,
  staff_district_name VARCHAR(200),
  loan_type_key VARCHAR(80) NOT NULL,
  loan_type_label VARCHAR(160) NOT NULL,
  requested_amount NUMERIC(14,2),
  reason TEXT,
  supporting_document_url TEXT,
  requires_fd_check BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_hod',

  hod_reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  hod_review_note TEXT,
  hod_decision_at TIMESTAMPTZ,

  loan_office_reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  loan_office_note TEXT,
  loan_office_forwarded_at TIMESTAMPTZ,

  accounts_reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  fd_score NUMERIC(6,2),
  fd_note TEXT,
  fd_checked_at TIMESTAMPTZ,
  fd_good BOOLEAN,

  committee_required BOOLEAN NOT NULL DEFAULT false,
  committee_reviewer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  committee_note TEXT,
  committee_decision_at TIMESTAMPTZ,

  hr_officer_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  hr_note TEXT,
  recovery_start_date DATE,
  disbursement_date DATE,
  recovery_months INTEGER,
  hr_forwarded_at TIMESTAMPTZ,

  director_hr_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  director_signature_mode VARCHAR(20),
  director_signature_text TEXT,
  director_signature_data_url TEXT,
  director_letter TEXT,
  director_note TEXT,
  director_decision_at TIMESTAMPTZ,

  fixed_amount NUMERIC(14,2),

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_request_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_role VARCHAR(80),
  action_key VARCHAR(80) NOT NULL,
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_hod_linkages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  hod_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  location_id UUID,
  district_name VARCHAR(200),
  location_address TEXT,
  staff_rank VARCHAR(120),
  hod_rank VARCHAR(120),
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_types_active ON public.loan_types(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_loan_requests_user ON public.loan_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_requests_status ON public.loan_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_requests_department ON public.loan_requests(department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_timeline_request ON public.loan_request_timeline(loan_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_hod_link_staff ON public.loan_hod_linkages(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_loan_hod_link_hod ON public.loan_hod_linkages(hod_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_hod_link_staff_hod_unique ON public.loan_hod_linkages(staff_user_id, hod_user_id);

ALTER TABLE public.loan_hod_linkages
  DROP CONSTRAINT IF EXISTS loan_hod_linkages_staff_user_id_key;

ALTER TABLE public.loan_types
  ADD COLUMN IF NOT EXISTS requires_fd_check BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.loan_types
  ADD COLUMN IF NOT EXISTS fixed_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.loan_types
  ADD COLUMN IF NOT EXISTS max_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.loan_types
  ADD COLUMN IF NOT EXISTS min_qualification_note TEXT;

ALTER TABLE public.loan_types
  ADD COLUMN IF NOT EXISTS loan_terms TEXT;

ALTER TABLE public.loan_types
  ADD COLUMN IF NOT EXISTS default_recovery_months INTEGER;

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS requires_fd_check BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS fixed_amount NUMERIC(14,2);

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS staff_location_id UUID;

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS staff_location_name VARCHAR(200);

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS staff_location_address TEXT;

ALTER TABLE public.loan_requests
  ADD COLUMN IF NOT EXISTS staff_district_name VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_loan_requests_location ON public.loan_requests(staff_location_id, created_at DESC);

INSERT INTO public.loan_types (loan_key, loan_label, category, requires_committee, requires_fd_check, min_fd_score, min_qualification_note, loan_terms, default_recovery_months, fixed_amount, max_amount, is_active, sort_order)
VALUES
  ('car_loan_junior',               'Car Loan (Junior)',                'car',   true,  true,  39, 'Junior and above', 'Standard car-loan recovery applies.', 48, 15000.00, 15000.00, true,  1),
  ('car_loan_senior',               'Car Loan (Senior)',                'car',   true,  true,  39, 'Senior and above', 'Standard car-loan recovery applies.', 48, 25000.00, 25000.00, true,  2),
  ('car_loan_junior_motor',         'Car Loan (Junior Motor)',          'car',   true,  true,  39, 'Junior and above', 'Standard car-loan recovery applies.', 36, 10000.00, 10000.00, true,  3),
  ('education_loan_junior',         'Education Loan (Junior)',          'other', false, true,  39, 'Junior and above', 'Education loan repayment applies.', 24,  5000.00,  5000.00, true,  4),
  ('education_loan_senior',         'Education Loan (Senior)',          'other', false, true,  39, 'Senior and above', 'Education loan repayment applies.', 24,  8000.00,  8000.00, true,  5),
  ('funeral_loan_junior',           'Funeral Loan (Junior)',            'other', false, false, 39, 'Junior and above', 'Immediate welfare support; recovery applies per policy.', 12, 10000.00, 10000.00, true,  6),
  ('funeral_loan_senior',           'Funeral Loan (Senior)',            'other', false, false, 39, 'Senior and above', 'Immediate welfare support; recovery applies per policy.', 12, 15000.00, 15000.00, true,  7),
  ('household_durable_loan_junior', 'Household Durable Loan (Junior)',  'other', false, true,  39, 'Junior and above', 'Household durable loan repayment applies.', 24,  5000.00,  5000.00, true,  8),
  ('household_durable_loan_senior', 'Household Durable Loan (Senior)',  'other', false, true,  39, 'Senior and above', 'Household durable loan repayment applies.', 24,  8000.00,  8000.00, true,  9),
  ('rent_loan_junior',              'Rent Loan (Junior)',               'other', false, true,  39, 'Junior and above', 'Rent loan repayment applies.', 18,  5000.00,  5000.00, true, 10),
  ('rent_loan_senior',              'Rent Loan (Senior)',               'other', false, true,  39, 'Senior and above', 'Rent loan repayment applies.', 18,  8000.00,  8000.00, true, 11),
  ('vehicle_repair_loan_junior',    'Vehicle Repair Loan (Junior)',     'other', false, true,  39, 'Junior and above', 'Vehicle repair repayment applies.', 18,  5000.00,  5000.00, true, 12),
  ('vehicle_repair_loan_junior_motor','Vehicle Repair Loan (Junior Motor)','other',false,true, 39, 'Junior and above', 'Vehicle repair repayment applies.', 18,  5000.00,  5000.00, true, 13),
  ('vehicle_repair_loan_manager',   'Vehicle Repair Loan (Manager)',    'other', false, true,  39, 'Manager and above', 'Vehicle repair repayment applies.', 24, 10000.00, 10000.00, true, 14),
  ('vehicle_repair_loan_senior',    'Vehicle Repair Loan (Senior)',     'other', false, true,  39, 'Senior and above', 'Vehicle repair repayment applies.', 24,  8000.00,  8000.00, true, 15),
  ('vehicle_insurance_loan_manager','Vehicle Insurance Loan (Manager)', 'other', false, false, 39, 'Manager and above', 'Insurance-backed welfare loan terms apply.', 12,  5000.00,  5000.00, true, 16),
  ('vehicle_insurance_loan_senior', 'Vehicle Insurance Loan (Senior)',  'other', false, false, 39, 'Senior and above', 'Insurance-backed welfare loan terms apply.', 12,  3000.00,  3000.00, true, 17)
ON CONFLICT (loan_key) DO UPDATE SET
  loan_label = EXCLUDED.loan_label,
  category = EXCLUDED.category,
  requires_committee = EXCLUDED.requires_committee,
  requires_fd_check = EXCLUDED.requires_fd_check,
  min_fd_score = EXCLUDED.min_fd_score,
  min_qualification_note = EXCLUDED.min_qualification_note,
  loan_terms = EXCLUDED.loan_terms,
  default_recovery_months = EXCLUDED.default_recovery_months,
  fixed_amount = EXCLUDED.fixed_amount,
  max_amount = EXCLUDED.max_amount,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
