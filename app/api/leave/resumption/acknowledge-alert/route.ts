import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { alertId, acknowledgedBy } = body

    if (!alertId || !acknowledgedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: alertId, acknowledgedBy' },
        { status: 400 }
      )
    }

    // Update the alert as acknowledged
    const { data, error } = await supabase
      .from('leave_resumption_alerts')
      .update({
        hod_rm_alert_acknowledged: true,
        hod_rm_alert_acknowledged_at: new Date().toISOString(),
        hod_rm_alert_acknowledged_by: acknowledgedBy
      })
      .eq('id', alertId)
      .select()
      .single()

    if (error) throw error

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: acknowledgedBy,
      action: 'acknowledged_missing_checkin',
      table_name: 'leave_resumption_alerts',
      record_id: alertId,
      new_values: { hod_rm_alert_acknowledged: true }
    })

    return NextResponse.json({
      success: true,
      data,
      message: 'Alert acknowledged successfully'
    })
  } catch (error) {
    console.error('[v0] Acknowledge alert error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
