import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// Roles that get auto-approval for carryover requests
const AUTO_APPROVE_ROLES = [
  'hod',
  'regional_manager',
  'director_hr',
  'manager_hr',
  'hr_staff',
  'leave_office',
  'super_admin',
  'admin',
]

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const { staff_id, leave_year, leave_type_key, requested_days, reason } = body

    if (!staff_id || !leave_year || !leave_type_key || requested_days === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get staff's role to determine approval workflow
    const { data: staffProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', staff_id)
      .single()

    const staffRole = staffProfile?.role || 'staff'
    const shouldAutoApprove = AUTO_APPROVE_ROLES.includes(staffRole.toLowerCase())

    // Get current balance
    const { data: latestTransaction } = await supabase
      .from('leave_balance_transactions')
      .select('running_balance')
      .eq('staff_id', staff_id)
      .eq('leave_year', leave_year)
      .eq('leave_type_key', leave_type_key)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const balance_available = latestTransaction?.running_balance || 0

    // Get policy for max carryover
    const { data: policy } = await supabase
      .from('forfeiture_policies')
      .select('max_carryover_days')
      .eq('leave_type_key', leave_type_key)
      .eq('leave_year', leave_year)
      .single()

    const max_carryover_allowed = policy?.max_carryover_days || 0
    const approved_days = Math.min(requested_days, max_carryover_allowed)

    // Determine initial status based on role
    const initialStatus = shouldAutoApprove ? 'APPROVED' : 'PENDING'

    // Create carryover request
    const { data, error } = await supabase
      .from('carryover_approval_requests')
      .insert({
        staff_id,
        leave_year,
        leave_type_key,
        balance_available,
        max_carryover_allowed,
        requested_carryover_days: requested_days,
        status: initialStatus,
        requested_by: staff_id,
        approval_note: reason,
        // If auto-approved, set approval fields
        ...(shouldAutoApprove && {
          approved_carryover_days: approved_days,
          reviewed_by: staff_id,
          reviewed_at: new Date().toISOString(),
          approval_reason: 'AUTO_APPROVED_BY_ROLE',
        }),
      })
      .select()
      .single()

    if (error) {
      console.error('[v0] Carryover submit error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // If auto-approved, also create the balance transaction for carryover
    if (shouldAutoApprove && approved_days > 0) {
      // Get the next leave year
      const [startYear] = leave_year.split('/').map(Number)
      const nextLeaveYear = `${startYear + 1}/${startYear + 2}`

      await supabase
        .from('leave_balance_transactions')
        .insert({
          staff_id,
          leave_year: nextLeaveYear,
          leave_type_key,
          transaction_type: 'carryover_in',
          days: approved_days,
          running_balance: approved_days,
          description: `Carryover from ${leave_year} (auto-approved for ${staffRole})`,
          carryover_request_id: data.id,
        })
    }

    return NextResponse.json({
      message: shouldAutoApprove 
        ? 'Carryover request auto-approved based on your role'
        : 'Carryover request submitted for HOD approval',
      carryover_request: data,
      auto_approved: shouldAutoApprove,
    })
  } catch (error: any) {
    console.error('[v0] Carryover submit error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit carryover request' },
      { status: 500 }
    )
  }
}
