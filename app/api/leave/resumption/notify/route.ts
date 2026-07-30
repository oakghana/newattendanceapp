import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { trackLeaveResumption } from '@/lib/leave-resumption-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { check_in_date } = body

    if (!check_in_date) {
      return NextResponse.json(
        { error: 'check_in_date is required' },
        { status: 400 }
      )
    }

    // Track leave resumption
    await trackLeaveResumption(user.id, new Date(check_in_date))

    return NextResponse.json({
      success: true,
      message: 'Leave resumption tracked successfully',
    })
  } catch (error) {
    console.error('[v0] Leave resumption notification error:', error)
    return NextResponse.json(
      { error: 'Failed to process leave resumption notification' },
      { status: 500 }
    )
  }
}
