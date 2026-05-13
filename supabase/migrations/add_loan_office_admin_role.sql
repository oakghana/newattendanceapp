-- Add loan_office_admin role to the roles table
INSERT INTO roles (name, display_name, description, is_system, is_active, permissions, created_at, updated_at)
VALUES (
  'loan_office_admin',
  'Loan Office Admin',
  'Administrator for loan office with full access to loan processing and setup functions, plus admin configuration tabs',
  true,
  true,
  jsonb_build_object(
    'loanOffice', true,
    'allLoans', true,
    'viewAllTabs', false,
    'comment', 'Loan Office Administrator - Full loan processing access with admin setup capabilities'
  ),
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  permissions = EXCLUDED.permissions,
  updated_at = NOW();

-- Ensure loan_office role exists with proper permissions
INSERT INTO roles (name, display_name, description, is_system, is_active, permissions, created_at, updated_at)
VALUES (
  'loan_office',
  'Loan Office',
  'Loan office staff with access to loan processing workflow, excluding admin setup functions',
  true,
  true,
  jsonb_build_object(
    'loanOffice', true,
    'allLoans', true,
    'viewAllTabs', false,
    'comment', 'Loan Office Staff - Basic loan processing access without admin functions'
  ),
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  permissions = EXCLUDED.permissions,
  updated_at = NOW();
