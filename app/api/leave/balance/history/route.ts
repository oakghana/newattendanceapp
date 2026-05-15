import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const staffId = searchParams.get('staff_id')
    const leaveYear = searchParams.get('leave_year')
    const leaveTypeKey = searchParams.get('leave_type_key')
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    if (!staffId) {
      return NextResponse.json(
        { error: 'staff_id is required' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('leave_balance_transactions')
      .select('*', { count: 'exact' })
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })

    if (leaveYear) {
      query = query.eq('leave_year', leaveYear)
    }

    if (leaveTypeKey) {
      query = query.eq('leave_type_key', leaveTypeKey)
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('[v0] Balance history fetch error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      transactions: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('[v0] Balance history error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch balance history' },
      { status: 500 }
    )
  }
}
