import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only loan_office role can update FD values
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'loan_office') {
      return NextResponse.json({ error: 'Only loan office users can update FD values' }, { status: 403 })
    }

    const { id, fd_score, reason } = await req.json()

    if (!id || fd_score === null || fd_score === undefined || !reason?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (fd_score < 0 || fd_score > 100) {
      return NextResponse.json({ error: 'FD score must be between 0 and 100' }, { status: 400 })
    }

    // Update the loan request's fd_score and add the reason to fd_note
    const { error } = await supabase
      .from('loan_requests')
      .update({
        fd_score,
        fd_note: `[Updated by ${profile.role}] ${reason}\n\nOriginal calculation pending executive review.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('[fd-update] Supabase error:', error)
      return NextResponse.json({ error: 'Failed to update FD value' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'FD value updated. Awaiting accounts executive approval.',
    })
  } catch (e: any) {
    console.error('[fd-update] Error:', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
