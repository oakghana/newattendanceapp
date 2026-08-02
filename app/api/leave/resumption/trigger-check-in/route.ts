import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

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

    const admin = await createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    // Find the active leave for this user that has ended but not been confirmed
    const { data: resumption, error: fetchErr } = await admin
      .from('leave_resumption_notifications')
      .select('id, user_id, leave_end_date, confirmation_status')
      .eq('user_id', user_id)
      .eq('confirmation_status', 'unconfirmed')
      .lte('leave_end_date', today)
      .maybeSingle()

    if (fetchErr) {
      console.error('[v0] Error fetching resumption:', fetchErr)
      // Non-fatal — continue without triggering
      return NextResponse.json({ success: true, triggered: false })
    }

    if (!resumption) {
      // No active leave to confirm
      return NextResponse.json({ success: true, triggered: false })
    }

    // Create confirmation record with HOD/RM pending status
    const { error: createErr, data: confirmation } = await admin
      .from('leave_resumption_confirmations')
      .insert({
        leave_resumption_id: resumption.id,
        user_id,
        staff_check_in_date: check_in_date || today,
        staff_check_in_time: new Date().toISOString(),
        final_status: 'pending_verification',
      })
      .select('id')
      .single()

    if (createErr) {
      console.error('[v0] Error creating confirmation:', createErr)
      return NextResponse.json({ success: true, triggered: false })
    }

    // Update resumption status to pending HOD/RM verification
    try {
      await admin
        .from('leave_resumption_notifications')
        .update({
          confirmation_status: 'pending_hod_rm',
          first_hod_rm_check_in_date: check_in_date || today,
        })
        .eq('id', resumption.id)
    } catch {}

    // Audit trail
    try {
      await admin.from('resumption_confirmation_audit').insert({
        confirmation_id: confirmation?.id,
        user_id,
        action: 'check_in_claimed',
        notes: `Staff checked in on ${check_in_date || today}, triggering HOD/RM verification requirement`,
      })
    } catch {}

    // Notify HOD/RM that they need to verify this staff member
    const { data: staffProfile } = await admin
      .from('user_profiles')
      .select('first_name, last_name, id')
      .eq('id', user_id)
      .single()

    if (staffProfile) {
      // Get HOD/RM linked to this staff
      const { data: hodLinks } = await admin
        .from('loan_hod_linkages')
        .select('hod_user_id')
        .eq('staff_user_id', user_id)

      const hodIds = (hodLinks || []).map((h: any) => h.hod_user_id).filter(Boolean)

      if (hodIds.length > 0) {
        const notifRows = hodIds.map((hodId: string) => ({
          recipient_id: hodId,
          sender_id: user_id,
          sender_role: 'system',
          sender_label: 'Leave Resumption',
          message: `${staffProfile.first_name} ${staffProfile.last_name} has checked in and claims to have resumed from leave. Please verify their presence at your earliest convenience on the All Requests tab under Leave Administration.`,
          notification_type: 'leave_resumption_needs_hod_verification',
          is_read: false,
        }))

        try {
          await admin.from('staff_notifications').insert(notifRows)
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      triggered: true,
      message: 'Resumption confirmation workflow initiated',
    })
  } catch (err) {
    console.error('[v0] Check-in resumption trigger error:', err)
    // Non-fatal error — don't block check-in
    return NextResponse.json({ success: true, triggered: false })
  }
}
