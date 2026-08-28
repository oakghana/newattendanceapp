import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { differenceInDays } from 'date-fns'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { action } = body

    if (action === 'send_pre_resumption_alerts') {
      const today = new Date()
      const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
      const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
      const todayStr = today.toISOString().split('T')[0]

      // Find resumption alerts within 2 weeks and 1 week windows
      const { data: upcomingResumptions, error: resumptionError } = await supabase
        .from('leave_resumption_alerts')
        .select(`
          *,
          user:user_profiles(id, email, first_name, last_name, employee_id)
        `)
        .gte('resumption_date', todayStr)
        .lte('resumption_date', twoWeeksFromNow)
        .neq('status', 'no_show')

      if (resumptionError) throw resumptionError

      let twoWeekAlerts = 0
      let oneWeekAlerts = 0

      for (const alert of upcomingResumptions) {
        const daysUntilResumption = differenceInDays(new Date(alert.resumption_date), today)

        // Send 2-week alert (send once when exactly 14 days away or earlier, but only once)
        if (daysUntilResumption <= 14 && daysUntilResumption > 7 && !alert.alert_2_weeks_sent) {
          await supabase.from('notifications').insert({
            recipient_id: alert.user_id,
            title: 'Upcoming Leave Resumption',
            message: `You are scheduled to resume work on ${alert.resumption_date}. You have approximately 2 weeks to prepare. Please ensure you report to work on this date.`,
            type: 'leave_resumption_2week',
            related_id: alert.id,
            priority: 'medium'
          })

          await supabase
            .from('leave_resumption_alerts')
            .update({
              alert_2_weeks_sent: true,
              alert_2_weeks_sent_at: new Date().toISOString()
            })
            .eq('id', alert.id)

          twoWeekAlerts++
        }

        // Send 1-week alert (send once when exactly 7 days away or less, but only once)
        if (daysUntilResumption <= 7 && daysUntilResumption > 0 && !alert.alert_1_week_sent) {
          await supabase.from('notifications').insert({
            recipient_id: alert.user_id,
            title: 'Leave Resumption Reminder',
            message: `Your leave resumption date is ${alert.resumption_date} - just ${daysUntilResumption} day(s) away. Make sure to report to work on time and check in through the attendance system.`,
            type: 'leave_resumption_1week',
            related_id: alert.id,
            priority: 'high'
          })

          await supabase
            .from('leave_resumption_alerts')
            .update({
              alert_1_week_sent: true,
              alert_1_week_sent_at: new Date().toISOString()
            })
            .eq('id', alert.id)

          oneWeekAlerts++
        }
      }

      return NextResponse.json({
        success: true,
        twoWeekAlerts,
        oneWeekAlerts,
        totalProcessed: upcomingResumptions.length,
        message: `Sent ${twoWeekAlerts} 2-week alerts and ${oneWeekAlerts} 1-week alerts`
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[v0] Pre-resumption alert error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
