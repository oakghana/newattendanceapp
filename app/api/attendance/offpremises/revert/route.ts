import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { request_id, user_id, attendance_record_id } = body

    if (!request_id) return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    if (!user_id) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

    const supabase = await createAdminClient()

    // Verify approver permissions
    const { data: approverProfile, error: approverError } = await supabase
      .from('user_profiles')
      .select('role, department_id')
      .eq('id', user_id)
      .single()

    if (approverError || !approverProfile) {
      return NextResponse.json({ error: 'Approver profile not found' }, { status: 404 })
    }

    if (!['department_head', 'regional_manager', 'admin'].includes(approverProfile.role)) {
      return NextResponse.json({ error: 'Not authorized to revert approvals' }, { status: 403 })
    }

    // Load the pending request
    const { data: pendingReq, error: getErr } = await supabase
      .from('pending_offpremises_checkins')
      .select('*')
      .eq('id', request_id)
      .single()

    if (getErr || !pendingReq) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (pendingReq.status !== 'approved') {
      return NextResponse.json({ error: 'Request is not in approved state' }, { status: 400 })
    }

    // If an attendance record was created, attempt to delete it
    if (attendance_record_id) {
      try {
        const { error: delErr } = await supabase
          .from('attendance_records')
          .delete()
          .eq('id', attendance_record_id)

        if (delErr) console.warn('[v0] Failed to delete attendance record during revert:', delErr)
      } catch (e) {
        console.warn('[v0] Exception deleting attendance record during revert:', e)
      }
    }

    // Reset pending request status back to pending
    const { error: updateErr } = await supabase
      .from('pending_offpremises_checkins')
      .update({ status: 'pending', approved_by_id: null, approved_at: null, rejection_reason: null })
      .eq('id', request_id)

    if (updateErr) {
      console.error('[v0] Failed to reset request status during revert:', updateErr)
      return NextResponse.json({ error: 'Failed to revert request' }, { status: 500 })
    }

    // Notify staff
    await supabase.from('staff_notifications').insert({
      user_id: pendingReq.user_id,
      type: 'offpremises_approval_reverted',
      title: 'Off‑Premises Approval Reverted',
      message: `Your off‑premises approval for ${pendingReq.google_maps_name || pendingReq.current_location_name} was reverted by ${approverProfile.role}. Please contact your manager for details.`,
      data: { request_id, attendance_record_id },
      is_read: false,
    }).then(() => {}).catch(err => console.warn('[v0] Failed to send revert notification:', err))

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[v0] Revert approval error:', error)
    return NextResponse.json({ error: error.message || 'Failed to revert approval' }, { status: 500 })
  }
}
