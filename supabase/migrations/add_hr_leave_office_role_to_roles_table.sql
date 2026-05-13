-- Migration: Add HR Leave Office Role
-- Description: Create the HR Leave Office role with leave administration permissions
-- Date: 2025-05-13
-- Purpose: Allow HR Leave Office users to manage leave administration without policy/holiday access

INSERT INTO roles (id, name, display_name, description, is_active, is_system, created_at, updated_at, permissions, location_access, department_access)
VALUES (
  gen_random_uuid(), 
  'hr_leave_office', 
  'HR Leave Office', 
  'HR Leave Office staff managing leave administration and leave planning. Has all leave admin capabilities except holiday and leave policy management.',
  true, 
  false, 
  NOW(), 
  NOW(),
  jsonb_build_object(
    'can_manage_leaves', true,
    'can_manage_leave_planning', true,
    'can_approve_leaves', true,
    'can_view_analytics', true,
    'can_manage_holiday', false,
    'can_manage_leave_policy', false,
    'can_manage_staff', false,
    'can_view_staff', true,
    'can_adjust_leave_dates', true,
    'can_view_reports', true
  ), 
  NULL, 
  NULL
)
ON CONFLICT (name) DO NOTHING;

-- Verify the role was created
SELECT id, name, display_name, is_active, permissions 
FROM roles 
WHERE name = 'hr_leave_office';
