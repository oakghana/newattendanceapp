import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function GET(request: NextRequest) {
  try {
    // Get all leave requests with HOD review status pending
    const { data: requests, error } = await supabase
      .from('leave_plan_requests')
      .select(`
        id,
        staff_id,
        staff_name,
        leave_type,
        start_date,
        end_date,
        hod_review_status,
        hod_reviewed_at,
        created_at,
        user_profiles:staff_id (
          first_name,
          last_name,
          employee_id,
          departments:department_id (
            name
          ),
          loan_hod_linkages:hod_id (
            id,
            name,
            employee_id
          )
        )
      `)
      .eq('hod_review_status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[v0] HOD pending requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate days pending for each request
    const now = new Date()
    const enrichedRequests = (requests || []).map((req: any) => {
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
      }
    })

    // Group by HOD
    const hodGroups = enrichedRequests.reduce((acc: any, req: any) => {
      const hodId = req.user_profiles?.loan_hod_linkages?.[0]?.id || 'unassigned'
      const hodName = req.user_profiles?.loan_hod_linkages?.[0]?.name || 'Unassigned'
      
      if (!acc[hodId]) {
        acc[hodId] = {
          hodId,
          hodName,
          requests: [],
          totalPending: 0,
          oldestDaysPending: 0,
        }
      }
      
      acc[hodId].requests.push(req)
      acc[hodId].totalPending += 1
      acc[hodId].oldestDaysPending = Math.max(acc[hodId].oldestDaysPending, req.daysPending)
      
      return acc
    }, {})

    return NextResponse.json({
      requests: enrichedRequests,
      hodGroups: Object.values(hodGroups),
      total: enrichedRequests.length,
    })
  } catch (err) {
    console.error('[v0] HOD pending requests error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
