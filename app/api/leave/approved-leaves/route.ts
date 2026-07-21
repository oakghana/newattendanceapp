import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface ApprovedLeave {
  id: string
  staff_name: string
  employee_id: string
  department: string
  leave_type: string
  start_date: string
  end_date: string
  days_requested: number
  status: string
  signed_by: string
  signed_at: string
  approval_date: string
}

export async function GET() {
  try {
    const admin = await createAdminClient()

    // Query approved leave requests with staff and signing info
    const { data, error } = await admin
      .from('leave_plan_requests')
      .select(`
        id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        status,
        approved_by,
        approved_at,
        signed_by,
        signed_at,
        user_profiles!user_id (
          id,
          first_name,
          last_name,
          employee_id,
          departments!department_id (
            name
          )
        ),
        signed_by_user:user_profiles!signed_by (
          first_name,
          last_name,
          position
        )
      `)
      .eq('status', 'approved')
      .not('signed_at', 'is', null)
      .order('signed_at', { ascending: false })

    if (error) {
      console.error('[v0] Error fetching approved leaves:', error)
      return NextResponse.json({ error: 'Failed to fetch approved leaves' }, { status: 500 })
    }

    // Map to response format
    const approvedLeaves: ApprovedLeave[] = (data || []).map((record: any) => ({
      id: record.id,
      staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
      employee_id: record.user_profiles?.employee_id || 'N/A',
      department: record.user_profiles?.departments?.name || 'General',
      leave_type: record.leave_type_key
        ? record.leave_type_key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : 'Annual Leave',
      start_date: record.preferred_start_date,
      end_date: record.preferred_end_date,
      days_requested: record.requested_days || 0,
      status: record.status,
      signed_by: `${record.signed_by_user?.first_name || ''} ${record.signed_by_user?.last_name || ''}`.trim() || 'HR Executive',
      signed_at: record.signed_at,
      approval_date: record.approved_at || record.signed_at,
    }))

    return NextResponse.json({
      success: true,
      data: approvedLeaves,
      total: approvedLeaves.length,
    })
  } catch (error) {
    console.error('[v0] Exception in approved-leaves API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
