-- Migration: Add Missing Roles to Staff Management
-- Description: Add "loan_office_admin" and other administrative roles to the roles table
-- Status: Ready for execution

-- Insert new roles if they don't already exist
INSERT INTO roles (id, name, display_name, description, is_active, is_system, created_at, updated_at, permissions, location_access, department_access)
VALUES 
  -- Loan Office Admin Role
  (gen_random_uuid(), 'loan_office_admin', 'Loan Office Admin', 'Administrator for loan office operations and staff management', true, false, NOW(), NOW(), 
   jsonb_build_object(
     'can_manage_loans', true,
     'can_manage_staff', true,
     'can_approve_loans', false,
     'can_view_analytics', true
   ), NULL, NULL),
  
  -- HR Office Role (if not exists)
  (gen_random_uuid(), 'hr_office', 'HR Office', 'HR Office staff managing leave office operations', true, false, NOW(), NOW(),
   jsonb_build_object(
     'can_manage_leaves', true,
     'can_adjust_leave_dates', true,
     'can_approve_leaves', false,
     'can_view_staff', true
   ), NULL, NULL),
   
  -- Regional HR Leave Role (if not exists)
  (gen_random_uuid(), 'regional_hr_leave', 'Regional HR Leave', 'Regional HR Leave administrator', true, false, NOW(), NOW(),
   jsonb_build_object(
     'can_manage_regional_leaves', true,
     'can_view_analytics', true,
     'can_approve_leaves', false
   ), NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- Optional: Update existing role descriptions and permissions if needed
UPDATE roles 
SET 
  display_name = 'Loan Office Admin',
  description = 'Administrator for loan office operations and staff management',
  permissions = jsonb_build_object(
    'can_manage_loans', true,
    'can_manage_staff', true,
    'can_approve_loans', false,
    'can_view_analytics', true
  ),
  updated_at = NOW()
WHERE name = 'loan_office_admin';

-- Verify the roles were created
SELECT id, name, display_name, is_active FROM roles WHERE name IN ('loan_office_admin', 'hr_office', 'regional_hr_leave') ORDER BY name;
