import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/leave/regional-office/leaves
 * Regional HR can view regional leave requests from the same assigned location.
 * This queue is the first stage before Regional Manager/HOD review.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient();
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the Regional HR user's assigned office.
    const { data: userProfile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, role, assigned_location_id, region_id')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const normalizedRole = String(userProfile.role || '').toLowerCase().replace(/[- ]/g, '_');
    const isRegionalHr = ['regional_hr', 'regional_hr_leave_office', 'regional_leave_office'].includes(normalizedRole);
    const isRegionalLoanOffice = normalizedRole === 'regional_loan_office';
    if (!isRegionalHr && !isRegionalLoanOffice && normalizedRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const locationIds = userProfile.assigned_location_id ? [userProfile.assigned_location_id] : [];
    const regionIds = userProfile.region_id ? [userProfile.region_id] : [];
    let scopedStaffIds: string[] = [];
    if (locationIds.length > 0 || regionIds.length > 0) {
      let staffQuery = admin.from('user_profiles').select('id').neq('id', userId);
      if (locationIds.length > 0) {
        staffQuery = staffQuery.in('assigned_location_id', locationIds);
      } else {
        staffQuery = staffQuery.in('region_id', regionIds);
      }
      const { data: scopedStaff, error: scopedStaffError } = await staffQuery;
      if (scopedStaffError) return NextResponse.json({ error: 'Failed to resolve regional staff scope' }, { status: 500 });
      scopedStaffIds = (scopedStaff || []).map((row: any) => row.id).filter(Boolean);
    }
    if (locationIds.length === 0 && regionIds.length === 0) {
      return NextResponse.json(
        { leaves: [], summary: { total: 0, pending: 0, approved: 0 } },
        { status: 200 }
      );
    }

    // Repair only requests belonging to this Regional HR user's assigned staff
    // when the request was saved before location-first routing was enabled.
    if (scopedStaffIds.length > 0) {
      await admin
        .from('leave_plan_requests')
        .update({ workflow_route: 'regional', status: 'pending_regional_hr_review', workflow_stage: 'regional_hr_review', updated_at: new Date().toISOString() })
        .in('user_id', scopedStaffIds)
        .is('workflow_route', null)
        .in('status', ['pending_hod_review', 'pending', 'pending_hr_leave_processing'])
    }

    // Fetch leave requests for assigned locations
    const { data: leaves, error: leavesError, count } = await admin
      .from('leave_plan_requests')
      .select(
        `
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        reason,
        status,
        submitted_at,
        created_at,
        updated_at,
        hod_decision,
        workflow_route,
        workflow_stage,
        adjusted_days,
        adjusted_start_date,
        adjusted_end_date,
        memo_reference,
        regional_hr_office_user_id,
        user_profiles!leave_plan_requests_user_id_fkey!inner (
          staff_number,
          first_name,
          last_name,
          email,
          assigned_location_id
        )
        `,
        { count: 'exact' }
      )
      .eq('workflow_route', 'regional')
      .in('status', ['pending_regional_hr_office_review', 'pending_regional_hr_review', 'pending_regional_manager_approval'])
      .in('user_id', scopedStaffIds.length > 0 ? scopedStaffIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false });

    if (leavesError) {
      console.error('[v0] Error fetching leaves:', leavesError);
      return NextResponse.json(
        { error: 'Failed to fetch leaves' },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const summary = {
      total: count || 0,
      pending: leaves?.filter(l => l.status === 'pending_regional_hr_review').length || 0,
      approved: leaves?.filter(l => l.status === 'pending_regional_manager_approval').length || 0,
      rejected: leaves?.filter(l => l.status === 'rejected').length || 0,
      byType: {} as Record<string, number>,
    };

    // Group by leave type
    leaves?.forEach(leave => {
      const key = leave.leave_type_key || 'unknown';
      summary.byType[key] = (summary.byType[key] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      leaves,
      summary,
      message: 'Regional leave office data fetched successfully',
    });
  } catch (error) {
    console.error('[v0] Regional leave office API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
