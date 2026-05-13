#!/bin/bash
# Setup Script: Add Missing Roles to Staff Management Module
# This script sets up Loan Admin role and other administrative roles in the Supabase database
# Usage: bash scripts/setup-roles.sh

set -e

echo "=== Staff Management Roles Setup ==="
echo ""

# Check if environment variables are set
if [ -z "$POSTGRES_URL" ]; then
    echo "Error: POSTGRES_URL environment variable not set"
    echo "Please set your database connection URL"
    exit 1
fi

echo "Connecting to Supabase database..."
echo ""

# Execute the migration script
psql "$POSTGRES_URL" << 'EOF'
-- Migration: Add Missing Roles to Staff Management
-- Description: Add "loan_office_admin" and other administrative roles to the roles table
-- This script is idempotent and safe to run multiple times

BEGIN;

-- Insert new roles if they don't already exist
INSERT INTO public.roles (id, name, display_name, description, is_active, is_system, created_at, updated_at, permissions, location_access, department_access)
VALUES 
  (gen_random_uuid(), 'loan_office_admin', 'Loan Office Admin', 'Administrator for loan office operations and staff management', true, false, NOW(), NOW(), 
   jsonb_build_object(
     'can_manage_loans', true,
     'can_manage_staff', true,
     'can_approve_loans', false,
     'can_view_analytics', true
   ), NULL, NULL)
ON CONFLICT (name) DO UPDATE
SET 
  display_name = 'Loan Office Admin',
  description = 'Administrator for loan office operations and staff management',
  updated_at = NOW();

-- Verify the roles were created/updated
SELECT id, name, display_name, is_active, created_at, updated_at 
FROM public.roles 
WHERE name = 'loan_office_admin';

COMMIT;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Successfully added Loan Office Admin role"
    echo "✓ Role is now available in Staff Management dropdown"
    echo ""
    echo "Next steps:"
    echo "1. Restart your application: npm run dev"
    echo "2. Navigate to Staff Management module"
    echo "3. When adding staff, 'Loan Office Admin' will appear in role dropdown"
else
    echo "Error: Failed to add roles to database"
    exit 1
fi
