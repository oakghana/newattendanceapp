import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const requestId = request.nextUrl.searchParams.get('request_id')
    
    if (!requestId) {
      return NextResponse.json({ error: 'request_id parameter required' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Find the leave_plan_request by ID
    const { data: leaveRequest, error: leaveError } = await admin
      .from('leave_plan_requests')
      .select('id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status')
      .eq('id', requestId)
      .single()

    if (leaveError || !leaveRequest) {
      console.error('[v0] Error fetching leave request:', leaveError)
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    // Check if it's HR approved
    if (leaveRequest.status !== 'hr_approved') {
      return NextResponse.json({ error: 'Leave request is not HR approved' }, { status: 403 })
    }

    // Fetch the corresponding leave_payment_memos record
    const { data: memo, error: memoError } = await admin
      .from('leave_payment_memos')
      .select('*')
      .eq('leave_plan_request_id', requestId)
      .single()

    if (memoError || !memo) {
      console.error('[v0] Error fetching leave memo:', memoError)
      return NextResponse.json({ error: 'Leave memo not found' }, { status: 404 })
    }

    // Fetch user profile for staff name
    const { data: userProfile, error: userError } = await admin
      .from('user_profiles')
      .select('first_name, last_name, employee_id, department_name')
      .eq('id', leaveRequest.user_id)
      .single()

    if (userError) {
      console.error('[v0] Error fetching user profile:', userError)
    }

    // Generate a simple HTML-to-PDF representation (or use a library if available)
    const staffName = userProfile
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
      : 'Unknown'
    const employeeId = userProfile?.employee_id || 'N/A'
    const department = userProfile?.department_name || 'N/A'
    const leaveType = leaveRequest.leave_type_key
      ? leaveRequest.leave_type_key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Leave'
    const startDate = new Date(leaveRequest.preferred_start_date).toLocaleDateString('en-GB')
    const endDate = new Date(leaveRequest.preferred_end_date).toLocaleDateString('en-GB')
    const daysRequested = leaveRequest.requested_days || 0
    const signerName = memo.signer_name || 'HR Executive'
    const memoDate = new Date(memo.created_at).toLocaleDateString('en-GB')

    // Create a simple text-based memo document as a downloadable file
    const memoContent = `
LEAVE MEMO
${'-'.repeat(80)}

Staff Information:
  Name: ${staffName}
  Employee ID: ${employeeId}
  Department: ${department}

Leave Details:
  Leave Type: ${leaveType}
  Period: ${startDate} to ${endDate}
  Duration: ${daysRequested} day(s)

Approval Information:
  Approved By: ${signerName}
  Approval Date: ${memoDate}
  Status: HR Approved & Signed

${'-'.repeat(80)}
Generated on: ${new Date().toLocaleString('en-GB')}
    `.trim()

    // Return as text file (or generate PDF if a library is available)
    return new NextResponse(memoContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="Leave_Memo_${staffName.replace(/\s+/g, '_')}_${new Date().getTime()}.txt"`,
      },
    })
  } catch (error) {
    console.error('[v0] Exception in download-memo API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
