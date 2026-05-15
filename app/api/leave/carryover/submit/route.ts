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
    const { staff_id, leave_year, leave_type_key, requested_days, reason } = body

    if (!staff_id || !leave_year || !leave_type_key || requested_days === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get current balance
    const { data: latestTransaction } = await supabase
      .from('leave_balance_transactions')
      .select('running_balance')
      .eq('staff_id', staff_id)
      .eq('leave_year', leave_year)
      .eq('leave_type_key', leave_type_key)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const balance_available = latestTransaction?.running_balance || 0

    // Get policy for max carryover
    const { data: policy } = await supabase
      .from('forfeiture_policies')
      .select('max_carryover_days')
      .eq('leave_type_key', leave_type_key)
      .eq('leave_year', leave_year)
      .single()

    const max_carryover_allowed = policy?.max_carryover_days || 0

    // Create carryover request
    const { data, error } = await supabase
      .from('carryover_approval_requests')
      .insert({
        staff_id,
        leave_year,
        leave_type_key,
        balance_available,
        max_carryover_allowed,
        requested_carryover_days: requested_days,
        status: 'PENDING',
        requested_by: staff_id,
        approval_note: reason,
      })
      .select()
      .single()

    if (error) {
      console.error('[v0] Carryover submit error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Carryover request submitted',
      carryover_request: data,
    })
  } catch (error: any) {
    console.error('[v0] Carryover submit error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit carryover request' },
      { status: 500 }
    )
  }
}
