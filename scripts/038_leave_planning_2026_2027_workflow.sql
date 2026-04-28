-- Leave planning workflow for 2026/2027 with multi-step approvals and signatures

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Missing prerequisite table public.user_profiles. Run scripts/001_create_database_schema.sql first, then re-run this script.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.leave_plan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  leave_year_period VARCHAR(20) NOT NULL DEFAULT '2026/2027',
  preferred_start_date DATE NOT NULL,
  preferred_end_date DATE NOT NULL,
  leave_type_key VARCHAR(80),
  entitlement_days INTEGER,
  requested_days INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_manager_review'
    CHECK (status IN (
      'pending_manager_review',
      'manager_changes_requested',
      'manager_rejected',
      'manager_confirmed',
      'hr_approved',
      'hr_rejected'
    )),
  manager_recommendation TEXT,
  hr_response_letter TEXT,
  user_signature_mode VARCHAR(20) DEFAULT 'typed',
  user_signature_text TEXT,
  user_signature_image_url TEXT,
  user_signature_data_url TEXT,
  user_signature_hologram_code TEXT,
  hr_signature_mode VARCHAR(20),
  hr_signature_text TEXT,
  hr_signature_image_url TEXT,
  hr_signature_data_url TEXT,
  hr_signature_hologram_code TEXT,
  reminder_sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT leave_plan_requests_dates_valid CHECK (preferred_end_date >= preferred_start_date)
);

CREATE TABLE IF NOT EXISTS public.leave_plan_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_plan_request_id UUID NOT NULL REFERENCES public.leave_plan_requests(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  reviewer_role VARCHAR(30) NOT NULL
    CHECK (reviewer_role IN ('regional_manager', 'department_head')),
  decision VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'recommend_change', 'rejected')),
  recommendation TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (leave_plan_request_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS public.leave_plan_stagger_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_plan_request_id UUID NOT NULL REFERENCES public.leave_plan_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  requested_start_date DATE NOT NULL,
  requested_end_date DATE NOT NULL,
  leave_type_key VARCHAR(80),
  entitlement_days INTEGER,
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_manager_review'
    CHECK (status IN (
      'pending_manager_review',
      'manager_changes_requested',
      'manager_rejected',
      'manager_confirmed',
      'hr_approved',
      'hr_rejected'
    )),
  manager_recommendation TEXT,
  hr_response_letter TEXT,
  user_signature_mode VARCHAR(20) DEFAULT 'typed',
  user_signature_text TEXT,
  user_signature_image_url TEXT,
  user_signature_data_url TEXT,
  user_signature_hologram_code TEXT,
  hr_signature_mode VARCHAR(20),
  hr_signature_text TEXT,
  hr_signature_image_url TEXT,
  hr_signature_data_url TEXT,
  hr_signature_hologram_code TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT leave_plan_stagger_dates_valid CHECK (requested_end_date >= requested_start_date)
);

CREATE TABLE IF NOT EXISTS public.leave_plan_stagger_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_plan_stagger_request_id UUID NOT NULL REFERENCES public.leave_plan_stagger_requests(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  reviewer_role VARCHAR(30) NOT NULL
    CHECK (reviewer_role IN ('regional_manager', 'department_head')),
  decision VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'recommend_change', 'rejected')),
  recommendation TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (leave_plan_stagger_request_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_user_id ON public.leave_plan_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_status ON public.leave_plan_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_start_date ON public.leave_plan_requests(preferred_start_date);
CREATE INDEX IF NOT EXISTS idx_leave_plan_reviews_reviewer_id ON public.leave_plan_reviews(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_leave_plan_stagger_requests_user_id ON public.leave_plan_stagger_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_stagger_requests_status ON public.leave_plan_stagger_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_plan_stagger_reviews_reviewer_id ON public.leave_plan_stagger_reviews(reviewer_id);
