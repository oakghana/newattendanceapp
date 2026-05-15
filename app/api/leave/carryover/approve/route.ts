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

    // Get the carryover request
    const { data: carryoverRequest, error: fetchError } = await supabase
      .from('carryover_approval_requests')
      .select('*')
      .eq('id', carryover_request_id)
      .single()

    if (fetchError || !carryoverRequest) {
      return NextResponse.json(
        { error: 'Carryover request not found' },
        { status: 404 }
      )
    }

    const { staff_id, leave_year, leave_type_key, balance_available } = carryoverRequest

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

    // Update carryover request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('carryover_approval_requests')
      .update({
        status: 'APPROVED',
        reviewed_by,
        reviewed_at: new Date().toISOString(),
        approval_reason,
        approval_note: notes,
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
