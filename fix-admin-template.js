#!/usr/bin/env node

/**
 * Quick Admin Menu Access Fixer
 * 
 * This script normalizes admin user roles to lowercase "admin"
 * to enable access to:
 * - Memo Console
 * - Disbursement Confirmation
 * 
 * Usage: node fix-admin-template.js
 * 
 * Make sure .env.development.local has:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 */

require('dotenv').config({ path: '.env.development.local' });

// Manual Supabase configuration if .env file doesn't work
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY_HERE';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
  console.error('❌ Error: SUPABASE_URL not configured');
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env.development.local');
  process.exit(1);
}

// Dynamic import for ES modules
(async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║        Admin Menu Access Fix - Quick Fixer                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Step 1: View current admins
    console.log('🔍 Step 1: Checking current admin users...\n');
    
    const { data: currentAdmins, error: viewError } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .ilike('role', '%admin%');

    if (viewError) {
      console.error('❌ Error fetching users:', viewError.message);
      process.exit(1);
    }

    console.log(`Found ${currentAdmins.length} users with admin-related roles:\n`);
    currentAdmins.forEach(admin => {
      const status = admin.role === 'admin' ? '✓' : '⚠';
      console.log(`  ${status} ${admin.email} → role: "${admin.role}"`);
    });

    // Step 2: Normalize roles
    console.log('\n📝 Step 2: Normalizing admin roles...\n');
    
    const needsUpdate = currentAdmins.filter(a => a.role !== 'admin');
    
    if (needsUpdate.length === 0) {
      console.log('✓ All admin roles are already normalized to "admin"');
      console.log('\n✅ Admin access should be working!');
      console.log('   If users still can\'t access the menus:');
      console.log('   1. Clear browser cache');
      console.log('   2. Restart dev server: npm run dev');
      console.log('   3. Log out and log back in\n');
      process.exit(0);
    }

    console.log(`Updating ${needsUpdate.length} user(s)...\n`);

    // Update each user individually for better feedback
    for (const admin of needsUpdate) {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ role: 'admin' })
        .eq('id', admin.id);

      if (updateError) {
        console.error(`  ❌ Failed to update ${admin.email}:`, updateError.message);
      } else {
        console.log(`  ✓ Updated ${admin.email}: "${admin.role}" → "admin"`);
      }
    }

    // Step 3: Verify
    console.log('\n✅ Step 3: Verifying changes...\n');
    
    const { data: verifyAdmins, error: verifyError } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .eq('role', 'admin');

    if (verifyError) {
      console.error('❌ Error verifying:', verifyError.message);
      process.exit(1);
    }

    console.log(`Admin users after fix (${verifyAdmins.length} total):\n`);
    verifyAdmins.forEach(admin => {
      console.log(`  ✓ ${admin.email}`);
    });

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   ✅ FIX COMPLETE!                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Admin users can now access:');
    console.log('   • Memo Console (/dashboard/secretary-memos)');
    console.log('   • Disbursement Confirmation (/dashboard/disbursement-confirmation)\n');

    console.log('⚡ To activate changes:');
    console.log('   1. Clear browser cache (Ctrl+Shift+Delete)');
    console.log('   2. Restart dev server: npm run dev');
    console.log('   3. Refresh the page in browser');
    console.log('   4. Log out and log back in if needed\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure Supabase client is installed:');
    console.error('  npm install @supabase/supabase-js\n');
    process.exit(1);
  }
})();
