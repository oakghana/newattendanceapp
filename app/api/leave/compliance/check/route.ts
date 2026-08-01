import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  getAnnualLeaveReminders,
  checkLeaveCompliance,
  getEndorsementEscalations,
  escalateOverdueEndorsements,
  isAnnualLeaveReminderPeriod,
} from '@/lib/leave-compliance-service'

/**
 * GET /api/leave/compliance/check
 * Check annual leave compliance status for current user
 * Returns reminders, locking status, and grant awareness messaging
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check compliance status
    const compliance = await checkLeaveCompliance(user.id, admin)

    // Get reminders if in reminder period
    const { reminders, daysLeft } = await getAnnualLeaveReminders(user.id, admin)

    // Get endorsement escalations if user is a manager/HOD
    const { escalations } = await getEndorsementEscalations(user.id, admin)

    // If manager/HOD, trigger automatic escalation of overdue endorsements
    if (escalations.length > 0) {
      await escalateOverdueEndorsements(admin)
    }

    return NextResponse.json({
      compliance,
      reminders,
      escalations,
      daysLeft,
      isReminderPeriod: isAnnualLeaveReminderPeriod(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[leave/compliance/check] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check leave compliance' },
      { status: 500 }
    )
  }
}
