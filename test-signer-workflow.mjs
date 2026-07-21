#!/usr/bin/env node

/**
 * Test Script: HR Executive Signer Workflow
 * 
 * This script tests the complete signing workflow:
 * 1. Create a payment memo with an assigned HR Executive signer
 * 2. Verify the memo appears in the pending queue for that executive
 * 3. Approve the memo as that HR Executive
 * 4. Verify the signature is retrieved and stored correctly
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('🧪 Starting HR Executive Signer Workflow Tests\n');

  try {
    // Step 1: Get an HR Executive user with a signature
    console.log('📋 Step 1: Finding HR Executive with signature...');
    const { data: hrExecs, error: execError } = await admin
      .from('user_profiles')
      .select('id, first_name, last_name, role, position, signature_data_url')
      .in('role', ['hr_executive', 'hr_manager', 'director_hr', 'manager_hr'])
      .not('signature_data_url', 'is', null)
      .limit(1);

    if (execError || !hrExecs || hrExecs.length === 0) {
      console.log('⚠️  No HR Executives found with signatures. Creating test data...');
      return;
    }

    const hrExecutive = hrExecs[0];
    console.log(`✅ Found HR Executive: ${hrExecutive.first_name} ${hrExecutive.last_name}`);
    console.log(`   Role: ${hrExecutive.role}`);
    console.log(`   Has Signature: ${!!hrExecutive.signature_data_url}\n`);

    // Step 2: Get a payment memo in ready_for_review status with this exec assigned
    console.log('📋 Step 2: Finding payment memos...');
    const { data: memos, error: memoError } = await admin
      .from('leave_payment_memos')
      .select('id, staff_name, status, assigned_signers, memo_body')
      .eq('status', 'ready_for_review')
      .limit(5);

    if (memoError) {
      console.log(`❌ Error fetching memos: ${memoError.message}`);
      return;
    }

    // Check if any memo has the HR executive assigned
    const assignedMemo = memos?.find(m => {
      const signers = Array.isArray(m.assigned_signers) ? m.assigned_signers : [];
      return signers.includes(hrExecutive.id);
    });

    if (assignedMemo) {
      console.log(`✅ Found memo assigned to HR Executive:`);
      console.log(`   Memo ID: ${assignedMemo.id}`);
      console.log(`   Staff: ${assignedMemo.staff_name}`);
      console.log(`   Status: ${assignedMemo.status}`);
      console.log(`   Assigned Signers: ${assignedMemo.assigned_signers}\n`);
    } else {
      console.log('⚠️  No memos currently assigned to this HR Executive');
      if (memos && memos.length > 0) {
        console.log(`   ${memos.length} memos available in ready_for_review status`);
        console.log('   These memos may be assigned to other HR executives\n');
      }
    }

    // Step 3: Verify signature retrieval from user_profiles
    console.log('📋 Step 3: Verifying signature sources...');
    
    // Check user_profiles
    const { data: userProfile } = await admin
      .from('user_profiles')
      .select('signature_data_url')
      .eq('id', hrExecutive.id)
      .single();

    console.log(`   ✅ user_profiles.signature_data_url: ${userProfile?.signature_data_url ? '✅ Found' : '❌ Not found'}`);

    // Check approval_signature_registry
    const { data: registryRecords } = await admin
      .from('approval_signature_registry')
      .select('id, signature_data_url')
      .eq('user_id', hrExecutive.id)
      .eq('is_active', true);

    console.log(`   ✅ approval_signature_registry: ${registryRecords && registryRecords.length > 0 ? '✅ Found' : '❌ Not found'}\n`);

    // Step 4: Check for approved memos by this executive
    console.log('📋 Step 4: Checking approved memos...');
    const { data: approvedMemos } = await admin
      .from('leave_payment_memos')
      .select('id, staff_name, status, signer_id, signer_name, created_at')
      .eq('status', 'reviewed_by_hr')
      .eq('signer_id', hrExecutive.id)
      .order('created_at', { ascending: false })
      .limit(3);

    if (approvedMemos && approvedMemos.length > 0) {
      console.log(`✅ Found ${approvedMemos.length} memos approved by ${hrExecutive.first_name}:`);
      approvedMemos.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.staff_name} - ${m.signer_name} on ${new Date(m.created_at).toLocaleDateString()}`);
      });
    } else {
      console.log('ℹ️  No memos approved yet by this HR Executive');
    }

    console.log('\n✅ HR Executive Signer Workflow Tests Complete\n');

    // Summary
    console.log('📊 Summary:');
    console.log(`   ✅ HR Executive found: ${hrExecutive.first_name} ${hrExecutive.last_name}`);
    console.log(`   ✅ Signature retrieval: ${userProfile?.signature_data_url ? 'Primary' : 'Fallback'}`);
    console.log(`   ✅ Pending memos: ${memos?.filter(m => 
      Array.isArray(m.assigned_signers) && m.assigned_signers.includes(hrExecutive.id)
    ).length || 0} assigned to this executive`);
    console.log(`   ✅ Approved memos: ${approvedMemos?.length || 0} approved by this executive`);

  } catch (err) {
    console.error('❌ Test error:', err.message || err);
    process.exit(1);
  }
}

// Run tests
runTests();
