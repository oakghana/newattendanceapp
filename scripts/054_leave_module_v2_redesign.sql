-- ============================================================
-- Leave Module V2 Redesign
-- 4-stage workflow: Staff → HOD/Regional Manager → HR Leave Office → HR Approver
-- HR Leave Office can adjust days/dates with mandatory reason (appears in memo)
-- HR Approver issues PDF memo copied to Staff, HOD, Accounts, HR Leave Office
-- ============================================================

-- 1. Drop old status CHECK constraint on leave_plan_requests
ALTER TABLE public.leave_plan_requests
  DROP CONSTRAINT IF EXISTS leave_plan_requests_status_check;

-- 2. Add new status CHECK constraint (keeps old statuses for backward compat)
ALTER TABLE public.leave_plan_requests
  ADD CONSTRAINT leave_plan_requests_status_check
  CHECK (status IN (
    -- Legacy statuses (kept for existing data)
    'pending_manager_review',
    'manager_changes_requested',
    'manager_rejected',
    'manager_confirmed',
    -- New V2 statuses
    'pending_hod_review',
    'hod_changes_requested',
    'hod_rejected',
    'hod_approved',
    'hr_office_forwarded',
    -- Final statuses (unchanged)
    'hr_approved',
    'hr_rejected'
  ));

-- 3. Add HR Leave Office adjustment columns to leave_plan_requests
ALTER TABLE public.leave_plan_requests
  ADD COLUMN IF NOT EXISTS hr_office_reviewer_id UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hr_office_reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS original_requested_days INTEGER,
  ADD COLUMN IF NOT EXISTS adjusted_days INTEGER,
  ADD COLUMN IF NOT EXISTS adjusted_start_date DATE,
  ADD COLUMN IF NOT EXISTS adjusted_end_date DATE,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS holiday_days_deducted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travelling_days_added INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_leave_days_deducted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hr_office_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_approver_id UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hr_approver_name TEXT,
  ADD COLUMN IF NOT EXISTS hr_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_approval_note TEXT,
  ADD COLUMN IF NOT EXISTS memo_token TEXT,
  ADD COLUMN IF NOT EXISTS memo_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hod_reviewer_id UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hod_reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS hod_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hod_decision TEXT
    CHECK (hod_decision IS NULL OR hod_decision IN ('approved','rejected','changes_requested'));

-- 4. Drop old status CHECK constraint on leave_plan_stagger_requests
ALTER TABLE public.leave_plan_stagger_requests
  DROP CONSTRAINT IF EXISTS leave_plan_stagger_requests_status_check;

-- 5. Add new status CHECK constraint for stagger requests
ALTER TABLE public.leave_plan_stagger_requests
  ADD CONSTRAINT leave_plan_stagger_requests_status_check
  CHECK (status IN (
    'pending_manager_review',
    'manager_changes_requested',
    'manager_rejected',
    'manager_confirmed',
    'pending_hod_review',
    'hod_changes_requested',
    'hod_rejected',
    'hod_approved',
    'hr_office_forwarded',
    'hr_approved',
    'hr_rejected'
  ));

-- 6. Add adjustment columns to stagger requests too
ALTER TABLE public.leave_plan_stagger_requests
  ADD COLUMN IF NOT EXISTS hr_office_reviewer_id UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hr_office_reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS original_requested_days INTEGER,
  ADD COLUMN IF NOT EXISTS adjusted_days INTEGER,
  ADD COLUMN IF NOT EXISTS adjusted_start_date DATE,
  ADD COLUMN IF NOT EXISTS adjusted_end_date DATE,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS holiday_days_deducted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travelling_days_added INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_leave_days_deducted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hr_office_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_approver_id UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hr_approver_name TEXT,
  ADD COLUMN IF NOT EXISTS hr_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_approval_note TEXT,
  ADD COLUMN IF NOT EXISTS memo_token TEXT,
  ADD COLUMN IF NOT EXISTS memo_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hod_reviewer_id UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS hod_reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS hod_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hod_decision TEXT
    CHECK (hod_decision IS NULL OR hod_decision IN ('approved','rejected','changes_requested'));

-- 7. Ensure hr_leave_office role is accepted in user_profiles
--    (Only needed if role column has an enum constraint; usually it's a VARCHAR)
DO $$
BEGIN
  -- Check if role column is a varchar (not an enum) before proceeding
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'role'
      AND data_type = 'USER-DEFINED'
  ) THEN
    -- Role column is an enum; try to add hr_leave_office if not already present
    BEGIN
      EXECUTE 'ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS ''hr_leave_office''';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not add hr_leave_office to user_role enum: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'role column is not an enum type; hr_leave_office can be set directly.';
  END IF;
END $$;

-- 8. Index new columns
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_hod_reviewer
  ON public.leave_plan_requests(hod_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_hr_office_reviewer
  ON public.leave_plan_requests(hr_office_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_hr_approver
  ON public.leave_plan_requests(hr_approver_id);
CREATE INDEX IF NOT EXISTS idx_leave_plan_requests_memo_token
  ON public.leave_plan_requests(memo_token)
  WHERE memo_token IS NOT NULL;
