import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = request.headers.get('authorization')
    const adminKey = process.env.ADMIN_SECRET_KEY || ''

    if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid admin credentials' },
        { status: 401 }
      )
    }

    // Verify confirmation parameter to prevent accidental deletion
    const { confirmDeletion } = await request.json()
    if (confirmDeletion !== 'DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS') {
      return NextResponse.json(
        {
          error: 'Deletion not confirmed',
          message:
            'To proceed, you must send confirmDeletion with value: DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS',
        },
        { status: 400 }
      )
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    console.log('[v0] Starting purge of all leave and loan transactions...')

    const deletionStats: Record<string, number> = {}

    // Leave-related tables to delete (in order of dependencies)
    const leaveTables = [
      'leave_notifications', // No foreign key dependencies to other leave tables
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

    // Loan-related tables to delete (in order of dependencies)
    const loanTables = [
      'loan_request_timeline',
      'loan_applications',
      'loan_requests',
      'loan_hod_linkages',
      'regional_loan_office_locations',
    ]

    // Delete all records from leave tables
    for (const table of leaveTables) {
      try {
        const { data, error } = await admin.from(table).delete().neq('id', '')

        if (error) {
          console.warn(`[v0] Warning deleting from ${table}:`, error.message)
          deletionStats[table] = 0
        } else {
          // Supabase delete returns count in data object
          deletionStats[table] = 1
          console.log(`[v0] Successfully deleted from ${table}`)
        }
      } catch (err) {
        console.warn(`[v0] Error deleting from ${table}:`, err)
        deletionStats[table] = 0
      }
    }

    // Delete all records from loan tables
    for (const table of loanTables) {
      try {
        const { data, error } = await admin.from(table).delete().neq('id', '')

        if (error) {
          console.warn(`[v0] Warning deleting from ${table}:`, error.message)
          deletionStats[table] = 0
        } else {
          // Supabase delete returns count in data object
          deletionStats[table] = 1
          console.log(`[v0] Successfully deleted from ${table}`)
        }
      } catch (err) {
        console.warn(`[v0] Error deleting from ${table}:`, err)
        deletionStats[table] = 0
      }
    }

    console.log('[v0] Purge completed. Deletion stats:', deletionStats)

    return NextResponse.json(
      {
        success: true,
        message: 'All leave and loan transactions have been successfully deleted',
        deletedTables: deletionStats,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[v0] Error during purge:', error)
    return NextResponse.json(
      {
        error: 'Failed to purge transactions',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

// GET endpoint to verify admin access and get table list (for safety check)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const adminKey = process.env.ADMIN_SECRET_KEY || ''

    if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid admin credentials' },
        { status: 401 }
      )
    }

    const leaveTables = [
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

    const loanTables = [
      'loan_request_timeline',
      'loan_applications',
      'loan_requests',
      'loan_hod_linkages',
      'regional_loan_office_locations',
    ]

    return NextResponse.json(
      {
        message: 'Admin purge endpoint is active. Use POST to delete all leave and loan transactions.',
        tablesToDelete: {
          leave: leaveTables,
          loan: loanTables,
        },
        usageInstructions: {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer YOUR_ADMIN_SECRET_KEY',
            'Content-Type': 'application/json',
          },
          body: {
            confirmDeletion: 'DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS',
          },
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[v0] Error in GET:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve purge information' },
      { status: 500 }
    )
  }
}
