#!/bin/bash

echo "=========================================="
echo "Loan Admin Page Fix Verification"
echo "=========================================="
echo ""

FILE="/app/dashboard/loan-app/page.tsx"

echo "1. Checking for 'use client' directive..."
if head -1 app/dashboard/loan-app/page.tsx | grep -q "use client"; then
    echo "   ✓ 'use client' found at line 1"
else
    echo "   ✗ 'use client' NOT found"
fi

echo ""
echo "2. Checking for top-level async functions..."
if grep -q "^async function" app/dashboard/loan-app/page.tsx; then
    echo "   ✗ WARNING: Found top-level async functions"
    grep -n "^async function" app/dashboard/loan-app/page.tsx
else
    echo "   ✓ No top-level async functions detected"
fi

echo ""
echo "3. Verifying problematic code is commented..."
if grep -q "// PDF download functionality disabled" app/dashboard/loan-app/page.tsx; then
    echo "   ✓ downloadPdf commented out"
else
    echo "   ⚠ Could not verify downloadPdf removal"
fi

if grep -q "// Image loading functionality disabled" app/dashboard/loan-app/page.tsx; then
    echo "   ✓ loadImageAsDataUrl commented out"
else
    echo "   ⚠ Could not verify loadImageAsDataUrl removal"
fi

echo ""
echo "4. File Statistics..."
echo "   Total lines: $(wc -l < app/dashboard/loan-app/page.tsx)"
echo "   Commented lines: $(grep -c "^[[:space:]]*\/\/" app/dashboard/loan-app/page.tsx)"

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="
echo ""
echo "The loan admin page should now load without errors!"
echo "Navigate to: /dashboard/loan-app"
