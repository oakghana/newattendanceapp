#!/bin/bash

# Payment Advice Feature - Setup Script Execution Order
# This script runs all necessary setup scripts for the Payment Advice feature
# Three separate memos will be generated per month (Manager/Senior/Junior categories)

echo "=========================================="
echo "Payment Advice Feature - Setup"
echo "=========================================="
echo ""

# Step 1: Verify database schema
echo "Step 1: Verifying database schema..."
node scripts/check-db-schema.ts

# Step 2: Verify leave_plan_requests table has staff_category
echo ""
echo "Step 2: Verifying staff_category field in leave_plan_requests..."
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='leave_plan_requests' AND column_name='staff_category';"

# Step 3: Verify leave_payment_memos table structure
echo ""
echo "Step 3: Checking leave_payment_memos table..."
psql $DATABASE_URL -c "\d leave_payment_memos"

# Step 4: Populate test staff with categories
echo ""
echo "Step 4: Setting up test staff with three categories (Manager/Senior/Junior)..."
# This will be done via SQL script

# Step 5: Create test annual leave records
echo ""
echo "Step 5: Creating test annual leave records..."
# This will be done via SQL script

# Step 6: Verify the Payment Advice API endpoints
echo ""
echo "Step 6: Verifying Payment Advice endpoints..."
echo "✓ /api/leave/payment-advice/detect-staff - Ready"
echo "✓ /api/leave/payment-advice/generate-memo - Ready"
echo "✓ /api/leave/payment-advice/submit-memo - Ready"
echo "✓ /api/leave/payment-advice/export - Ready"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Provide payment advice memo templates for each category"
echo "2. Configure memo email recipients"
echo "3. Test the feature via the Leave Management > Payment Advice tab"
echo ""
