-- Leave Deferment Workflow
-- Allows staff to request deferment of approved leave to future leave year
-- Requires HOD/Regional Manager approval before going to HR Leave Office

-- 1. Create leave_deferment_requests table
CREATE TABLE IF NOT EXISTS public.leave_deferment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leave_plan_request_id UUID NOT NULL REFERENCES public.leave_plan_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  requested_deferment_year VARCHAR(20) NOT NULL, -- e.g., "2027"
  requested_deferment_period VARCHAR(50) NOT NULL, -- e.g., "Q1 2027" or "January 2027"
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_hod_review' CHECK (status IN (
    'pending_hod_review',        -- Awaiting HOD/Regional Manager approval
    'hod_approved',              -- HOD approved, awaiting HR Leave Office action
    'hod_rejected',              -- HOD rejected the deferment
    'hod_changes_requested',     -- HOD requested different deferment period
    'hr_office_approved',        -- HR Leave Office approved the deferment
    'hr_office_rejected',        -- HR Leave Office rejected
    'cancelled_by_staff',        -- Staff cancelled the request
    'completed'                  -- Deferment successfully completed
  )),
  
  -- HOD/Regional Manager Review
  hod_reviewer_id UUID REFERENCES public.user_profiles(id),
  hod_decision VARCHAR(50),     -- 'approved', 'rejected', 'request_change'
  hod_notes TEXT,
  hod_reviewed_at TIMESTAMPTZ,
  hod_proposed_deferment_year VARCHAR(20), -- If requesting changes
  hod_proposed_deferment_period VARCHAR(50),
  
  -- HR Leave Office Action
  hr_office_reviewer_id UUID REFERENCES public.user_profiles(id),
  hr_office_decision VARCHAR(50), -- 'approved', 'rejected'
  hr_office_notes TEXT,
  hr_office_reviewed_at TIMESTAMPTZ,
  
  -- Tracking
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_deferment_year CHECK (requested_deferment_year ~ '^\d{4}$')
);

-- 2. Create leave_deferment_notifications table for tracking notifications
CREATE TABLE IF NOT EXISTS public.leave_deferment_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deferment_request_id UUID NOT NULL REFERENCES public.leave_deferment_requests(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'staff_submitted', 'hod_notified', 'hod_approved', 'hod_rejected', 'hr_notified'
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add deferment-related columns to leave_plan_requests
ALTER TABLE public.leave_plan_requests
  ADD COLUMN IF NOT EXISTS is_deferred BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deferral_request_id UUID REFERENCES public.leave_deferment_requests(id),
  ADD COLUMN IF NOT EXISTS original_leave_year VARCHAR(20), -- Stores the original leave year if deferred
  ADD COLUMN IF NOT EXISTS deferment_created_at TIMESTAMPTZ;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_deferment_requests_user_id ON public.leave_deferment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_deferment_requests_status ON public.leave_deferment_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_deferment_requests_hod_reviewer ON public.leave_deferment_requests(hod_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_leave_deferment_requests_leave_plan ON public.leave_deferment_requests(leave_plan_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_deferment_notifications_recipient ON public.leave_deferment_notifications(recipient_id);

-- 5. Enable Row Level Security
ALTER TABLE public.leave_deferment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_deferment_notifications ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
-- Staff can view their own deferment requests
CREATE POLICY "Users can view their own deferment requests"
  ON public.leave_deferment_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- HOD/RM can view deferment requests for their staff
CREATE POLICY "HOD/RM can view deferment requests for their staff"
  ON public.leave_deferment_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leave_plan_requests lr
      WHERE lr.id = leave_plan_request_id
      AND (
        lr.hod_user_id = auth.uid()
        OR lr.regional_manager_id = auth.uid()
      )
    )
  );

-- Admin/HR Leave Office can view all
CREATE POLICY "Admin can view all deferment requests"
  ON public.leave_deferment_requests
  FOR SELECT
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) 
    IN ('admin', 'leave_admin', 'hr_office', 'hr_leave_office', 'director_hr', 'manager_hr')
  );

-- Staff can insert deferment requests
CREATE POLICY "Staff can create deferment requests"
  ON public.leave_deferment_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- HOD/RM can update deferment requests (for approval)
CREATE POLICY "HOD/RM can update pending deferment requests"
  ON public.leave_deferment_requests
  FOR UPDATE
  USING (
    status = 'pending_hod_review'
    AND EXISTS (
      SELECT 1 FROM public.leave_plan_requests lr
      WHERE lr.id = leave_plan_request_id
      AND (
        lr.hod_user_id = auth.uid()
        OR lr.regional_manager_id = auth.uid()
      )
    )
  );

-- HR Leave Office can update approved deferment requests
CREATE POLICY "HR Leave Office can update approved deferments"
  ON public.leave_deferment_requests
  FOR UPDATE
  USING (
    status = 'hod_approved'
    AND (
      SELECT role FROM public.user_profiles WHERE id = auth.uid()
    ) IN ('admin', 'leave_admin', 'hr_office', 'hr_leave_office')
  );

-- Similarly for notifications table
CREATE POLICY "Users can view their own notifications"
  ON public.leave_deferment_notifications
  FOR SELECT
  USING (auth.uid() = recipient_id);

-- Add comment
COMMENT ON TABLE public.leave_deferment_requests IS 'Tracks leave deferment requests from staff to defer approved leave to a future leave year';
COMMENT ON TABLE public.leave_deferment_notifications IS 'Tracks notifications sent during the deferment workflow';
COMMENT ON COLUMN public.leave_deferment_requests.status IS 'Current status of the deferment request through the approval workflow';
COMMENT ON COLUMN public.leave_plan_requests.is_deferred IS 'TRUE if this leave has been deferred to another leave year';
