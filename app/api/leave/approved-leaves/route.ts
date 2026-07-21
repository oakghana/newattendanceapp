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

    // Query approved leave memos from payment_advice table
    const { data, error } = await admin
      .from('payment_advice')
      .select(`
        id,
        memo_body,
        staff_id,
        status,
        signed_at,
        created_at,
        user_profiles!staff_id (
          id,
          first_name,
          last_name,
          employee_id,
          departments!department_id (
            name
          )
        ),
        signer:user_profiles!signer_id (
          first_name,
          last_name,
          position
        )
      `)
      .eq('memo_type', 'leave')
      .in('status', ['approved', 'Approved & Signed', 'hr_approved'])
      .order('signed_at', { ascending: false })

    if (error) {
      console.error('[v0] Error fetching approved leaves:', error)
      return NextResponse.json({ error: 'Failed to fetch approved leaves' }, { status: 500 })
    }

    // Map to response format - extract leave details from memo_body
    const approvedLeaves: ApprovedLeave[] = (data || []).map((record: any) => {
      const memo = typeof record.memo_body === 'string' ? JSON.parse(record.memo_body) : record.memo_body
      const startDate = memo?.start_date || memo?.preferred_start_date || ''
      const endDate = memo?.end_date || memo?.preferred_end_date || ''
      const leaveType = memo?.leave_type || memo?.leave_type_key || 'Leave'
      const daysRequested = memo?.days_requested || memo?.requested_days || 0

      return {
        id: record.id,
        staff_name: `${record.user_profiles?.first_name || ''} ${record.user_profiles?.last_name || ''}`.trim(),
        employee_id: record.user_profiles?.employee_id || 'N/A',
        department: record.user_profiles?.departments?.name || 'General',
        leave_type: typeof leaveType === 'string'
          ? leaveType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : 'Leave',
        start_date: startDate,
        end_date: endDate,
        days_requested: daysRequested,
        status: record.status,
        signed_by: `${record.signer?.first_name || ''} ${record.signer?.last_name || ''}`.trim() || 'HR Executive',
        signed_at: record.signed_at || record.created_at,
        approval_date: record.created_at,
      }
    })

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
