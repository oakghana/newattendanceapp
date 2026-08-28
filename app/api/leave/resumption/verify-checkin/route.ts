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
    const { userId, checkinTime, checkinDate } = body

    if (!userId || !checkinTime || !checkinDate) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, checkinTime, checkinDate' },
        { status: 400 }
      )
    }

    // Find any pending resumption alert for this user on this date
    const { data: resumptionAlert, error: findError } = await supabase
      .from('leave_resumption_alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('resumption_date', checkinDate)
      .eq('status', 'pending')
      .single()

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      throw findError
    }

    if (resumptionAlert) {
      // Update the resumption alert to mark as checked in
      const { error: updateError } = await supabase
        .from('leave_resumption_alerts')
        .update({
          status: 'checked_in',
          checked_in_date: checkinDate,
          checked_in_time: checkinTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', resumptionAlert.id)

      if (updateError) throw updateError

      // Create a notification to acknowledge the check-in
      await supabase.from('notifications').insert({
        recipient_id: userId,
        title: 'Leave Resumption Confirmed',
        message: `Your return to work has been recorded. Welcome back! Check-in time: ${checkinTime}`,
        type: 'checkin_confirmed',
        related_id: resumptionAlert.id,
        priority: 'low'
      })

      return NextResponse.json({
        success: true,
        message: 'Leave resumption check-in recorded successfully',
        resumptionAlert
      })
    }

    // No resumption alert found for this date, just return success
    return NextResponse.json({
      success: true,
      message: 'No resumption alert found for this date',
      resumptionAlert: null
    })
  } catch (error) {
    console.error('[v0] Check-in verification error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
