import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addDays, isToday, isBefore } from 'date-fns'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { action } = body

    if (action === 'check_missing_checkins') {
      // Find all staff who should have checked in today but haven't
      const today = new Date().toISOString().split('T')[0]

      const { data: missedCheckIns, error: missedError } = await supabase
        .from('leave_resumption_alerts')
        .select(`
          *,
          user:user_profiles(id, first_name, last_name, employee_id, email, hod_id, manager_id, department_id),
          leave:leave_plan_requests(id, leave_type)
        `)
        .eq('resumption_date', today)
        .eq('status', 'pending')
        .is('checked_in_date', null)

      if (missedError) throw missedError

      // For each missed check-in, send alert to HOD and RM
      for (const alert of missedCheckIns) {
        if (!alert.hod_rm_alert_sent) {
          // Get HOD and RM details
          const { data: hodRmUsers, error: hodRmError } = await supabase
            .from('user_profiles')
            .select('id, email, first_name, last_name, role')
            .in('id', [alert.user.hod_id, alert.user.manager_id])

          if (!hodRmError && hodRmUsers && hodRmUsers.length > 0) {
            // Create notification records
            for (const manager of hodRmUsers) {
              await supabase.from('notifications').insert({
                recipient_id: manager.id,
                title: 'Staff Not Reporting to Work',
                message: `${alert.user.first_name} ${alert.user.last_name} (${alert.user.employee_id}) should have reported to work today but has not checked in.`,
                type: 'missing_checkin',
                related_id: alert.id,
                priority: 'high'
              })
            }

            // Update alert status
            await supabase
              .from('leave_resumption_alerts')
              .update({
                hod_rm_alert_sent: true,
                hod_rm_alert_sent_at: new Date().toISOString(),
                status: 'no_show'
              })
              .eq('id', alert.id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        missedCheckIns: missedCheckIns.length,
        message: `Checked ${missedCheckIns.length} staff for missing check-ins`
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[v0] Missing check-in error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
