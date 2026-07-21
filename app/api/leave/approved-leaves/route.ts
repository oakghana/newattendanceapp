import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface ApprovedLeave {
  id: string
  leave_plan_request_id: string | null
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
  payment_amount: number | null
  payment_currency: string
}

export async function GET() {
  try {
    const admin = await createAdminClient()

    // Correct table is leave_payment_memos, approved status is 'reviewed_by_hr'
    // All fields are flat columns — no joins needed
    const { data, error } = await admin
      .from('leave_payment_memos')
      .select(`
        id,
        leave_plan_request_id,
        staff_name,
        staff_number,
        staff_id,
        staff_category,
        leave_period_start,
        leave_period_end,
        approved_days,
        status,
        signer_name,
        signer_id,
        hr_leave_office_name,
        memo_subject,
        payment_amount,
        payment_currency,
        created_at,
        forwarded_at,
        acknowledged_at
      `)
      .eq('status', 'reviewed_by_hr')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[v0] Error fetching approved leave memos:', error)
      return NextResponse.json({ error: 'Failed to fetch approved leaves' }, { status: 500 })
    }

    const approvedLeaves: ApprovedLeave[] = (data || []).map((record: any) => ({
      id: record.id,
      leave_plan_request_id: record.leave_plan_request_id,
      staff_name: record.staff_name || 'Unknown Staff',
      employee_id: record.staff_number || 'N/A',
      department: record.staff_category || 'General',
      // Clean up the memo_subject to extract a readable leave type
      leave_type: record.memo_subject
        ? record.memo_subject
            .replace(/leave memo/gi, '')
            .replace(/memo/gi, '')
            .replace(/[-:]/g, '')
            .trim() || 'Annual Leave'
        : 'Annual Leave',
      start_date: record.leave_period_start || '',
      end_date: record.leave_period_end || '',
      days_requested: record.approved_days || 0,
      status: record.status,
      // Prefer the signer name; fall back to the HR leave office name
      signed_by: record.signer_name || record.hr_leave_office_name || 'HR Executive',
      signed_at: record.forwarded_at || record.acknowledged_at || record.created_at,
      approval_date: record.created_at,
      payment_amount: record.payment_amount ?? null,
      payment_currency: record.payment_currency || 'GHS',
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
