-- ============================================================
-- Leave Archiving and Memo Generation Schema
-- Allows HR Leave Office to archive completed leave requests
-- and tracks initial memo generation for all leave applications
-- ============================================================

-- 1. Add archive tracking to leave_plan_requests table
ALTER TABLE public.leave_plan_requests
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_by_id UUID REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS memo_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS memo_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS memo_subject VARCHAR(500),
ADD COLUMN IF NOT EXISTS memo_body TEXT;

-- 2. Add archive tracking to leave_plan_stagger_requests table
ALTER TABLE public.leave_plan_stagger_requests
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_by_id UUID REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS memo_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS memo_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS memo_subject VARCHAR(500),
ADD COLUMN IF NOT EXISTS memo_body TEXT;

-- 3. Create table for leave archive audit trail
CREATE TABLE IF NOT EXISTS public.leave_archive_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_request_id UUID NOT NULL REFERENCES public.leave_plan_requests(id) ON DELETE CASCADE,
  archived_by_id UUID NOT NULL REFERENCES public.user_profiles(id),
  archive_action VARCHAR(50) NOT NULL CHECK (archive_action IN ('archived', 'unarchived')),
  reason VARCHAR(500),
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_archived ON public.leave_plan_requests(is_archived);
CREATE INDEX IF NOT EXISTS idx_leave_requests_archived_at ON public.leave_plan_requests(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_memo_generated ON public.leave_plan_requests(memo_generated);
CREATE INDEX IF NOT EXISTS idx_stagger_requests_archived ON public.leave_plan_stagger_requests(is_archived);
CREATE INDEX IF NOT EXISTS idx_stagger_requests_memo_generated ON public.leave_plan_stagger_requests(memo_generated);
CREATE INDEX IF NOT EXISTS idx_archive_log_request ON public.leave_archive_log(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_archive_log_archived_by ON public.leave_archive_log(archived_by_id);

-- 5. Update RLS policies to exclude archived requests from non-HR staff views
-- Users should not see archived leaves in their own list
DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_plan_requests;
CREATE POLICY "Users can view their own leave requests"
ON public.leave_plan_requests FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'regional_manager', 'department_head', 'hr_leave_office')
    )
    AND is_archived = FALSE
  )
);

-- 6. Allow HR Leave Office to archive/unarchive requests
DROP POLICY IF EXISTS "Managers can approve/reject leave requests" ON public.leave_plan_requests;
CREATE POLICY "Managers can approve/reject leave requests"
ON public.leave_plan_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'regional_manager', 'department_head', 'hr_leave_office')
  )
);

-- 7. Add comment documenting the archive feature
COMMENT ON TABLE public.leave_archive_log IS 'Audit trail for leave request archiving/unarchiving by HR Leave Office staff';
COMMENT ON COLUMN public.leave_plan_requests.is_archived IS 'When TRUE, request is hidden from HR manager/director dashboards unless viewing archived requests. HR Leave Office can still see and unarchive.';
COMMENT ON COLUMN public.leave_plan_requests.memo_generated IS 'When TRUE, an initial memo was generated for the staff member upon application';
