import { createAdminClient, createClientAndGetUser } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || !['admin', 'it-admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { staff_user_id, hod_user_id } = body

    if (!staff_user_id || !hod_user_id) {
      return NextResponse.json(
        { error: 'Missing staff_user_id or hod_user_id' },
        { status: 400 }
      )
    }

    // Step 1: Remove the HOD linkage
    const { error: delinkError } = await admin
      .from('loan_hod_linkages')
      .delete()
      .eq('staff_user_id', staff_user_id)
      .eq('hod_user_id', hod_user_id)

    if (delinkError) {
      console.error('[v0] Delink error:', delinkError)
      return NextResponse.json(
        { error: 'Failed to delink HOD', details: delinkError },
        { status: 500 }
      )
    }

    // Step 2: Withdraw all pending requests assigned to this HOD from this staff
    // Get all pending loan requests from this staff with this HOD as reviewer
    const { data: loanRequests } = await admin
      .from('loan_requests')
      .select('id, status, hod_reviewer_id, user_id')
      .eq('status', 'pending_hod')
      .eq('user_id', staff_user_id)
      .eq('hod_reviewer_id', hod_user_id)

    if (loanRequests && loanRequests.length > 0) {
      // Fetch HOD name for the description
      const { data: hodProfile } = await admin
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('id', hod_user_id)
        .maybeSingle()

      const hodName = hodProfile ? `${hodProfile.first_name} ${hodProfile.last_name}` : 'Unknown HOD'

      // Withdraw these requests (move back to draft or reject them)
      await admin
        .from('loan_requests')
        .update({ status: 'withdrawn', hod_reviewer_id: null })
        .in('id', loanRequests.map((r: any) => r.id))

      // Log withdrawal in timeline
      const timelineEntries = loanRequests.map((req: any) => ({
        loan_request_id: req.id,
        action: 'withdrawn',
        description: `Request withdrawn from ${hodName} due to HOD delink`,
        changed_by: user.id,
        created_at: new Date().toISOString(),
      }))

      await admin.from('loan_request_timeline').insert(timelineEntries).then()
    }

    // Step 3: Get all remaining linked HODs for this staff
    const { data: remainingHods } = await admin
      .from('loan_hod_linkages')
      .select('hod_user_id')
      .eq('staff_user_id', staff_user_id)

    // Step 4: If there are remaining HODs, broadcast withdrawn requests to them
    if (remainingHods && remainingHods.length > 0) {
      const remainingHodIds = remainingHods.map((r: any) => r.hod_user_id)

      // Update withdrawn loan requests to be reassigned to remaining HODs
      for (const loanReq of loanRequests || []) {
        // Set to first remaining HOD
        await admin
          .from('loan_requests')
          .update({ 
            status: 'pending_hod',
            hod_reviewer_id: remainingHodIds[0]
          })
          .eq('id', loanReq.id)

        // Log reassignment
        await admin.from('loan_request_timeline').insert({
          loan_request_id: loanReq.id,
          action: 'hod_reassigned',
          description: `Request reassigned to remaining HODs after ${hod_user_id} was delinked. Now available to: ${remainingHodIds.join(', ')}`,
          changed_by: user.id,
          created_at: new Date().toISOString(),
        })
      }

      // Same for leave requests
      const { data: leaveRequests } = await admin
        .from('leave_plan_requests')
        .select('id, status, hod_reviewer_id, user_id')
        .eq('status', 'pending_hod')
        .eq('user_id', staff_user_id)
        .eq('hod_reviewer_id', hod_user_id)

      if (leaveRequests && leaveRequests.length > 0) {
        for (const leaveReq of leaveRequests) {
          await admin
            .from('leave_plan_requests')
            .update({ 
              status: 'pending_hod',
              hod_reviewer_id: remainingHodIds[0]
            })
            .eq('id', leaveReq.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `HOD ${hod_user_id} successfully delinked from staff ${staff_user_id}`,
      withdrawnLoans: loanRequests?.length || 0,
      remainingHods: remainingHods?.length || 0,
    })
  } catch (error) {
    console.error('[v0] Delink HOD error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
