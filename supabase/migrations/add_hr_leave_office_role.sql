-- Migration: Add HR Leave Office Role to Database
-- Description: Creates the hr_leave_office role with appropriate permissions
-- Created: 2025-05-13
-- Status: Ready for execution

-- Insert HR Leave Office role
INSERT INTO public.roles (
  id, 
  name, 
  display_name, 
  description, 
  is_active, 
  is_system, 
  created_at, 
  updated_at,
  permissions,
  location_access,
  department_access
)
VALUES (
  gen_random_uuid(),
  'hr_leave_office',
  'HR Leave Office',
  'HR Leave Office staff - manages leave requests and planning with restricted access to policy and holiday configuration',
  true,
  true,
  NOW(),
  NOW(),
  jsonb_build_object(
    'can_manage_leave_requests', true,
    'can_approve_leave_requests', true,
    'can_view_leave_analytics', true,
    'can_adjust_leave_dates', true,
    'can_manage_leave_planning', true,
    'can_view_balances', true,
    'can_manage_deferment_recall', true,
    'can_manage_holidays', false,
    'can_configure_leave_policies', false,
    'can_view_staff', true
  ),
  NULL,
  NULL
)
ON CONFLICT (name) DO NOTHING;

-- Verify the role was created
SELECT id, name, display_name, is_active, permissions 
FROM public.roles 
WHERE name = 'hr_leave_office';
