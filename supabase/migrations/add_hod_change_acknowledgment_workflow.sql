-- Add HOD change acknowledgment workflow support
-- Allow staff to accept or counter-propose when HOD changes leave dates

-- 1. Add new status value for when HOD changes are pending staff acknowledgment
ALTER TABLE public.leave_plan_requests
  DROP CONSTRAINT IF EXISTS leave_plan_requests_status_check;

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
    'hod_changes_pending_acceptance',   -- NEW: Staff must acknowledge HOD changes
    'hr_office_forwarded',
    -- Final statuses (unchanged)
    'hr_approved',
    'hr_rejected'
  ));

-- 2. Add columns to track HOD change acknowledgment
ALTER TABLE public.leave_plan_requests
  ADD COLUMN IF NOT EXISTS hod_proposed_start_date DATE,
  ADD COLUMN IF NOT EXISTS hod_proposed_end_date DATE,
  ADD COLUMN IF NOT EXISTS hod_change_notes TEXT,
  ADD COLUMN IF NOT EXISTS staff_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_acknowledgment_status VARCHAR(20)
    CHECK (staff_acknowledgment_status IS NULL OR staff_acknowledgment_status IN ('accepted', 'counter_proposed'));

-- 3. Create table to track HOD change notifications and staff responses
CREATE TABLE IF NOT EXISTS public.hod_change_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_plan_request_id UUID NOT NULL REFERENCES public.leave_plan_requests(id) ON DELETE CASCADE,
  hod_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  staff_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  
  -- Original staff request dates
  original_requested_start DATE NOT NULL,
  original_requested_end DATE NOT NULL,
  
  -- HOD proposed dates
  hod_proposed_start DATE NOT NULL,
  hod_proposed_end DATE NOT NULL,
  
  -- HOD notes explaining the change
  hod_notes TEXT,
  
  -- Staff response
  staff_response_status VARCHAR(20) DEFAULT 'pending'
    CHECK (staff_response_status IN ('pending', 'accepted', 'counter_proposed', 'declined')),
  staff_response_notes TEXT,
  staff_counter_start DATE,
  staff_counter_end DATE,
  staff_responded_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  UNIQUE(leave_plan_request_id)
);

-- 4. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_hod_change_notifications_staff_user
  ON public.hod_change_notifications(staff_user_id)
  WHERE staff_response_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_hod_change_notifications_leave_request
  ON public.hod_change_notifications(leave_plan_request_id);

CREATE INDEX IF NOT EXISTS idx_hod_change_notifications_status
  ON public.hod_change_notifications(staff_response_status);

-- 5. Add same status values to leave_plan_stagger_requests
ALTER TABLE public.leave_plan_stagger_requests
  DROP CONSTRAINT IF EXISTS leave_plan_stagger_requests_status_check;

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
    'hod_changes_pending_acceptance',  -- NEW
    'hr_office_forwarded',
    'hr_approved',
    'hr_rejected'
  ));

-- 6. Add same tracking columns to leave_plan_stagger_requests
ALTER TABLE public.leave_plan_stagger_requests
  ADD COLUMN IF NOT EXISTS hod_proposed_start_date DATE,
  ADD COLUMN IF NOT EXISTS hod_proposed_end_date DATE,
  ADD COLUMN IF NOT EXISTS hod_change_notes TEXT,
  ADD COLUMN IF NOT EXISTS staff_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_acknowledgment_status VARCHAR(20)
    CHECK (staff_acknowledgment_status IS NULL OR staff_acknowledgment_status IN ('accepted', 'counter_proposed'));

-- 7. Add comments for documentation
COMMENT ON TABLE public.hod_change_notifications IS 'Tracks HOD date change proposals and staff acknowledgment responses. Staff must acknowledge or counter-propose within 14 days.';

COMMENT ON COLUMN public.hod_change_notifications.staff_response_status IS 'Workflow status: pending (awaiting staff response), accepted (staff approved changes), counter_proposed (staff offered alternative dates), declined (staff rejected changes)';

COMMENT ON COLUMN public.leave_plan_requests.hod_changes_pending_acceptance IS 'Status when HOD has proposed date changes that are waiting for staff acknowledgment before forwarding to HR Leave Office';
