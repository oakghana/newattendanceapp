-- Migration: Grant proper permissions on leave_policy_catalog table
-- Required so authenticated users can read and admins can write via service role
-- Date: 2026-05-02

-- Grant SELECT to anon and authenticated roles (needed for GET /api/leave/policy)
GRANT SELECT ON public.leave_policy_catalog TO anon;
GRANT SELECT ON public.leave_policy_catalog TO authenticated;

-- Grant INSERT, UPDATE, DELETE to authenticated role
-- (API route already checks role before allowing writes)
GRANT INSERT, UPDATE, DELETE ON public.leave_policy_catalog TO authenticated;

-- Also grant service_role full access
GRANT ALL ON public.leave_policy_catalog TO service_role;
