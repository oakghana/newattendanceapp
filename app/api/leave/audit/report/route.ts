import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const transactionType = searchParams.get('transaction_type')
    const leaveYear = searchParams.get('leave_year')
    const format = searchParams.get('format') || 'json' // json or csv

    let query = supabase
      .from('leave_balance_transactions')
      .select(`
        *,
        created_by_user:created_by (
          email,
          user_metadata
        ),
        approved_by_user:approved_by (
          email,
          user_metadata
        ),
        staff:staff_id (
          email,
          user_metadata
        )
      `)
      .order('created_at', { ascending: false })

    if (leaveYear) {
      query = query.eq('leave_year', leaveYear)
    }

    if (transactionType) {
      query = query.eq('transaction_type', transactionType)
    }

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString())
    }

    const { data, error } = await query.limit(10000)

    if (error) {
      console.error('[v0] Audit report fetch error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (format === 'csv') {
      // Convert to CSV
      const transactions = data || []
      const headers = [
        'Date',
        'Staff Email',
        'Leave Year',
        'Leave Type',
        'Transaction Type',
        'Days Change',
        'Running Balance',
        'Reason',
        'Notes',
        'Created By',
        'Approved By',
        'Approved At',
      ]

      const rows = transactions.map((t: any) => [
        new Date(t.created_at).toISOString(),
        t.staff?.email || '',
        t.leave_year,
        t.leave_type_key,
        t.transaction_type,
        t.days_change,
        t.running_balance,
        t.reason_code,
        t.notes,
        t.created_by_user?.email || '',
        t.approved_by_user?.email || '',
        t.approved_at ? new Date(t.approved_at).toISOString() : '',
      ])

      const csv = [
        headers.join(','),
        ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="leave-audit-report.csv"',
        },
      })
    }

    return NextResponse.json({
      transactions: data || [],
      total: (data || []).length,
    })
  } catch (error: any) {
    console.error('[v0] Audit report error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate audit report' },
      { status: 500 }
    )
  }
}
