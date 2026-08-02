import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { leave_resumption_id, action, notes, confirmation_type } = await req.json()

    if (!leave_resumption_id || !['confirmed', 'rejected'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the leave resumption notification record
    const { data: resumption, error: fetchErr } = await admin
      .from('leave_resumption_notifications')
      .select('id, user_id, leave_request_id, confirmation_status')
      .eq('id', leave_resumption_id)
      .single()

    if (fetchErr || !resumption) {
      return NextResponse.json(
        { error: 'Resumption record not found' },
        { status: 404 }
      )
    }

    // Check if confirmation record exists, create if not
    const { data: existing } = await admin
      .from('leave_resumption_confirmations')
      .select('id')
      .eq('leave_resumption_id', leave_resumption_id)
      .maybeSingle()

    if (!existing) {
      await admin.from('leave_resumption_confirmations').insert({
        leave_resumption_id,
        user_id: resumption.user_id,
        final_status: 'pending_verification',
      })
    }

    // Update confirmation based on type
    if (confirmation_type === 'pending_hod_rm') {
      // HOD/RM is confirming
      const { error: updateErr } = await admin
        .from('leave_resumption_confirmations')
        .update({
          hod_rm_user_id: user.id,
          hod_rm_confirmation_status: action,
          hod_rm_confirmed_at: new Date().toISOString(),
          hod_rm_notes: notes,
          final_status: action === 'confirmed' ? 'confirmed' : 'rejected',
        })
        .eq('leave_resumption_id', leave_resumption_id)

      if (updateErr) {
        return NextResponse.json(
          { error: 'Failed to update confirmation' },
          { status: 500 }
        )
      }

      // Update resumption status
      await admin
        .from('leave_resumption_notifications')
        .update({
          confirmation_status: action === 'confirmed' ? 'confirmed' : 'rejected',
        })
        .eq('id', leave_resumption_id)

      // Audit trail
      try {
        const { data: confirmRec } = await admin
          .from('leave_resumption_confirmations')
          .select('id')
          .eq('leave_resumption_id', leave_resumption_id)
          .single()

        await admin.from('resumption_confirmation_audit').insert({
          confirmation_id: confirmRec?.id,
          user_id: resumption.user_id,
          action: `hod_${action}`,
          decision_maker_id: user.id,
          decision_maker_role: 'hod_or_rm',
          notes,
        })
      } catch {}  

      // Notify HR Leave Office and HR Executive if confirmed
      if (action === 'confirmed') {
        const { data: hrUsers } = await admin
          .from('user_profiles')
          .select('id')
          .in('role', ['hr_leave_office', 'hr_executive', 'director_hr'])
          .eq('is_active', true)

        const staffProfile = await admin
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('id', resumption.user_id)
          .single()

        const notifRows = (hrUsers || [])
          .filter((u: any) => u.id !== user.id)
          .map((u: any) => ({
            recipient_id: u.id,
            sender_id: user.id,
            sender_role: 'hod_or_rm',
            sender_label: 'HOD/RM Confirmation',
            message: `${staffProfile.data?.first_name} ${staffProfile.data?.last_name} has been verified as resumed by their HOD/RM. Status is now confirmed.`,
            notification_type: 'leave_resumption_confirmed',
            is_read: false,
          }))

        if (notifRows.length > 0) {
          try {
            await admin.from('staff_notifications').insert(notifRows)
          } catch {}
        }
      }
    } else if (confirmation_type === 'pending_hr_manual') {
      // HR Leave Office is manually confirming
      const { error: updateErr } = await admin
        .from('leave_resumption_confirmations')
        .update({
          hr_office_manual_status: action,
          hr_office_confirmed_at: new Date().toISOString(),
          hr_office_notes: notes,
          final_status: action === 'confirmed' ? 'confirmed' : 'rejected',
        })
        .eq('leave_resumption_id', leave_resumption_id)

      if (updateErr) {
        return NextResponse.json(
          { error: 'Failed to update confirmation' },
          { status: 500 }
        )
      }

      // Update resumption status
      await admin
        .from('leave_resumption_notifications')
        .update({
          confirmation_status: action === 'confirmed' ? 'confirmed' : 'rejected',
        })
        .eq('id', leave_resumption_id)

      // Audit trail
      try {
        const { data: confirmRec } = await admin
          .from('leave_resumption_confirmations')
          .select('id')
          .eq('leave_resumption_id', leave_resumption_id)
          .single()

        await admin.from('resumption_confirmation_audit').insert({
          confirmation_id: confirmRec?.id,
          user_id: resumption.user_id,
          action: `hr_manual_${action}`,
          decision_maker_id: user.id,
          decision_maker_role: 'hr_leave_office',
          notes,
        })
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Resumption ${action === 'confirmed' ? 'confirmed' : 'rejected'} successfully`,
    })
  } catch (err) {
    console.error('[v0] Resumption confirmation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
