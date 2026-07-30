import { createClient } from '@/lib/supabase/server'
import { NonResumptionWarningBanner } from './non-resumption-warning-banner'

export async function NonResumptionWarningDisplay() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    // Get the most critical active warning for this user
    const { data: warnings, error } = await supabase
      .from('leave_resumption_notifications')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['warning_sent', 'letter_sent', 'memo_sent'])
      .order('status', { ascending: false }) // memo_sent (critical) first
      .limit(1)

    if (error || !warnings || warnings.length === 0) {
      return null
    }

    const warning = warnings[0]

    return (
      <NonResumptionWarningBanner
        leaveEndDate={warning.leave_end_date}
        status={warning.status}
        daysOverdue={warning.days_overdue || 0}
      />
    )
  } catch (error) {
    console.error('[v0] Error fetching non-resumption warning:', error)
    return null
  }
}
