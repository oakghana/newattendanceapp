import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { leave_plan_request_id } = await req.json()

    if (!leave_plan_request_id) {
      return NextResponse.json(
        { error: 'Missing leave_plan_request_id' },
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

    // Fetch the leave request to get user_id and end_date
    const { data: leaveRequest, error: fetchErr } = await admin
      .from('leave_plan_requests')
      .select('id, user_id, preferred_end_date')
      .eq('id', leave_plan_request_id)
      .single()

    if (fetchErr || !leaveRequest) {
      return NextResponse.json(
        { error: 'Leave request not found' },
        { status: 404 }
      )
    }

    const { data: reviewer, error: reviewerErr } = await admin
      .from('user_profiles')
      .select('role, department_id, assigned_location_id')
      .eq('id', user.id)
      .single()

    if (reviewerErr || !reviewer) {
      return NextResponse.json({ error: 'Reviewer profile not found' }, { status: 404 })
    }

    const normalizedRole = String(reviewer.role || '').toLowerCase().replace(/[\s-]+/g, '_')
    const isRegionalManager = normalizedRole === 'regional_manager'
    const isDepartmentHead = ['department_head', 'hod'].includes(normalizedRole)
    if (!isRegionalManager && !isDepartmentHead) {
      return NextResponse.json({ error: 'Only HODs and Regional Managers can confirm resumptions' }, { status: 403 })
    }

    const { data: staffProfile } = await admin
      .from('user_profiles')
      .select('department_id, assigned_location_id')
      .eq('id', leaveRequest.user_id)
      .single()

    const isInScope = isRegionalManager
      ? Boolean(reviewer.assigned_location_id && reviewer.assigned_location_id === staffProfile?.assigned_location_id)
      : Boolean(reviewer.department_id && reviewer.department_id === staffProfile?.department_id)

    if (!isInScope) {
      return NextResponse.json({ error: 'This staff member is outside your review scope' }, { status: 403 })
    }

    const staffUserId = leaveRequest.user_id
    const leaveEndDate = leaveRequest.preferred_end_date

    // Find or create the leave_resumption_notifications record
    // Match by user_id and leave_end_date
    const { data: resumptions, error: searchErr } = await admin
      .from('leave_resumption_notifications')
      .select('id, leave_request_id')
      .eq('user_id', staffUserId)
      .eq('leave_end_date', leaveEndDate)

    if (searchErr) {
      return NextResponse.json(
        { error: 'Failed to fetch resumption record' },
        { status: 500 }
      )
    }

    let resumptionId = resumptions?.[0]?.id

    // If no record exists, create one
    if (!resumptionId) {
      const today = new Date().toISOString().split('T')[0]
      const { data: newResumption, error: createErr } = await admin
        .from('leave_resumption_notifications')
        .insert({
          user_id: staffUserId,
          leave_request_id: leave_plan_request_id,
          leave_end_date: leaveEndDate,
          status: 'confirmed',
          first_hod_rm_check_in_date: today,
          confirmation_status: 'hod_confirmed',
        })
        .select('id')
        .single()

      if (createErr || !newResumption) {
        return NextResponse.json(
          { error: 'Failed to create resumption record' },
          { status: 500 }
        )
      }

      resumptionId = newResumption.id
    } else {
      // Update existing record with HOD confirmation
      const todayDate = new Date().toISOString().split('T')[0]
      const { error: updateErr } = await admin
        .from('leave_resumption_notifications')
        .update({
          leave_request_id: leave_plan_request_id,
          first_hod_rm_check_in_date: todayDate,
          confirmation_status: 'hod_confirmed',
        })
        .eq('id', resumptionId)

      if (updateErr) {
        return NextResponse.json(
          { error: 'Failed to confirm resumption' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Staff resumption confirmed successfully',
      resumption_id: resumptionId,
    })
  } catch (err) {
    console.error('[v0] HOD confirm resumption error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
