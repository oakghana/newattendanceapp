-- ============================================================
-- HR Leave Office Permissions Update
-- Allows HR Leave Office staff full access to leave modules
-- without requiring HOD linkage
-- ============================================================

-- 1. Update RLS policies on leave_plan_requests to allow HR Leave Office to create requests
DROP POLICY IF EXISTS "Users can create their own leave requests" ON public.leave_plan_requests;
CREATE POLICY "Users can create their own leave requests"
ON public.leave_plan_requests FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'hr_leave_office')
  )
);

-- 2. Update RLS policies on leave_plan_requests to allow HR Leave Office full read/write
DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_plan_requests;
CREATE POLICY "Users can view their own leave requests"
ON public.leave_plan_requests FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'regional_manager', 'department_head', 'hr_leave_office')
  )
);

-- 3. Allow HR Leave Office to approve/update leave requests in their workflow
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

-- 4. Update RLS for stagger requests too
DROP POLICY IF EXISTS "Users can create stagger requests" ON public.leave_plan_stagger_requests;
CREATE POLICY "Users can create stagger requests"
ON public.leave_plan_stagger_requests FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'hr_leave_office')
  )
);

DROP POLICY IF EXISTS "Users can view their own stagger requests" ON public.leave_plan_stagger_requests;
CREATE POLICY "Users can view their own stagger requests"
ON public.leave_plan_stagger_requests FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'regional_manager', 'department_head', 'hr_leave_office')
  )
);

-- 5. Add comment documenting HR Leave Office full access
COMMENT ON TABLE public.leave_plan_requests IS 'Leave plan requests with 4-stage workflow: Staff → HOD → HR Leave Office → HR Approver. HR Leave Office staff have full permissions and do not require HOD linkage.';
