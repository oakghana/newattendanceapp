import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const { carryover_request_id, approved_days, approval_reason, notes, reviewed_by } = body

    if (!carryover_request_id || approved_days === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get the carryover record from outstanding_leave_balances (not carryover_approval_requests)
    const { data: carryoverRequest, error: fetchError } = await supabase
      .from('outstanding_leave_balances')
      .select('*')
      .eq('id', carryover_request_id)
      .single()

    if (fetchError || !carryoverRequest) {
      console.error('[v0] Carryover record not found:', { carryover_request_id, fetchError })
      return NextResponse.json(
        { error: 'Carryover request not found' },
        { status: 404 }
      )
    }

    const staff_id = carryoverRequest.user_id
    const leave_year = carryoverRequest.leave_year_period
    const leave_type_key = 'annual'
    const balance_available = carryoverRequest.opening_balance || 0

    // Create CARRYOVER_APPROVED transaction
    const { error: transactionError } = await supabase
      .from('leave_balance_transactions')
      .insert({
        staff_id,
        leave_year,
        leave_type_key,
        transaction_type: 'CARRYOVER_APPROVED',
        days_change: approved_days,
        running_balance: balance_available + approved_days,
        reason_code: 'CARRYOVER_APPROVAL',
        notes: `Carryover approved: ${approved_days} days. Reason: ${approval_reason || 'Not specified'}. ${notes || ''}`,
        created_by: reviewed_by,
        approved_by: reviewed_by,
        approved_at: new Date().toISOString(),
        carryover_request_id,
      })

    if (transactionError) {
      console.error('[v0] Failed to create approval transaction:', transactionError)
      return NextResponse.json(
        { error: 'Failed to record approval' },
        { status: 500 }
      )
    }

    // Update outstanding_leave_balances record to mark as approved and set the approved days
    const { data: updatedRequest, error: updateError } = await supabase
      .from('outstanding_leave_balances')
      .update({
        carryover_to_next_year: approved_days,
        status: 'APPROVED',
        notes: `Approved: ${approved_days} days. Reason: ${approval_reason || 'Not specified'}. ${notes || ''}`,
        approved_by: reviewed_by,
        approved_at: new Date().toISOString(),
      })
      .eq('id', carryover_request_id)
      .select()
      .single()

    if (updateError) {
      console.error('[v0] Failed to update carryover request:', updateError)
      return NextResponse.json(
        { error: 'Failed to update carryover request' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Carryover request approved',
      carryover_request: updatedRequest,
    })
  } catch (error: any) {
    console.error('[v0] Carryover approve error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to approve carryover request' },
      { status: 500 }
    )
  }
}
