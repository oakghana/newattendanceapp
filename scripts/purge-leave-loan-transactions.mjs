#!/usr/bin/env node

/**
 * Purge all leave and loan transactions from the database
 * 
 * Usage: node scripts/purge-leave-loan-transactions.mjs
 * 
 * This script:
 * - Only deletes from leave and loan related tables
 * - Does NOT affect auth, user profiles, or attendance tables
 * - Requires explicit confirmation before deletion
 * - Logs all actions for audit trail
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as readline from 'readline'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    '❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required'
  )
  process.exit(1)
}

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

// Tables to delete (in order of dependencies)
const LEAVE_TABLES = [
  'leave_notifications',
  'leave_archive_log',
  'leave_payment_memos',
  'leave_balance_transactions',
  'leave_plan_stagger_reviews',
  'leave_plan_stagger_requests',
  'leave_plan_reviews',
  'leave_deferment_requests',
  'leave_recall_requests',
  'leave_plan_requests',
  'leave_requests',
  'leave_status',
  'leave_change_proposals',
  'leave_office_work_log',
  'outstanding_leave_balances',
  'regional_leave_reports',
]

const LOAN_TABLES = [
  'loan_request_timeline',
  'loan_applications',
  'loan_requests',
  'loan_hod_linkages',
  'regional_loan_office_locations',
]

const ALL_TABLES = [...LEAVE_TABLES, ...LOAN_TABLES]

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer)
    })
  })
}

async function getTableCounts() {
  console.log('\n📊 Fetching current record counts...')
  const counts = {}

  for (const table of ALL_TABLES) {
    try {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (error) {
        console.warn(`   ⚠️  Could not count ${table}: ${error.message}`)
        counts[table] = 'unknown'
      } else {
        counts[table] = count || 0
      }
    } catch (err) {
      counts[table] = 'unknown'
    }
  }

  return counts
}

async function deleteTable(table) {
  try {
    const { error } = await admin.from(table).delete().neq('id', '')

    if (error) {
      console.warn(`   ❌ Error deleting from ${table}: ${error.message}`)
      return false
    }

    console.log(`   ✅ Deleted all records from ${table}`)
    return true
  } catch (err) {
    console.warn(`   ❌ Exception in ${table}: ${err.message}`)
    return false
  }
}

async function main() {
  console.log('🔒 Leave & Loan Transaction Purge Utility')
  console.log('==========================================\n')

  console.log('⚠️  WARNING: This will DELETE ALL leave and loan transactions.')
  console.log('   This action CANNOT be undone.')
  console.log('   Only auth, user profiles, and attendance data will remain.\n')

  // Get current counts
  const counts = await getTableCounts()

  console.log('\n📈 Records to be deleted:')
  let totalRecords = 0
  for (const table of ALL_TABLES) {
    const count = counts[table]
    const display = count === 'unknown' ? '?' : count
    console.log(`   ${table}: ${display}`)
    if (count !== 'unknown') totalRecords += count
  }

  console.log(`\n   TOTAL RECORDS TO DELETE: ${totalRecords}\n`)

  // Ask for confirmation
  const confirm1 = await question(
    '❓ Do you want to proceed? (type "yes" to confirm): '
  )
  if (confirm1.toLowerCase() !== 'yes') {
    console.log('✋ Deletion cancelled.')
    rl.close()
    process.exit(0)
  }

  const confirm2 = await question(
    '❓ Are you absolutely sure? This cannot be undone (type "DELETE ALL" to confirm): '
  )
  if (confirm2 !== 'DELETE ALL') {
    console.log('✋ Deletion cancelled.')
    rl.close()
    process.exit(0)
  }

  rl.close()

  // Start deletion
  console.log('\n🗑️  Starting deletion...\n')

  const startTime = Date.now()
  const results = {}

  console.log('📋 Deleting LEAVE tables:')
  for (const table of LEAVE_TABLES) {
    results[table] = await deleteTable(table)
  }

  console.log('\n📋 Deleting LOAN tables:')
  for (const table of LOAN_TABLES) {
    results[table] = await deleteTable(table)
  }

  // Summary
  const successful = Object.values(results).filter((v) => v).length
  const failed = Object.values(results).filter((v) => !v).length
  const duration = Date.now() - startTime

  console.log('\n==========================================')
  console.log('✅ Purge Complete!')
  console.log(`   Tables cleared: ${successful}`)
  if (failed > 0) {
    console.log(`   Tables with issues: ${failed}`)
  }
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`)
  console.log(`   Timestamp: ${new Date().toISOString()}`)

  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    action: 'purge_leave_loan_transactions',
    tablesCleared: successful,
    tablesWithIssues: failed,
    duration: `${(duration / 1000).toFixed(2)}s`,
    results,
  }

  const logFile = 'purge-audit.log'
  fs.appendFileSync(logFile, JSON.stringify(logEntry, null, 2) + '\n\n')
  console.log(`\n📝 Action logged to ${logFile}`)
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message)
  process.exit(1)
})
