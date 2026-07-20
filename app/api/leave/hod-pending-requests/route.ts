import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function GET(request: NextRequest) {
  try {
    // Query leave_plan_requests where HOD decision is pending (null or 'pending')
    const { data: requests, error } = await supabase
      .from('leave_plan_requests')
      .select(`
        id,
        user_id,
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days,
        adjusted_days,
        status,
        hod_decision,
        staff_category,
        created_at,
        submitted_at
      `)
      .or('hod_decision.is.null,hod_decision.eq.pending')
      .neq('status', 'rejected')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[v0] HOD pending requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const planRequests = requests || []

    // Enrich with user details from unified_user_management
    const userIds = [...new Set(planRequests.map((r: any) => r.user_id).filter(Boolean))]
    let userMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('unified_user_management')
        .select('user_id, full_name, department_name, position, employee_id')
        .in('user_id', userIds)
      if (users) {
        users.forEach((u: any) => { userMap[u.user_id] = u })
      }
    }

    // Calculate days pending and enrich with user details
    const now = new Date()
    const enrichedRequests = planRequests.map((req: any) => {
      const createdDate = new Date(req.submitted_at || req.created_at)
      const daysPending = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

      let ageColor = 'green'
      if (daysPending > 7) ageColor = 'red'
      else if (daysPending > 3) ageColor = 'amber'

      const user = userMap[req.user_id] || {}

      return {
        ...req,
        leave_type: req.leave_type_key || 'Annual',
        start_date: req.preferred_start_date,
        end_date: req.preferred_end_date,
        hod_review_status: req.hod_decision || 'pending',
        daysPending,
        ageColor,
        staff_name: user.full_name || 'Unknown',
        department_name: user.department_name || 'N/A',
        position: user.position || 'N/A',
        employee_id: user.employee_id || 'N/A',
        user_profiles: {
          first_name: (user.full_name || '').split(' ')[0] || '',
          last_name: (user.full_name || '').split(' ').slice(1).join(' ') || '',
          employee_id: user.employee_id || '',
          department_name: user.department_name || '',
          position: user.position || '',
        },
      }
    })

    return NextResponse.json({
      requests: enrichedRequests,
      total: enrichedRequests.length,
    })
  } catch (err) {
    console.error('[v0] HOD pending requests error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
