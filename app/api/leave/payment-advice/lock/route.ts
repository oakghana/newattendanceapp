import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { month_year, is_locked, reason } = await request.json()

    if (!month_year || is_locked === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: month_year, is_locked' },
        { status: 400 }
      )
    }

    // Verify the memo belongs to this user
    const { data: memo, error: fetchError } = await supabase
      .from('payment_advice_memos')
      .select('id, created_by, is_locked')
      .eq('month_year', month_year)
      .eq('created_by', user.id)
      .single()

    if (fetchError || !memo) {
      return NextResponse.json(
        { error: 'Payment advice memo not found or unauthorized' },
        { status: 404 }
      )
    }

    // Update lock status
    const { error: updateError } = await supabase
      .from('payment_advice_memos')
      .update({
        is_locked,
        lock_reason: reason,
        lock_updated_at: new Date().toISOString(),
        lock_updated_by: user.id,
      })
      .eq('id', memo.id)

    if (updateError) {
      console.error('[v0] Error updating lock status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update lock status' },
        { status: 500 }
      )
    }

    // Log the action
    await supabase.from('payment_advice_audit_log').insert({
      memo_id: memo.id,
      action: is_locked ? 'LOCKED' : 'UNLOCKED',
      performed_by: user.id,
      details: {
        reason,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Month ${is_locked ? 'locked' : 'unlocked'} successfully`,
    })
  } catch (error: any) {
    console.error('[v0] Server error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
