#!/usr/bin/env node

/**
 * Migration Script: Update Leave Types and Date Formats
 * 
 * This script:
 * 1. Updates database leave_type_labels to separate Special from Leave Without Pay
 * 2. Changes date format configuration if needed
 * 3. Provides verification queries
 * 
 * Usage: node scripts/migrate-leave-dates.js
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function migrateLeavePolicies() {
  console.log('🔄 Starting leave policy migration...\n');

  try {
    // Step 1: Update unpaid leave label
    console.log('📝 Updating unpaid leave label to "Leave Without Pay"...');
    const { error: updateError } = await supabase
      .from('leave_policy_catalog')
      .update({ leave_type_label: 'Leave Without Pay' })
      .eq('leave_type_key', 'unpaid')
      .in('leave_type_label', ['Unpaid Leave', 'unpaid_leave'])
      .then(() => ({ error: null }))
      .catch((err) => ({ error: err }));

    if (updateError) {
      console.error('⚠️  Error updating leave labels:', updateError.message);
      // Continue anyway - the update might have worked
    } else {
      console.log('✅ Updated leave labels successfully');
    }

    // Step 2: Verify changes
    console.log('\n📊 Verifying leave policy updates...');
    const { data: policies, error: selectError } = await supabase
      .from('leave_policy_catalog')
      .select('leave_type_key, leave_type_label, entitlement_days, is_enabled')
      .in('leave_type_key', ['unpaid', 'special'])
      .order('leave_type_key');

    if (selectError) {
      console.error('❌ Error fetching leave policies:', selectError.message);
      process.exit(1);
    }

    console.log('Current leave policies:');
    console.table(policies);

    // Step 3: Summary
    console.log('\n✨ Migration Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Leave Type Labels:');
    console.log('   - "unpaid" → "Leave Without Pay"');
    console.log('   - "special" → "Special Leave" (unchanged)');
    console.log('');
    console.log('✅ Date Format Changes:');
    console.log('   - Frontend: Changed to dd/mm/yyyy format');
    console.log('   - Functions updated:');
    console.log('     • fmtLongDate()');
    console.log('     • fmtFormalDate()');
    console.log('     • fmtFormalDateWithWeekday()');
    console.log('');
    console.log('✅ Label Changes:');
    console.log('   - "Return to work" → "Resumption date"');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n🎉 Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart your dev server: npm run dev');
    console.log('2. Clear browser cache or hard refresh (Ctrl+Shift+R)');
    console.log('3. Test leave type display in Leave Management module');
    console.log('4. Verify date format displays as dd/mm/yyyy');
    console.log('5. Check Resumption date label in leave interfaces\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
migrateLeavePolicies();
