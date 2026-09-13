import { NextRequest, NextResponse } from 'next/server'
import { processStaffResumptionCheckIn } from '@/lib/leave-resumption-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Triggered when a staff member checks in while on/after leave.
 * Creates a leave_resumption_confirmations record and sets status to 'pending_hod_rm'
 * so HOD/RM can verify the resumption on the All Requests tab.
 */
export async function POST(req: NextRequest) {
  try {
    const { user_id, check_in_date } = await req.json()

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    const today = check_in_date || new Date().toISOString().split('T')[0]
    const result = await processStaffResumptionCheckIn(user_id, today)

    return NextResponse.json(result)
  } catch (err) {
    console.error('[v0] Check-in resumption trigger error:', err)
    // Non-fatal error — don't block check-in
    return NextResponse.json({ success: true, triggered: false })
  }
}
