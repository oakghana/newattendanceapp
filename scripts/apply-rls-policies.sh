#!/bin/bash
# Script to apply RLS policies for deferment and recall requests in Supabase
# Run this with: npx supabase db push

echo "Applying RLS policies for deferment and recall requests..."

# Source environment variables
if [ -f .env.local ]; then
  source .env.local
fi

# Check if SUPABASE_URL and SUPABASE_SERVICE_KEY are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required"
  exit 1
fi

# Apply the migration using Supabase CLI
echo "Pushing migration to Supabase..."
npx supabase db push

echo "RLS policies applied successfully!"
echo ""
echo "Summary of changes:"
echo "- Enabled RLS on leave_deferment_requests table"
echo "- Enabled RLS on leave_recall_requests table"
echo "- Added policy: Allow HOD/RM/HR Office deferment CRUD"
echo "- Added policy: Allow HOD/RM/HR Office recall CRUD"
echo "- Added policy: Allow staff to read own deferment requests"
echo "- Added policy: Allow staff to read own recall requests"
echo ""
echo "Users with these roles can now perform all CRUD operations:"
echo "  - department_head (HOD)"
echo "  - regional_manager (RM)"
echo "  - hr_leave_office (HR Leave Office)"
echo "  - admin"
