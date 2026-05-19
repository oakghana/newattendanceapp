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
    const { carryover_request_id, forfeiture_reason, notes, reviewed_by } = body

    if (!carryover_request_id) {
      return NextResponse.json(
        { error: 'carryover_request_id is required' },
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
    const requested_carryover_days = carryoverRequest.carryover_to_next_year || 0

    // Create FORFEITED transaction
    const { error: transactionError } = await supabase
      .from('leave_balance_transactions')
      .insert({
        staff_id,
        leave_year,
        leave_type_key,
        transaction_type: 'FORFEITED',
        days_change: -requested_carryover_days,
        running_balance: 0, // Forfeited days don't carry over
        reason_code: 'FORFEITURE',
        notes: `${requested_carryover_days} days forfeited. Reason: ${forfeiture_reason || 'Not specified'}. ${notes || ''}`,
        created_by: reviewed_by,
        approved_by: reviewed_by,
        approved_at: new Date().toISOString(),
        carryover_request_id,
      })

    if (transactionError) {
      console.error('[v0] Failed to create forfeiture transaction:', transactionError)
      return NextResponse.json(
        { error: 'Failed to record forfeiture' },
        { status: 500 }
      )
    }

    // Update outstanding_leave_balances record to mark as rejected and set carryover to 0
    const { data: updatedRequest, error: updateError } = await supabase
      .from('outstanding_leave_balances')
      .update({
        carryover_to_next_year: 0,
        status: 'REJECTED',
        notes: `Rejected/Forfeited: ${requested_carryover_days} days. Reason: ${forfeiture_reason || 'Not specified'}. ${notes || ''}`,
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
      message: 'Carryover request rejected and leave forfeited',
      carryover_request: updatedRequest,
    })
  } catch (error: any) {
    console.error('[v0] Carryover reject error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reject carryover request' },
      { status: 500 }
    )
  }
}
