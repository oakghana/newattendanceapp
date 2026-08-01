import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

export async function POST(request: NextRequest) {
  try {
    const { loan_request_id, hr_loan_office_memo, action } = await request.json()

    if (!loan_request_id) {
      return NextResponse.json({ error: 'loan_request_id is required' }, { status: 400 })
    }

    // Get current user from session
    const authHeader = request.headers.get('authorization')
    let userId = null

    if (authHeader) {
      const token = authHeader.split(' ')[1]
      const { data: userData } = await admin.auth.getUser(token)
      userId = userData?.user?.id
    }

    // Fetch the loan request to verify it exists and get current status
    const { data: loanRequest, error: fetchError } = await admin
      .from('loan_requests')
      .select('*')
      .eq('id', loan_request_id)
      .single()

    if (fetchError || !loanRequest) {
      return NextResponse.json({ error: 'Loan request not found' }, { status: 404 })
    }

    // Verify loan is in pending_hr_loan_office status
    if (loanRequest.status !== 'pending_hr_loan_office') {
      return NextResponse.json(
        { error: `Loan must be in pending_hr_loan_office status. Current status: ${loanRequest.status}` },
        { status: 400 }
      )
    }

    // Update loan status to awaiting_director_hr
    const { data: updatedLoan, error: updateError } = await admin
      .from('loan_requests')
      .update({
        status: 'awaiting_director_hr',
        hr_loan_office_processing_memo: hr_loan_office_memo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loan_request_id)
      .select()
      .single()

    if (updateError) {
      console.error('[v0] Error updating loan status:', updateError)
      return NextResponse.json({ error: 'Failed to update loan status', details: updateError.message }, { status: 500 })
    }

    // Log to loan_request_timeline for audit trail
    const { error: timelineError } = await admin
      .from('loan_request_timeline')
      .insert({
        loan_request_id: loan_request_id,
        actor_id: userId,
        actor_role: 'hr_loan_office',
        action_key: 'pushed_to_hr_executive',
        from_status: 'pending_hr_loan_office',
        to_status: 'awaiting_director_hr',
        note: `HR Loan Office pushed approved FD loan to HR Executive for signing and approval. Memo: ${hr_loan_office_memo}`,
      })

    if (timelineError) {
      console.warn('[v0] Timeline log error (non-critical):', timelineError)
    }

    return NextResponse.json({
      success: true,
      loan: updatedLoan,
      message: 'Loan pushed to HR Executive for signing. Will be forwarded to MD dashboard after HR Executive approval.',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    console.error('[v0] Push to HR Executive error:', errorMessage)
    return NextResponse.json(
      {
        error: 'Failed to push loan to HR Executive',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}
