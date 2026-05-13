#!/bin/bash

# Migration Script: Update Leave Types and Date Formats
# 
# This script updates:
# 1. Database leave_type_labels: "Unpaid Leave" → "Leave Without Pay"
# 2. Date format: Changed to dd/mm/yyyy in frontend
# 3. Labels: "Return to work" → "Resumption date"
#
# Usage: bash scripts/migrate-leave-dates.sh

set -e

echo "🔄 Leave Type and Date Format Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this script from project root."
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found. Please install Node.js first."
    exit 1
fi

# Check for .env.local
if [ ! -f ".env.local" ]; then
    echo "⚠️  Warning: .env.local not found. Database migration may fail."
    echo "   Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    echo ""
fi

echo "📝 Migration Details:"
echo "   1. Leave Type Updates:"
echo "      • unpaid → 'Leave Without Pay'"
echo "      • special → 'Special Leave' (no change)"
echo ""
echo "   2. Date Format Changes:"
echo "      • Changed to dd/mm/yyyy format"
echo "      • Updated functions: fmtLongDate, fmtFormalDate, fmtFormalDateWithWeekday"
echo ""
echo "   3. Label Changes:"
echo "      • 'Return to work' → 'Resumption date'"
echo ""

# Run Node.js migration script
echo "🚀 Running database migration..."
node scripts/migrate-leave-dates.js

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Migration script failed. Please check errors above."
    exit 1
fi

echo ""
echo "✨ Code Changes Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Files Modified:"
echo "  ✅ app/dashboard/leave-management/hr-leave-analytics-panel.tsx"
echo "  ✅ app/dashboard/leave-planning/leave-planning-client.tsx"
echo "  ✅ app/dashboard/leave/deferment-recall/page.tsx"
echo ""
echo "Files Created:"
echo "  ✅ supabase/migrations/update_leave_type_labels.sql"
echo "  ✅ scripts/migrate-leave-dates.js"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Migration completed!"
echo ""
echo "Next Steps:"
echo "1. Restart dev server:        npm run dev"
echo "2. Clear browser cache:       Ctrl+Shift+R"
echo "3. Test Leave Management:     /dashboard/leave-management"
echo "4. Verify date format:        Should show dd/mm/yyyy"
echo "5. Check Resumption date:     In leave interfaces"
echo ""
echo "For production deployment:"
echo "  • Run: npx supabase migration up"
echo "  • Or manually run: supabase/migrations/update_leave_type_labels.sql"
echo ""
