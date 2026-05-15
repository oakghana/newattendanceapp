/**
 * Carryover Workflow Logic
 * Handles the end-of-year carryover approval process for leave balances
 */

import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

/**
 * Step 1: Identify staff with unused leave balance
 * Calculate balance at end of leave year and create pending carryover requests
 */
export async function createCarryoverRequests(leaveYear: string) {
  const supabase = getSupabaseClient()
  console.log(`[v0] Creating carryover requests for leave year: ${leaveYear}`)

  try {
    // Get all staff with outstanding balances
    const { data: staffWithBalance, error: fetchError } = await supabase
      .from('outstanding_leave_balances')
      .select('*, staff:staff_id(*)')
      .eq('leave_year', leaveYear)
      .gt('balance', 0)

    if (fetchError) {
      console.error('[v0] Error fetching balances:', fetchError)
      return { success: false, error: fetchError.message }
    }

    let createdCount = 0
    const results = []

    // For each staff member, check carryover policy and create request
    for (const record of staffWithBalance || []) {
      const leaveTypeKey = record.leave_type_key

      // Get carryover policy
      const { data: policy } = await supabase
        .from('forfeiture_policies')
        .select('*')
        .eq('leave_type_key', leaveTypeKey)
        .eq('leave_year', leaveYear)
        .single()

      if (!policy || !policy.carryover_allowed) {
        console.log(`[v0] Carryover not allowed for ${leaveTypeKey}`)
        continue
      }

      const balance = record.balance || 0
      const maxCarryover = policy.max_carryover_days || 0

      if (balance <= 0) continue

      // Create carryover request
      const { data: carryoverRequest, error: createError } = await supabase
        .from('carryover_approval_requests')
        .insert({
          staff_id: record.staff_id,
          leave_year: leaveYear,
          leave_type_key: leaveTypeKey,
          balance_available: balance,
          max_carryover_allowed: maxCarryover,
          requested_carryover_days: Math.min(balance, maxCarryover),
          status: 'PENDING',
          requested_by: record.staff_id,
          approval_note: 'Auto-generated carryover request at end of leave year',
        })
        .select()
        .single()

      if (createError) {
        console.error(`[v0] Error creating carryover for ${record.staff_id}:`, createError)
        results.push({
          staff_id: record.staff_id,
          status: 'error',
          error: createError.message,
        })
      } else {
        createdCount++
        results.push({
          staff_id: record.staff_id,
          carryover_id: carryoverRequest.id,
          requested_days: carryoverRequest.requested_carryover_days,
          status: 'pending_approval',
        })
      }
    }

    return {
      success: true,
      created: createdCount,
      details: results,
    }
  } catch (error: any) {
    console.error('[v0] Carryover creation failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Step 2: Process carryover approvals
 * When HR approves a carryover request, record the transaction
 */
export async function recordCarryoverApproval(
  carryoverRequestId: string,
  approvedDays: number,
  reviewedBy: string
) {
  const supabase = getSupabaseClient()
  console.log(`[v0] Recording carryover approval for request: ${carryoverRequestId}`)

  try {
    // Get the carryover request
    const { data: request, error: fetchError } = await supabase
      .from('carryover_approval_requests')
      .select('*')
      .eq('id', carryoverRequestId)
      .single()

    if (fetchError || !request) {
      return { success: false, error: 'Carryover request not found' }
    }

    const { staff_id, leave_year, leave_type_key, balance_available } = request

    // Get last transaction to calculate running balance
    const { data: lastTransaction } = await supabase
      .from('leave_balance_transactions')
      .select('running_balance')
      .eq('staff_id', staff_id)
      .eq('leave_year', leave_year)
      .eq('leave_type_key', leave_type_key)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const currentBalance = lastTransaction?.running_balance || balance_available

    // Create CARRYOVER_APPROVED transaction
    const { error: transactionError } = await supabase
      .from('leave_balance_transactions')
      .insert({
        staff_id,
        leave_year,
        leave_type_key,
        transaction_type: 'CARRYOVER_APPROVED',
        days_change: approvedDays,
        running_balance: currentBalance + approvedDays,
        reason_code: 'CARRYOVER_APPROVAL',
        notes: `${approvedDays} days approved for carryover to next leave year`,
        created_by: reviewedBy,
        approved_by: reviewedBy,
        approved_at: new Date().toISOString(),
        carryover_request_id: carryoverRequestId,
      })

    if (transactionError) {
      console.error('[v0] Failed to create approval transaction:', transactionError)
      return { success: false, error: 'Failed to record approval' }
    }

    // Update carryover request status
    await supabase
      .from('carryover_approval_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', carryoverRequestId)

    return {
      success: true,
      message: 'Carryover approval recorded',
      approvedDays,
    }
  } catch (error: any) {
    console.error('[v0] Carryover approval recording failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Step 3: Process automatic forfeiture
 * At the forfeiture deadline, auto-forfeit any pending carryover requests
 */
export async function processForfeitureForDeadline(leaveYear: string, forfeitureDate: Date) {
  const supabase = getSupabaseClient()
  console.log(`[v0] Processing forfeitures for date: ${forfeitureDate.toISOString()}`)

  try {
    // Get all pending carryover requests past the deadline
    const { data: pendingRequests, error: fetchError } = await supabase
      .from('carryover_approval_requests')
      .select('*')
      .eq('leave_year', leaveYear)
      .eq('status', 'PENDING')
      .lt('requested_at', forfeitureDate.toISOString())

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }

    let forfeitedCount = 0
    const results = []

    // Auto-forfeit each pending request
    for (const request of pendingRequests || []) {
      const { staff_id, leave_type_key, requested_carryover_days } = request

      // Create FORFEITED transaction
      const { error: transactionError } = await supabase
        .from('leave_balance_transactions')
        .insert({
          staff_id,
          leave_year,
          leave_type_key,
          transaction_type: 'FORFEITED',
          days_change: -requested_carryover_days,
          running_balance: 0,
          reason_code: 'FORFEITURE',
          notes: `Auto-forfeited due to HR approval deadline passed. ${requested_carryover_days} days lost.`,
          created_by: null,
          approved_by: null,
          approved_at: new Date().toISOString(),
          carryover_request_id: request.id,
        })

      if (transactionError) {
        console.error('[v0] Forfeiture transaction failed:', transactionError)
        results.push({
          request_id: request.id,
          status: 'error',
          error: transactionError.message,
        })
        continue
      }

      // Update carryover request status to FORFEITED
      await supabase
        .from('carryover_approval_requests')
        .update({
          status: 'FORFEITED',
          forfeited_days: requested_carryover_days,
          forfeited_reason: 'HR approval deadline exceeded',
        })
        .eq('id', request.id)

      forfeitedCount++
      results.push({
        request_id: request.id,
        staff_id,
        forfeited_days: requested_carryover_days,
        status: 'forfeited',
      })
    }

    return {
      success: true,
      forfeited: forfeitedCount,
      details: results,
    }
  } catch (error: any) {
    console.error('[v0] Forfeiture processing failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Step 4: Generate carryover summary report
 */
export async function getCarryoverSummary(leaveYear: string) {
  const supabase = getSupabaseClient()
  console.log(`[v0] Generating carryover summary for: ${leaveYear}`)

  try {
    const { data: requests, error } = await supabase
      .from('carryover_approval_requests')
      .select('*')
      .eq('leave_year', leaveYear)

    if (error) {
      return { success: false, error: error.message }
    }

    const summary = {
      total_requests: (requests || []).length,
      approved: requests?.filter(r => r.status === 'APPROVED').length || 0,
      rejected: requests?.filter(r => r.status === 'REJECTED').length || 0,
      forfeited: requests?.filter(r => r.status === 'FORFEITED').length || 0,
      pending: requests?.filter(r => r.status === 'PENDING').length || 0,
      total_days_approved: requests
        ?.filter(r => r.status === 'APPROVED')
        .reduce((sum, r) => sum + (r.requested_carryover_days || 0), 0) || 0,
      total_days_forfeited: requests
        ?.filter(r => r.status === 'FORFEITED')
        .reduce((sum, r) => sum + (r.forfeited_days || 0), 0) || 0,
    }

    return { success: true, summary }
  } catch (error: any) {
    console.error('[v0] Summary generation failed:', error)
    return { success: false, error: error.message }
  }
}
