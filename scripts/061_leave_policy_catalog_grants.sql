-- Migration: Enable RLS + grant permissions on leave_policy_catalog table
-- Required so authenticated HR/admin users can read and write leave policy rows
-- Date: 2026-05-02

-- Ensure RLS is enabled
ALTER TABLE public.leave_policy_catalog ENABLE ROW LEVEL SECURITY;

-- Grant table-level permissions
GRANT SELECT ON public.leave_policy_catalog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_policy_catalog TO authenticated;
GRANT ALL ON public.leave_policy_catalog TO service_role;

-- Allow anyone (anon/authenticated) to read leave policy rows
DROP POLICY IF EXISTS "leave_policy_catalog_select" ON public.leave_policy_catalog;
CREATE POLICY "leave_policy_catalog_select"
  ON public.leave_policy_catalog FOR SELECT
  USING (true);

-- Allow authenticated users whose role is admin, hr_leave_office, or hr_office to insert
DROP POLICY IF EXISTS "leave_policy_catalog_insert" ON public.leave_policy_catalog;
CREATE POLICY "leave_policy_catalog_insert"
  ON public.leave_policy_catalog FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'hr_leave_office', 'hr_office')
    )
  );

-- Allow same roles to update
DROP POLICY IF EXISTS "leave_policy_catalog_update" ON public.leave_policy_catalog;
CREATE POLICY "leave_policy_catalog_update"
  ON public.leave_policy_catalog FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'hr_leave_office', 'hr_office')
    )
  );

-- Allow same roles to delete
DROP POLICY IF EXISTS "leave_policy_catalog_delete" ON public.leave_policy_catalog;
CREATE POLICY "leave_policy_catalog_delete"
  ON public.leave_policy_catalog FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'hr_leave_office', 'hr_office')
    )
  );
