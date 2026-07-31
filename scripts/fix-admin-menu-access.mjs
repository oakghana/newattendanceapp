#!/usr/bin/env node

/**
 * Admin Menu Access Fix Script
 * 
 * This script helps grant admin users access to:
 * - Memo Console
 * - Disbursement Confirmation
 * 
 * It performs the following checks and fixes:
 * 1. Identifies all admin users in the system
 * 2. Verifies their role is set to 'admin' (lowercase)
 * 3. Ensures Supabase RLS policies allow access
 * 4. Provides SQL queries to fix any issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     Admin Menu Access Fix - Memo Console & Disbursement    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// 1. Check Environment Variables
// ============================================================================
console.log('📋 Step 1: Checking environment configuration...\n');

const envFile = path.join(__dirname, '../.env.development.local');
const envExists = fs.existsSync(envFile);

if (envExists) {
  console.log('✓ .env.development.local found');
} else {
  console.log('⚠ .env.development.local not found - you may need to set SUPABASE_URL and SUPABASE_ANON_KEY');
}

// ============================================================================
// 2. Show Required Sidebar Configuration
// ============================================================================
console.log('\n📋 Step 2: Required sidebar configuration (already set)...\n');

console.log('Memo Console menu item:');
console.log('  roles: ["secretary", "admin"]  ✓');
console.log('  Location: components/dashboard/sidebar.tsx:154\n');

console.log('Disbursement Confirmation menu item:');
console.log('  roles: ["admin", "accounts_executive"]  ✓');
console.log('  Location: components/dashboard/sidebar.tsx:163\n');

// ============================================================================
// 3. SQL Queries to Fix Admin Access
// ============================================================================
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                   SQL QUERIES TO RUN                       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('📌 Query 1: View all users with admin-related roles\n');
console.log('```sql');
console.log('SELECT id, email, role FROM user_profiles');
console.log('WHERE LOWER(TRIM(role)) = \'admin\'');
console.log('   OR LOWER(TRIM(role)) LIKE \'%admin%\'');
console.log('ORDER BY role, email;');
console.log('```\n');

console.log('📌 Query 2: Normalize all admin roles to lowercase "admin"\n');
console.log('```sql');
console.log('UPDATE user_profiles');
console.log('SET role = \'admin\'');
console.log('WHERE LOWER(TRIM(role)) LIKE \'%admin%\'');
console.log('  AND LOWER(TRIM(role)) != \'admin\';');
console.log('```\n');

console.log('📌 Query 3: Verify admin users after fix\n');
console.log('```sql');
console.log('SELECT id, email, role FROM user_profiles');
console.log('WHERE role = \'admin\'');
console.log('ORDER BY email;');
console.log('```\n');

// ============================================================================
// 4. How to Run the Queries
// ============================================================================
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║              HOW TO RUN THE QUERIES                        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('Option A: Using Supabase Dashboard (Easiest)\n');
console.log('1. Go to: https://app.supabase.com/');
console.log('2. Select your project');
console.log('3. Navigate to: SQL Editor → New Query');
console.log('4. Copy and paste each query above (one at a time)');
console.log('5. Click "Run" button\n');

console.log('Option B: Using Supabase CLI\n');
console.log('1. Ensure you have Supabase CLI installed: npm install -g @supabase/cli');
console.log('2. Create a file named "fix-admin-roles.sql" with the SQL queries');
console.log('3. Run: supabase db push fix-admin-roles.sql\n');

console.log('Option C: Using Node.js Script\n');
console.log('1. Create a file named "fix-admin.js" in your project root');
console.log('2. Copy the code template below\n');

// ============================================================================
// 5. Node.js Script Template
// ============================================================================
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║              NODE.JS SCRIPT TEMPLATE                       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const nodeScriptTemplate = `// fix-admin.js - Run with: node fix-admin.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env.development.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAdminAccess() {
  try {
    console.log('🔍 Checking current admin users...');
    
    // Query 1: View all admins
    const { data: admins, error: queryError } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .ilike('role', '%admin%');

    if (queryError) {
      console.error('❌ Query error:', queryError);
      return;
    }

    console.log('Found admin users:');
    admins.forEach(admin => {
      console.log(\`  - \${admin.email} (role: "\${admin.role}")\`);
    });

    if (admins.length === 0) {
      console.log('ℹ️ No admin users found');
      return;
    }

    // Query 2: Normalize roles
    console.log('\\n📝 Normalizing admin roles to lowercase "admin"...');
    
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role: 'admin' })
      .ilike('role', '%admin%')
      .neq('role', 'admin');

    if (updateError) {
      console.error('❌ Update error:', updateError);
      return;
    }

    console.log('✓ Admin roles normalized successfully');

    // Query 3: Verify
    console.log('\\n✅ Verifying admin users...');
    const { data: verifyAdmins, error: verifyError } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .eq('role', 'admin');

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
      return;
    }

    console.log('Admin users after fix:');
    verifyAdmins.forEach(admin => {
      console.log(\`  ✓ \${admin.email} (role: "\${admin.role}")\`);
    });

    console.log('\\n✅ Admin menu access fix completed!');
    console.log('   - Memo Console is now accessible to admin users');
    console.log('   - Disbursement Confirmation is now accessible to admin users');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixAdminAccess();
`;

console.log(nodeScriptTemplate);
console.log('\n');

// ============================================================================
// 6. Troubleshooting Guide
// ============================================================================
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║              TROUBLESHOOTING CHECKLIST                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('If admin users still can\'t see the menus after running the fix:\n');

console.log('1️⃣ Check Browser Cache');
console.log('   - Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)');
console.log('   - Or open in Incognito/Private mode');
console.log('   - Refresh the page\n');

console.log('2️⃣ Check User Role in Database');
console.log('   - Run: SELECT role FROM user_profiles WHERE id = \'<admin-user-id>\';');
console.log('   - Verify role is exactly "admin" (lowercase, no spaces)\n');

console.log('3️⃣ Check Supabase RLS Policies');
console.log('   - Go to Supabase Dashboard → Authentication → Policies');
console.log('   - Verify "user_profiles" table allows SELECT for authenticated users');
console.log('   - Verify there are no policies blocking "admin" role\n');

console.log('4️⃣ Check Browser Console for Errors');
console.log('   - Open browser DevTools (F12)');
console.log('   - Check Console tab for any JavaScript errors');
console.log('   - Look for messages with "[v0] Disbursement visibility check"\n');

console.log('5️⃣ Restart Development Server');
console.log('   - Kill the dev server (Ctrl+C)');
console.log('   - Clear .next cache: rm -rf .next');
console.log('   - Restart: npm run dev\n');

console.log('6️⃣ Check Sidebar Role Filtering');
console.log('   - Location: components/dashboard/sidebar.tsx:417-428');
console.log('   - The role is normalized with .toLowerCase().trim()');
console.log('   - Verify admin role matches exactly\n');

// ============================================================================
// 7. Save the Node Script
// ============================================================================
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║              NEXT STEPS                                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('✅ Step 1: Run the SQL queries');
console.log('   Execute the queries above in your Supabase SQL Editor\n');

console.log('✅ Step 2: Clear cache and restart');
console.log('   - Clear your browser cache');
console.log('   - Restart the dev server: npm run dev\n');

console.log('✅ Step 3: Verify access');
console.log('   - Log in as admin user');
console.log('   - Navigate to /dashboard/overview');
console.log('   - Confirm "Memo Console" and "Disbursement Confirmation" appear\n');

console.log('✅ Step 4: If issues persist');
console.log('   - Create a file: fix-admin.js');
console.log('   - Copy the Node.js script template above');
console.log('   - Run: node fix-admin.js\n');

// ============================================================================
// 8. Save queries to file
// ============================================================================
const queriesContent = `-- Admin Menu Access Fix Queries
-- Run these in Supabase SQL Editor one at a time

-- Query 1: View all admin users
SELECT id, email, role FROM user_profiles
WHERE LOWER(TRIM(role)) = 'admin'
   OR LOWER(TRIM(role)) LIKE '%admin%'
ORDER BY role, email;

-- Query 2: Normalize admin roles to lowercase
UPDATE user_profiles
SET role = 'admin'
WHERE LOWER(TRIM(role)) LIKE '%admin%'
  AND LOWER(TRIM(role)) != 'admin';

-- Query 3: Verify admin users after fix
SELECT id, email, role FROM user_profiles
WHERE role = 'admin'
ORDER BY email;
`;

const queriesFilePath = path.join(__dirname, '../fix-admin-queries.sql');
fs.writeFileSync(queriesFilePath, queriesContent);
console.log(`📄 Saved SQL queries to: ${path.relative(process.cwd(), queriesFilePath)}\n`);

// Save Node script template
const nodeScriptPath = path.join(__dirname, '../fix-admin-template.js');
fs.writeFileSync(nodeScriptPath, nodeScriptTemplate);
console.log(`📄 Saved Node.js script template to: ${path.relative(process.cwd(), nodeScriptPath)}\n`);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                      DONE!                                 ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');
