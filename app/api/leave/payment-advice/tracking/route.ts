import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = request.nextUrl.searchParams.get('status') || 'ALL'

    // Query payment advice memos created by this HR Leave Office staff member
    let query = supabase
      .from('payment_advice_memos')
      .select(`
        id,
        month_year,
        month_name,
        year,
        staff_count,
        total_days,
        created_at,
        created_by,
        status,
        approval_status,
        approved_by,
        approved_at,
        memo_subject,
        is_locked
      `)
      .eq('created_by', user.id)
      .order('year', { ascending: false })
      .order('month_name', { ascending: false })

    // Apply status filter
    if (status !== 'ALL') {
      query = query.eq('approval_status', status)
    }

    const { data: memos, error } = await query

    if (error) {
      console.error('[v0] Error fetching memos:', error)
      return NextResponse.json(
        { error: 'Failed to fetch payment advice memos' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      memos: memos || [],
    })
  } catch (error) {
    console.error('[v0] Server error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
