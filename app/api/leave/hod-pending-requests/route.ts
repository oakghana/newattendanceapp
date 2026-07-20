import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function GET(request: NextRequest) {
  try {
    // Get all leave requests with pending HOD review status
    const { data: requests, error } = await supabase
      .from('leave_requests')
      .select(`
        id,
        user_id,
        leave_type,
        start_date,
        end_date,
        status,
        hod_review_status,
        created_at,
        user_profiles:user_id (
          id,
          first_name,
          last_name,
          employee_id,
          department_id
        )
      `)
      .eq('hod_review_status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[v0] HOD pending requests error:', error)
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    if (!requests) {
      return NextResponse.json({
        requests: [],
        total: 0,
      })
    }

    // Calculate days pending for each request
    const now = new Date()
    const enrichedRequests = requests.map((req: any) => {
      const createdDate = new Date(req.created_at)
      const daysPending = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Determine aging color
      let ageColor = 'green'
      if (daysPending > 7) ageColor = 'red'
      else if (daysPending > 3) ageColor = 'amber'
      
      return {
        ...req,
        daysPending,
        ageColor,
        staff_name: req.user_profiles ? `${req.user_profiles.first_name} ${req.user_profiles.last_name}` : 'N/A',
        department_id: req.user_profiles?.department_id || 'N/A',
      }
    })

    return NextResponse.json({
      requests: enrichedRequests,
      total: enrichedRequests.length,
    })
  } catch (err) {
    console.error('[v0] HOD pending requests error:', err)
    return NextResponse.json({ error: 'Internal server error', details: err }, { status: 500 })
  }
}
