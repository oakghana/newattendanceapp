#!/usr/bin/env node

/**
 * Production Health Check - Resumption Confirmation Workflow
 * Quick verification that all systems are operational
 * Run: node scripts/health-check-resumption.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey);

async function healthCheck() {
  console.log('\n🏥 PRODUCTION HEALTH CHECK - Resumption Confirmation System\n');

  const checks = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  // 1. Table existence
  console.log('1️⃣  Checking database tables...');
  try {
    for (const table of [
      'leave_resumption_notifications',
      'leave_resumption_confirmations',
      'resumption_confirmation_audit',
    ]) {
      const { error } = await admin.from(table).select('id').limit(1);
      if (error && error.message.includes('does not exist')) {
        console.log(`   ❌ ${table}: Missing`);
        checks.failed++;
      } else if (error) {
        console.log(`   ⚠️  ${table}: ${error.message}`);
        checks.warnings++;
      } else {
        console.log(`   ✓ ${table}: OK`);
        checks.passed++;
      }
    }
  } catch (err) {
    console.log(`   ❌ Error checking tables: ${err.message}`);
    checks.failed++;
  }

  // 2. Data statistics
  console.log('\n2️⃣  Checking data statistics...');
  try {
    const stats = {};

    const counts = [
      {
        table: 'leave_resumption_notifications',
        name: 'Pending Resumptions',
        filter: { status: 'pending' },
      },
      {
        table: 'leave_resumption_confirmations',
        name: 'Pending Confirmations',
        filter: { final_status: 'unconfirmed' },
      },
      {
        table: 'resumption_confirmation_audit',
        name: 'Audit Records',
      },
    ];

    for (const item of counts) {
      let query = admin.from(item.table).select('id', { count: 'exact' });

      if (item.filter) {
        for (const [key, value] of Object.entries(item.filter)) {
          query = query.eq(key, value);
        }
      }

      const { count, error } = await query;
      if (error) {
        console.log(`   ⚠️  ${item.name}: Error - ${error.message}`);
        checks.warnings++;
      } else {
        console.log(`   ✓ ${item.name}: ${count || 0} records`);
        checks.passed++;
      }
    }
  } catch (err) {
    console.log(`   ⚠️  Error checking statistics: ${err.message}`);
    checks.warnings++;
  }

  // 3. Notifications
  console.log('\n3️⃣  Checking notifications...');
  try {
    const { count, error } = await admin
      .from('staff_notifications')
      .select('id', { count: 'exact' })
      .like('notification_type', '%resumption%');

    if (error) {
      console.log(`   ⚠️  Error: ${error.message}`);
      checks.warnings++;
    } else {
      console.log(`   ✓ Resumption notifications in system: ${count || 0}`);
      checks.passed++;
    }
  } catch (err) {
    console.log(`   ⚠️  Error checking notifications: ${err.message}`);
    checks.warnings++;
  }

  // 4. Recent activity
  console.log('\n4️⃣  Checking recent activity (last 24h)...');
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recent, error } = await admin
      .from('resumption_confirmation_audit')
      .select('id, action, created_at')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log(`   ⚠️  Error: ${error.message}`);
      checks.warnings++;
    } else if (recent && recent.length > 0) {
      console.log(`   ✓ Recent confirmations: ${recent.length}`);
      for (const r of recent) {
        const date = new Date(r.created_at).toLocaleString();
        console.log(`     - ${r.action} @ ${date}`);
      }
      checks.passed++;
    } else {
      console.log(`   ℹ️  No recent confirmations in last 24h`);
      checks.passed++;
    }
  } catch (err) {
    console.log(`   ⚠️  Error checking recent activity: ${err.message}`);
    checks.warnings++;
  }

  // 5. Overdue leaves
  console.log('\n5️⃣  Checking overdue non-resumed leaves...');
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: overdue, error } = await admin
      .from('leave_resumption_notifications')
      .select('id, leave_end_date, confirmation_status, days_overdue')
      .lt('leave_end_date', today)
      .in('confirmation_status', ['unconfirmed', 'pending_hod_rm'])
      .order('leave_end_date', { ascending: true });

    if (error) {
      console.log(`   ⚠️  Error: ${error.message}`);
      checks.warnings++;
    } else if (overdue && overdue.length > 0) {
      console.log(`   ⚠️  ${overdue.length} leaves still pending verification`);
      for (const leave of overdue.slice(0, 3)) {
        console.log(
          `     - Leave end: ${leave.leave_end_date}, Overdue: ${leave.days_overdue} days, Status: ${leave.confirmation_status}`
        );
      }
      checks.warnings++;
    } else {
      console.log(`   ✓ No overdue non-resumed leaves`);
      checks.passed++;
    }
  } catch (err) {
    console.log(`   ⚠️  Error checking overdue: ${err.message}`);
    checks.warnings++;
  }

  // 6. RLS Policies
  console.log('\n6️⃣  Checking RLS policies...');
  try {
    // We can't directly check RLS, but we can verify admin access works
    const { error } = await admin
      .from('leave_resumption_notifications')
      .select('id')
      .limit(1);

    if (error) {
      console.log(`   ❌ Admin access failed: ${error.message}`);
      checks.failed++;
    } else {
      console.log(`   ✓ Admin access verified`);
      checks.passed++;
    }
  } catch (err) {
    console.log(`   ⚠️  Error checking RLS: ${err.message}`);
    checks.warnings++;
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 HEALTH CHECK SUMMARY\n');
  console.log(`  ✓ Passed:  ${checks.passed}`);
  console.log(`  ⚠️  Warnings: ${checks.warnings}`);
  console.log(`  ❌ Failed:  ${checks.failed}`);

  console.log('\n');
  if (checks.failed === 0 && checks.warnings <= 2) {
    console.log('🟢 SYSTEM STATUS: HEALTHY\n');
    return 0;
  } else if (checks.failed === 0) {
    console.log('🟡 SYSTEM STATUS: OPERATIONAL (minor warnings)\n');
    return 0;
  } else {
    console.log('🔴 SYSTEM STATUS: ISSUES DETECTED\n');
    return 1;
  }
}

healthCheck().then(code => process.exit(code));
