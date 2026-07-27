import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

/**
 * DELETE /api/leave/delete-request
 * 
 * Safely deletes a specific leave request from the database.
 * Only admin users can delete leave requests.
 * Deletes related data in proper order to avoid foreign key violations.
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get the leave request ID from query params
    const { searchParams } = new URL(request.url)
    const leaveRequestId = searchParams.get('id')

    if (!leaveRequestId) {
      return NextResponse.json(
        { error: 'Leave request ID is required' },
        { status: 400 }
      )
    }

    // Get the current user to verify they are an admin
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - no token provided' },
        { status: 401 }
      )
    }

    const { data: { user }, error: authError } = await admin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid token' },
        { status: 401 }
      )
    }

    // Verify user is admin
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'hr_executive', 'hr_leave_office'].includes(profile.role?.toLowerCase())) {
      return NextResponse.json(
        { error: 'Forbidden - only admins and HR staff can delete leave requests' },
        { status: 403 }
      )
    }

    // Get the leave request details first for audit logging
    const { data: leaveRequest, error: fetchError } = await admin
      .from('leave_requests')
      .select('*')
      .eq('id', leaveRequestId)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json(
        { error: 'Leave request not found' },
        { status: 404 }
      )
    }

    console.log(`[v0] Admin ${user.id} is deleting leave request ${leaveRequestId}`)

    // Delete related records in dependency order
    // 1. Delete from leave_balance_transactions (if any)
    await admin
      .from('leave_balance_transactions')
      .delete()
      .eq('leave_request_id', leaveRequestId)

    // 2. Delete from leave_status (if any)
    await admin
      .from('leave_status')
      .delete()
      .eq('leave_request_id', leaveRequestId)

    // 3. Delete from leave_payment_memos (if any)
    await admin
      .from('leave_payment_memos')
      .delete()
      .eq('leave_request_id', leaveRequestId)

    // 4. Delete from leave_notifications (if any)
    await admin
      .from('leave_notifications')
      .delete()
      .eq('leave_request_id', leaveRequestId)

    // 5. Delete from leave_archive_log (if any)
    await admin
      .from('leave_archive_log')
      .delete()
      .eq('leave_request_id', leaveRequestId)

    // 6. Delete from leave_change_proposals (if any)
    await admin
      .from('leave_change_proposals')
      .delete()
      .eq('leave_request_id', leaveRequestId)

    // 7. Finally, delete the leave request itself
    const { error: deleteError } = await admin
      .from('leave_requests')
      .delete()
      .eq('id', leaveRequestId)

    if (deleteError) {
      console.error(`[v0] Error deleting leave request ${leaveRequestId}:`, deleteError)
      return NextResponse.json(
        { error: `Failed to delete leave request: ${deleteError.message}` },
        { status: 500 }
      )
    }

    console.log(`[v0] Successfully deleted leave request ${leaveRequestId} and related records`)

    return NextResponse.json({
      success: true,
      message: `Leave request ${leaveRequestId} has been permanently deleted`,
      deletedRequest: {
        id: leaveRequest.id,
        staffName: leaveRequest.staff_name,
        status: leaveRequest.status,
        startDate: leaveRequest.preferred_start_date,
      },
    })
  } catch (error) {
    console.error('[v0] Unexpected error in delete-request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/leave/delete-request?id=xxx
 * 
 * Verify if a leave request can be safely deleted (check dependencies)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leaveRequestId = searchParams.get('id')

    if (!leaveRequestId) {
      return NextResponse.json(
        { error: 'Leave request ID is required' },
        { status: 400 }
      )
    }

    // Check if the leave request exists
    const { data: leaveRequest, error: fetchError } = await admin
      .from('leave_requests')
      .select('id, staff_name, status, preferred_start_date')
      .eq('id', leaveRequestId)
      .single()

    if (fetchError || !leaveRequest) {
      return NextResponse.json(
        { exists: false, error: 'Leave request not found' },
        { status: 404 }
      )
    }

    // Count related records
    const [
      { count: balanceCount },
      { count: statusCount },
      { count: memoCount },
      { count: notificationCount },
    ] = await Promise.all([
      admin
        .from('leave_balance_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('leave_request_id', leaveRequestId),
      admin
        .from('leave_status')
        .select('id', { count: 'exact', head: true })
        .eq('leave_request_id', leaveRequestId),
      admin
        .from('leave_payment_memos')
        .select('id', { count: 'exact', head: true })
        .eq('leave_request_id', leaveRequestId),
      admin
        .from('leave_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('leave_request_id', leaveRequestId),
    ])

    return NextResponse.json({
      exists: true,
      request: leaveRequest,
      relatedRecords: {
        balanceTransactions: balanceCount || 0,
        statuses: statusCount || 0,
        memos: memoCount || 0,
        notifications: notificationCount || 0,
      },
      canDelete: true,
    })
  } catch (error) {
    console.error('[v0] Unexpected error in delete-request GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
