import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/leave/regional-office/leaves
 * Regional Loan Office can view all leave requests from their assigned region/location
 * Cannot approve/reject, only view and export data
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient();
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check role and assigned locations
    const { data: userProfile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, role, assigned_location_id')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only regional_loan_office role can access this endpoint
    if (userProfile.role !== 'regional_loan_office' && userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get the assigned locations for this regional loan office
    const { data: assignedLocations, error: locationsError } = await admin
      .from('regional_loan_office_locations')
      .select('location_id, region_id')
      .eq('regional_loan_office_id', userId)
      .eq('is_active', true);

    if (locationsError) {
      console.error('[v0] Error fetching assigned locations:', locationsError);
      return NextResponse.json(
        { error: 'Failed to fetch assigned locations' },
        { status: 500 }
      );
    }

    const locationIds = assignedLocations?.map(loc => loc.location_id) || [];

    if (locationIds.length === 0) {
      return NextResponse.json(
        { leaves: [], summary: { total: 0, pending: 0, approved: 0 } },
        { status: 200 }
      );
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
        user_profiles!leave_plan_requests_user_id_fkey (
          staff_number,
          first_name,
          last_name,
          email,
          assigned_location_id
        )
        `,
        { count: 'exact' }
      )
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
      pending: leaves?.filter(l => l.status === 'pending_hod_review').length || 0,
      approved: leaves?.filter(l => l.status === 'hr_office_approved').length || 0,
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
